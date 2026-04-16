import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import type { Construct } from 'constructs';
import type { Secrets } from './data-shared-stack';

export interface AppStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
  vpc: ec2.IVpc;
  appSecurityGroup: ec2.ISecurityGroup;
  rdsEndpoint: string;
  rdsPort: string;
  dbName: string;
  secrets: Secrets;
  ecrRepository: ecr.IRepository;
  alertEmail: string;
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
          minSize: 0,
          maxSize: 3,
          maxConcurrency: 100,
        }
      ).attrAutoScalingConfigurationArn,
    });

    this.appRunnerUrl = `https://${service.attrServiceUrl}`;

    // ── Lambda db-migrator ──
    const migratorRole = new iam.Role(this, 'MigratorRole', {
      roleName: `${prefix}-db-migrator-execute-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    new lambda.Function(this, 'DbMigrator', {
      functionName: `${prefix}-db-migrator`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../scripts/db-migrator'),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      role: migratorRole,
      environment: {
        RDS_PROXY_ENDPOINT: props.rdsEndpoint,
        DB_USER: 'vitanota',
        DB_NAME: props.dbName,
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

    // 4. 認証エラー — CloudWatch Logs メトリクスフィルタ経由
    // App Runner のログが CloudWatch に自動転送される前提
    // Phase 1 ではカスタムメトリクスの設定が複雑なため、5xx アラームで代替
    // → Phase 2 で CloudWatch Logs Insights のクエリベースアラームに置換

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
