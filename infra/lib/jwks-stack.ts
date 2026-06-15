// JWKS 恒久対策スタック (chimo 2026-06-15)。
//
// 本番ログイン検証は build 時焼き込み JWKS を使っていたため、Google 鍵ローテで陳腐化 →
// 全ログイン停止 (2026-06-13)。AppRunner は PRIVATE_ISOLATED + NAT 撤廃で実行時に外へ
// 出られないため createRemoteJWKSet は不可。代わりに「橋渡し役」を置く:
//   非 VPC Lambda が Google JWKS を取得・検証 → Secrets Manager に保管 →
//   AppRunner は既存の Secrets Manager VPC Endpoint 経由で読む。
// kid 不一致時は AppRunner がこの Lambda を on-demand invoke して即更新する
//   (app-stack で grantInvoke + env 配線)。
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export interface JwksStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
}

export class JwksStack extends cdk.Stack {
  public readonly refresherFunction: lambdaNodejs.NodejsFunction;
  public readonly jwksSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: JwksStackProps) {
    super(scope, id, props);
    const prefix = `${props.projectName}-${props.envName}`;

    // ── Secret (中身は Google の公開鍵・秘匿価値は低いが既存 VPC Endpoint 再利用のため SM) ──
    this.jwksSecret = new secretsmanager.Secret(this, 'GoogleJwksSecret', {
      secretName: `${prefix}/google-jwks`,
      description:
        'Google OAuth JWKS. Written by jwks-refresher Lambda, read by AppRunner verifyGoogleIdToken.',
    });

    // ── Refresher Lambda (非 VPC = インターネット可) ──
    const entry = path.join(__dirname, '../../scripts/jwks-refresher/handler.ts');
    const projectRootDir = path.join(__dirname, '../../scripts/jwks-refresher');
    this.refresherFunction = new lambdaNodejs.NodejsFunction(this, 'JwksRefresher', {
      functionName: `${prefix}-jwks-refresher`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      entry,
      projectRoot: projectRootDir,
      depsLockFilePath: path.join(projectRootDir, 'pnpm-lock.yaml'),
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        AWS_REGION_OVERRIDE: this.region,
        GOOGLE_JWKS_SECRET_ARN: this.jwksSecret.secretArn,
      },
      bundling: {
        // AWS SDK v3 は Node20 runtime に同梱されないため bundle する
        minify: true,
        sourceMap: true,
      },
    });

    // IAM: 当該 Secret への PutSecretValue のみに最小化 (認証の信頼根を絞る)
    this.refresherFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:PutSecretValue'],
        resources: [this.jwksSecret.secretArn],
      }),
    );

    // ── EventBridge: 定期ハートビート (6h)。緊急窓は kid 不一致トリガーが縛るので間隔は監視値 ──
    new events.Rule(this, 'JwksRefreshSchedule', {
      ruleName: `${prefix}-jwks-refresh`,
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      targets: [new targets.LambdaFunction(this.refresherFunction)],
    });

    // ── 監視: 既存 SNS アラートトピックへ (app-stack が作成済・ARN 参照で循環依存を避ける) ──
    const alertTopic = sns.Topic.fromTopicArn(
      this,
      'AlertTopic',
      `arn:aws:sns:${this.region}:${this.account}:${prefix}-alerts`,
    );

    // ① Lambda 失敗 (取得・検証・書込のいずれか) で即発火
    this.refresherFunction
      .metricErrors({ period: cdk.Duration.hours(1) })
      .createAlarm(this, 'JwksRefresherErrors', {
        alarmName: `${prefix}-jwks-refresher-errors`,
        alarmDescription: 'JWKS refresher Lambda errored (fetch/validate/put failed)',
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      })
      .addAlarmAction(new cwActions.SnsAction(alertTopic));

    // ② 8h 無 invocation = EventBridge 停止/サイレント死。Secret 老朽化を緊急前に検知
    this.refresherFunction
      .metricInvocations({ period: cdk.Duration.hours(8), statistic: 'Sum' })
      .createAlarm(this, 'JwksRefresherNoInvocations', {
        alarmName: `${prefix}-jwks-refresher-no-invocations`,
        alarmDescription: 'JWKS refresher had no invocations in 8h (schedule stopped?)',
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      })
      .addAlarmAction(new cwActions.SnsAction(alertTopic));

    new cdk.CfnOutput(this, 'JwksRefresherArn', {
      value: this.refresherFunction.functionArn,
      exportName: `${prefix}-jwks-refresher-arn`,
    });
    new cdk.CfnOutput(this, 'GoogleJwksSecretArn', {
      value: this.jwksSecret.secretArn,
      exportName: `${prefix}-google-jwks-secret-arn`,
    });
  }
}
