// Unit-05: AI チャット整理 Lambda スタック (chimo 2026-05-13 確定)
//
// Lambda Function URL は今日は付けない (本日は LOCAL_MOCK でローカル動作確認のみ)。
// 本番デプロイ後、AppRunner 側 (app-stack) から lambda.InvokeFunction で呼び出す
// 設計。AppRunner instance role に対する InvokeFunction grant は別 PR で配線する。
//
// Bedrock InvokeModel は Claude Haiku 4.5 のみ許可 (chimo 2026-05-11 AI モデル合意)。
// 本番フラグ ON は ENABLE_AI_CHAT_EXTRACTION env で AppRunner 側で制御 (緊急停止 ~3 分)。

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface AiChatStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
  /** Bedrock のモデル ID。デフォルトは Claude Haiku 4.5 (ap-northeast-1) */
  bedrockModelId?: string;
  /** Lambda の Reserved Concurrent Executions (省略で Unreserved pool 共有) */
  reservedConcurrency?: number;
}

export class AiChatStack extends cdk.Stack {
  public readonly extractFunction: lambdaNodejs.NodejsFunction;
  public readonly extractFunctionArn: string;

  constructor(scope: Construct, id: string, props: AiChatStackProps) {
    super(scope, id, props);

    const prefix = `${props.projectName}-${props.envName}`;
    // Claude Haiku 4.5 は on-demand foundation model invoke 不可 (ValidationException)。
    // ap-northeast-1 では JP inference profile を経由する必要がある (Tokyo region 内完結、
    // データ国外送信なし、コストは同額)。
    const inferenceProfileId =
      props.bedrockModelId ?? 'jp.anthropic.claude-haiku-4-5-20251001-v1:0';
    const foundationModelId = 'anthropic.claude-haiku-4-5-20251001-v1:0';

    // ── IAM Role ──
    const role = new iam.Role(this, 'AiChatExtractRole', {
      roleName: `${prefix}-ai-chat-extract-execute-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    // Bedrock InvokeModel: inference profile + その配下の foundation model 全 region に必要。
    // JP profile は ap-northeast-1 (Tokyo) と ap-northeast-3 (Osaka) の Haiku 4.5 にルーティングする
    // (Japan 内冗長化、データは国内完結)。両方の foundation model ARN に許可が必須。
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${inferenceProfileId}`,
          `arn:aws:bedrock:ap-northeast-1::foundation-model/${foundationModelId}`,
          `arn:aws:bedrock:ap-northeast-3::foundation-model/${foundationModelId}`,
        ],
      }),
    );

    // AWS Marketplace: Bedrock が初回 model 使用時に内部で Marketplace subscription を実行するため必要。
    // resources は "*" (Marketplace の subscription は global、ARN レベルで絞り込み不可)。
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'aws-marketplace:ViewSubscriptions',
          'aws-marketplace:Subscribe',
        ],
        resources: ['*'],
      }),
    );

    // ── Lambda ──
    const lambdaEntry = path.join(
      __dirname,
      '../../scripts/ai-chat-extract/handler.ts',
    );
    const lambdaProjectRoot = path.join(__dirname, '../../scripts/ai-chat-extract');

    this.extractFunction = new lambdaNodejs.NodejsFunction(this, 'AiChatExtract', {
      functionName: `${prefix}-ai-chat-extract`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      entry: lambdaEntry,
      projectRoot: lambdaProjectRoot,
      depsLockFilePath: path.join(lambdaProjectRoot, 'pnpm-lock.yaml'),
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      // Reserved concurrency は本番アカウントの limit と衝突しやすいので省略 (Unreserved pool 共有)。
      // 必要なら CDK context `reservedConcurrency` で明示指定可能。
      ...(props.reservedConcurrency !== undefined
        ? { reservedConcurrentExecutions: props.reservedConcurrency }
        : {}),
      role,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        AWS_REGION_OVERRIDE: this.region,
        // inference profile id を渡す (Claude Haiku 4.5 は profile 経由必須)
        BEDROCK_MODEL_ID: inferenceProfileId,
        // Lambda 側の MOCK 機構。本番は false 固定、開発時のみ true で AWS 接続をスキップ。
        MOCK_BEDROCK: 'false',
        ENV: props.envName,
      },
      bundling: {
        // AWS SDK v3 は Node 20.x runtime に同梱されないので bundle する。
        // (Lambda 内で明示的に @aws-sdk/client-bedrock-runtime を import)
        minify: true,
        sourceMap: true,
      },
    });

    this.extractFunctionArn = this.extractFunction.functionArn;

    new cdk.CfnOutput(this, 'ExtractFunctionArn', {
      value: this.extractFunction.functionArn,
      description: 'AppRunner 側で AI_CHAT_LAMBDA_ARN に渡す',
      exportName: `${prefix}-ai-chat-extract-arn`,
    });
  }
}
