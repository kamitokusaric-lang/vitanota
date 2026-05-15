import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as path from 'node:path';
import type { Construct } from 'constructs';
import type { Secrets } from './data-shared-stack';

export interface AppStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
  vpc: ec2.IVpc;
  appSecurityGroup: ec2.ISecurityGroup;
  rdsEndpoint: string;
  rdsPort: string;
  rdsResourceId: string;
  dbName: string;
  rdsSecret: secretsmanager.ISecret;
  secrets: Secrets;
  ecrRepository: ecr.IRepository;
  githubActionsRole: iam.Role;
  alertEmail: string;
  /** Google OAuth Client ID (public 値・cdk.json で一元管理) */
  googleClientId: string;
  /** AI チャット整理 Lambda (AppRunner instance role から InvokeFunction する) */
  aiChatExtractFunction: lambda.IFunction;
  /** ENABLE_AI_CHAT_EXTRACTION env (false で機能 OFF、緊急停止スイッチ) */
  aiChatEnableExtraction: string;
  /** AI_CHAT_ALLOWLIST_TENANT_IDS env (CSV、空で全テナント ON、設定済で当該テナントのみ ON) */
  aiChatAllowlistTenantIds: string;
  /** AI_CHAT_RATE_LIMIT_PER_DAY env (Bedrock コスト保護、default '20') */
  aiChatRateLimitPerDay: string;
}

export class AppStack extends cdk.Stack {
  public readonly appRunnerUrl: string;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const prefix = `${props.projectName}-${props.envName}`;

