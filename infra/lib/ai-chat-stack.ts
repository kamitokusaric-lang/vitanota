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
  /** Lambda の Reserved Concurrent Executions (コスト/暴走対策) */
  reservedConcurrency?: number;
}

export class AiChatStack extends cdk.Stack {
  public readonly extractFunction: lambdaNodejs.NodejsFunction;
  public readonly extractFunctionArn: string;

  constructor(scope: Construct, id: string, props: AiChatStackProps) {
    super(scope, id, props);

    const prefix = `${props.projectName}-${props.envName}`;
    const modelId =
      props.bedrockModelId ?? 'anthropic.claude-haiku-4-5-20251001-v1:0';

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

    // Bedrock InvokeModel は当該 Region の当該モデルのみ (最小権限)
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${modelId}`,
        ],
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
      reservedConcurrentExecutions: props.reservedConcurrency ?? 10,
      role,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        AWS_REGION_OVERRIDE: this.region,
        BEDROCK_MODEL_ID: modelId,
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