    // ── SNS アラートトピック ──
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `${prefix}-alerts`,
      displayName: 'vitanota alerts',
    });
    alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(props.alertEmail)
    );

    // ── App Runner VPC コネクター ──
    // PRIVATE_ISOLATED に配置。App Runner は外向き通信を行わない (Google OAuth は Lambda Proxy
    // 経由で browser から、Secrets Manager は VPC Interface Endpoint 経由)。
    // NAT Instance / PRIVATE_WITH_EGRESS subnet は 2026-04-22 に撤廃。
    const vpcConnector = new apprunner.CfnVpcConnector(this, 'VpcConnector', {
      vpcConnectorName: `${prefix}-vpc-connector`,
      subnets: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      securityGroups: [props.appSecurityGroup.securityGroupId],
    });

    // ── App Runner インスタンスロール ──
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      roleName: `${prefix}-apprunner-instance-role`,
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });
    props.secrets.nextauthSecret.grantRead(instanceRole);
    props.secrets.googleClientId.grantRead(instanceRole);
    props.secrets.googleClientSecret.grantRead(instanceRole);
    props.secrets.cloudfrontSecret.grantRead(instanceRole);

    // RDS IAM 認証: vitanota_app ユーザーとしての接続のみ許可
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RdsIamConnect',
        actions: ['rds-db:connect'],
        resources: [
          `arn:aws:rds-db:${this.region}:${this.account}:dbuser:${props.rdsResourceId}/vitanota_app`,
        ],
      })
    );

    // CloudWatch Metrics 読み取り (system_admin 用 access-distribution dashboard 経由で
    // AWS/AppRunner Requests を時間帯別に集計する)。CW Metrics は resource-level 権限なし。
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchGetMetricData',
        actions: ['cloudwatch:GetMetricData'],
        resources: ['*'],
      })
    );

    // AI チャット整理 Lambda の invoke 権限 (AppRunner から pages/api/ai-chat/extract.ts 経由で呼ぶ)
    props.aiChatExtractFunction.grantInvoke(instanceRole);

    // ── App Runner アクセスロール（ECR pull 用） ──
    const accessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      roleName: `${prefix}-apprunner-access-role`,
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
    });
    props.ecrRepository.grantPull(accessRole);

    // ── App Runner サービス ──
    const service = new apprunner.CfnService(this, 'AppRunnerService', {
      serviceName: `${prefix}-app`,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: `${props.ecrRepository.repositoryUri}:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '3000',
            runtimeEnvironmentVariables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'AWS_REGION', value: props.env?.region ?? 'ap-northeast-1' },
              { name: 'RDS_PROXY_ENDPOINT', value: props.rdsEndpoint },
              { name: 'DB_USER', value: 'vitanota_app' },
              { name: 'DB_NAME', value: props.dbName },
              { name: 'E2E_TEST_MODE', value: 'false' },
              { name: 'DB_SSL', value: 'true' },
              // NextAuth.js: OAuth callback URL 生成に必須（本番ドメイン）
              { name: 'NEXTAUTH_URL', value: 'https://vitanota.io' },
              // NextAuth.js サーバサイド内部 fetch をコンテナ内 localhost に向ける
              // （public URL 経由の自己 fetch が VPC 外向きになる問題を回避）
              { name: 'NEXTAUTH_URL_INTERNAL', value: 'http://localhost:3000' },
              // 認証外部化: signin ページの SSR で Google Client ID を埋め込む
              // (Client ID 自体は公開情報・任意のユーザーが取得可能)
              // 値は cdk.json で一元管理 (3 重ハードコード解消、2026-04-22)
              { name: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID', value: props.googleClientId },
              // 認証外部化: /api/auth/google-signin で ID Token の aud を検証
              { name: 'GOOGLE_CLIENT_ID', value: props.googleClientId },
              // Next.js standalone が listen する hostname を 0.0.0.0 に強制。
              // AppRunner ランタイムがコンテナ起動時に HOSTNAME をコンテナの
              // 内部ホスト名（ip-x-x-x-x.*.compute.internal）で上書きするため、
              // runtimeEnvironmentVariables 経由で明示的に 0.0.0.0 に再上書きする必要がある。
              { name: 'HOSTNAME', value: '0.0.0.0' },
              // AI チャット整理機能 (Phase 1 コア体験、project_ai_chat_feature_flag.md)
              // ENABLE_AI_CHAT_EXTRACTION=false で緊急停止 (~3 分)
              { name: 'ENABLE_AI_CHAT_EXTRACTION', value: props.aiChatEnableExtraction },
              // ALLOWLIST 空 = 全テナント ON、CSV 設定で先行 ON テナント限定
              { name: 'AI_CHAT_ALLOWLIST_TENANT_IDS', value: props.aiChatAllowlistTenantIds },
              // 1 日あたりの上限 (Bedrock コスト保護)
              { name: 'AI_CHAT_RATE_LIMIT_PER_DAY', value: props.aiChatRateLimitPerDay },
              // AppRunner から InvokeFunction で呼び出す Lambda の ARN
              { name: 'AI_CHAT_LAMBDA_ARN', value: props.aiChatExtractFunction.functionArn },
            ],
            // CloudFront 迂回攻撃防御: middleware が X-CloudFront-Secret header を
            // CLOUDFRONT_SECRET env と照合し、不一致なら 403 返却。
            // CloudFront 側 (edge-stack) で同 secret の us-east-1 replica を dynamic ref で
            // 埋め込んでいるため、正しい CloudFront 経由リクエストは 200 で通過する。
            runtimeEnvironmentSecrets: [
              { name: 'CLOUDFRONT_SECRET', value: props.secrets.cloudfrontSecret.secretArn },
            ],
          },
        },
        autoDeploymentsEnabled: false,
      },
      instanceConfiguration: {
        cpu: '0.25 vCPU',
        memory: '0.5 GB',
        instanceRoleArn: instanceRole.roleArn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: 'VPC',
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/api/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 3,
      },
      autoScalingConfigurationArn: new apprunner.CfnAutoScalingConfiguration(
        this,
        'AutoScaling',
        {
          autoScalingConfigurationName: `${prefix}-autoscaling`,
          // AppRunner は minSize >= 1 必須（プロビジョニング済みインスタンス数）。
          // idle 時はアクティブインスタンスが 0 になりプロビジョニング分のみ課金される。
          minSize: 1,
          maxSize: 3,
          maxConcurrency: 100,
        }
      ).attrAutoScalingConfigurationArn,
    });

    this.appRunnerUrl = `https://${service.attrServiceUrl}`;

    // GitHub Actions に AppRunner デプロイ権限を付与（サービス ARN 限定）
    // Policy リソースを AppStack 側に配置することで Foundation→App の循環参照を回避
    new iam.Policy(this, 'GhActionsAppRunnerPolicy', {
      roles: [props.githubActionsRole],
      statements: [
        new iam.PolicyStatement({
          sid: 'AppRunnerUpdate',
          actions: ['apprunner:UpdateService', 'apprunner:DescribeService'],
          resources: [service.attrServiceArn],
        }),
      ],
    });

    // ── Lambda db-migrator ──
    const migratorRole = new iam.Role(this, 'MigratorRole', {
      roleName: `${prefix}-db-migrator-execute-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });
    // RDS master password を Secrets Manager から取得する権限
    props.rdsSecret.grantRead(migratorRole);

    const migratorEntry = path.join(__dirname, '../../scripts/db-migrator/handler.ts');
    const migratorProjectRoot = path.join(__dirname, '../../scripts/db-migrator');
    new lambdaNodejs.NodejsFunction(this, 'DbMigrator', {
      functionName: `${prefix}-db-migrator`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      entry: migratorEntry,
      projectRoot: migratorProjectRoot,
      depsLockFilePath: path.join(migratorProjectRoot, 'pnpm-lock.yaml'),
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      // AppRunner と同じ SG を共有することで RDS SG の既存 Ingress 設定を再利用
      securityGroups: [props.appSecurityGroup as ec2.ISecurityGroup],
      role: migratorRole,
      bundling: {
        // pg は純 JS なので esbuild でバンドル可能
        // migrations/*.sql を Lambda バンドルにコピー
        commandHooks: {
          beforeBundling(_inputDir: string, _outputDir: string): string[] {
            return [];
          },
          afterBundling(_inputDir: string, outputDir: string): string[] {
            // CDK ワークスペースルートから migrations をコピー（inputDir は projectRoot=scripts/db-migrator/）
            const migrationsSrc = path.join(__dirname, '../../migrations');
            return [`mkdir -p "${outputDir}/migrations" && cp "${migrationsSrc}/"*.sql "${outputDir}/migrations/"`];
          },
          beforeInstall(_inputDir: string, _outputDir: string): string[] {
            return [];
          },
        },
      },
      environment: {
        RDS_PROXY_ENDPOINT: props.rdsEndpoint,
        RDS_PROXY_PORT: props.rdsPort,
        DB_USER: 'vitanota',
        DB_NAME: props.dbName,
        DB_PASSWORD_SECRET_ARN: props.rdsSecret.secretArn,
        AWS_REGION_OVERRIDE: props.env?.region ?? 'ap-northeast-1',
        ENV: props.envName,
      },
    });

    // ── CloudWatch アラーム (5 個) ──
    const alarmAction = new cloudwatchActions.SnsAction(alertTopic);

    // 1. App Runner 5xx
    new cloudwatch.Alarm(this, 'Http5xxAlarm', {
      alarmName: `${prefix}-http-5xx`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/AppRunner',
        metricName: 'Http5xxCount',
        dimensionsMap: { ServiceName: `${prefix}-app` },
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(alarmAction);

    // 2. RDS CPU
    new cloudwatch.Alarm(this, 'RdsCpuAlarm', {
      alarmName: `${prefix}-rds-cpu-high`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: { DBInstanceIdentifier: `${prefix}-db` },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(alarmAction);

    // 3. App Runner メモリ
    new cloudwatch.Alarm(this, 'MemoryHighAlarm', {
      alarmName: `${prefix}-memory-high`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/AppRunner',
        metricName: 'MemoryUtilization',
        dimensionsMap: { ServiceName: `${prefix}-app` },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(alarmAction);

    // 4. PAM 認証失敗 (RDS IAM トークン関連の異常検知)
    //   2026-05-07 の本番障害（PAM auth failed の波 2 回）後に追加。
    //   App Runner application LogGroup を参照し、`PAM authentication failed` 文字列を
    //   含むログイベント数を 1 分粒度でメトリクス化。NextAuth DrizzleAdapter 経由の
    //   util.inspect 形式 (非 JSON) と pino 構造化ログのいずれにも literal で一致する。
    //   閾値 5/min は当該障害観測値（第一波 約 14/min・第二波 約 84/min）から逆算。
    const appRunnerLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      'AppRunnerApplicationLogGroup',
      `/aws/apprunner/${prefix}-app/${service.attrServiceId}/application`
    );

    const pamAuthFailedMetric = new logs.MetricFilter(this, 'PamAuthFailedFilter', {
      logGroup: appRunnerLogGroup,
      filterPattern: logs.FilterPattern.literal('"PAM authentication failed"'),
      metricNamespace: `${prefix}/auth`,
      metricName: 'PamAuthFailedCount',
      metricValue: '1',
      defaultValue: 0,
    });

    new cloudwatch.Alarm(this, 'PamAuthFailedAlarm', {
      alarmName: `${prefix}-pam-auth-failed`,
      alarmDescription: 'RDS IAM token 関連と思われる PAM 認証失敗バーストを検知',
      metric: pamAuthFailedMetric.metric({
        statistic: 'Sum',
        period: cdk.Duration.minutes(1),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ── Insights Saved Queries (PAM 障害解析用) ──
    // 波が再発した際に Console から 1 クリックで実行できるよう保存する。
    new logs.QueryDefinition(this, 'PamFailedTimelineQuery', {
      queryDefinitionName: `${prefix}/pam-failed-timeline`,
      logGroups: [appRunnerLogGroup],
      queryString: new logs.QueryString({
        fields: ['@timestamp', '@logStream', '@message'],
        filterStatements: ['@message like /PAM authentication failed/'],
        sort: '@timestamp asc',
        limit: 500,
      }),
    });

    new logs.QueryDefinition(this, 'PamFailedRatePerMinuteQuery', {
      queryDefinitionName: `${prefix}/pam-failed-rate-per-min`,
      logGroups: [appRunnerLogGroup],
      queryString: new logs.QueryString({
        filterStatements: ['@message like /PAM authentication failed/'],
        statsStatements: ['count() by bin(1m)'],
      }),
    });

    // db.client.connect / db.client.connect.failed 構造化ログから token_age を集計し
    // H5 (stale retention: 8〜15min 台が多数) と H4 (credential rotation: ms 台が多数) を
    // 分けるための本命クエリ。Phase 1 (成功時) + Phase 1.5 (失敗時) の双方を拾う。
    new logs.QueryDefinition(this, 'DbClientConnectAgeQuery', {
      queryDefinitionName: `${prefix}/db-client-connect-age`,
      logGroups: [appRunnerLogGroup],
      queryString: new logs.QueryString({
        fields: [
          '@timestamp',
          'event',
          'pool_client_id',
          'token_generation_id',
          'token_age_at_connect_ms',
          'connect_duration_ms',
          'err_code',
          'pool_total',
          'pool_idle',
          'pool_waiting',
        ],
        filterStatements: [
          'event = "db.client.connect" or event = "db.client.connect.failed"',
        ],
        sort: '@timestamp desc',
        limit: 500,
      }),
    });

    // 5. WAF ブロック数
    new cloudwatch.Alarm(this, 'WafBlockedAlarm', {
      alarmName: `${prefix}-waf-blocked`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: `${prefix}-waf`,
          Region: 'us-east-1',
          Rule: 'ALL',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 100,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    }).addAlarmAction(alarmAction);

    // ── 出力 ──
    new cdk.CfnOutput(this, 'AppRunnerUrl', { value: this.appRunnerUrl });
    new cdk.CfnOutput(this, 'AlertTopicArn', { value: alertTopic.topicArn });
  }
}
