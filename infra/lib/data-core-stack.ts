import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import type { Construct } from 'constructs';

export interface DataCoreStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
  vpc: ec2.IVpc;
  rdsSecurityGroup: ec2.ISecurityGroup;
}

export class DataCoreStack extends cdk.Stack {
  public readonly rdsEndpoint: string;
  public readonly rdsPort: string;
  public readonly dbName: string;

  constructor(scope: Construct, id: string, props: DataCoreStackProps) {
    super(scope, id, props);

    const prefix = `${props.projectName}-${props.envName}`;
    this.dbName = 'vitanota';

    // RDS PostgreSQL 16 — Phase 1: t4g.micro 単一 AZ
    const instance = new rds.DatabaseInstance(this, 'Rds', {
      instanceIdentifier: `${prefix}-db`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.rdsSecurityGroup],
      databaseName: this.dbName,
      credentials: rds.Credentials.fromGeneratedSecret('vitanota', {
        secretName: `${prefix}/rds-master-password`,
      }),
      multiAz: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      // Free Tier 期間中（アカウント作成から 12 ヶ月）は 20GB バックアップ枠制限のため 1 日に短縮
      // 実効的な 7 日復旧ウィンドウは SnapshotManager Lambda（下記）の手動 snapshot で確保する
      backupRetention: cdk.Duration.days(1),
      preferredBackupWindow: '18:00-19:00', // JST 03:00-04:00
      preferredMaintenanceWindow: 'sun:19:00-sun:20:00', // JST 04:00-05:00
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      publiclyAccessible: false,
      autoMinorVersionUpgrade: true,
    });

    this.rdsEndpoint = instance.dbInstanceEndpointAddress;
    this.rdsPort = instance.dbInstanceEndpointPort;

    // ── Snapshot Manager Lambda ──
    // 日次で manual snapshot を作成し、7 日以上古いものを削除する
    // Free Tier 制約下で実効的な 7 日復旧ウィンドウを確保
    const snapshotManager = new lambda.Function(this, 'SnapshotManager', {
      functionName: `${prefix}-snapshot-manager`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        DB_INSTANCE_ID: `${prefix}-db`,
        SNAPSHOT_PREFIX: `${prefix}-manual-`,
        RETENTION_DAYS: '7',
      },
      code: lambda.Code.fromInline(`
const { RDSClient, CreateDBSnapshotCommand, DescribeDBSnapshotsCommand, DeleteDBSnapshotCommand } = require('@aws-sdk/client-rds');

const rds = new RDSClient({});

exports.handler = async () => {
  const dbInstanceId = process.env.DB_INSTANCE_ID;
  const prefix = process.env.SNAPSHOT_PREFIX;
  const retentionDays = parseInt(process.env.RETENTION_DAYS, 10);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const snapshotId = \`\${prefix}\${today}\`;

  // Create today's snapshot (idempotent: unique per day)
  try {
    await rds.send(new CreateDBSnapshotCommand({
      DBInstanceIdentifier: dbInstanceId,
      DBSnapshotIdentifier: snapshotId,
    }));
    console.log(JSON.stringify({ action: 'create', snapshotId, status: 'ok' }));
  } catch (err) {
    if (err.name === 'DBSnapshotAlreadyExistsFault') {
      console.log(JSON.stringify({ action: 'create', snapshotId, status: 'skip_exists' }));
    } else {
      throw err;
    }
  }

  // Delete snapshots older than retention window
  const { DBSnapshots = [] } = await rds.send(new DescribeDBSnapshotsCommand({
    DBInstanceIdentifier: dbInstanceId,
    SnapshotType: 'manual',
  }));

  const cutoff = Date.now() - retentionDays * 86400000;
  const toDelete = DBSnapshots.filter(s =>
    s.DBSnapshotIdentifier.startsWith(prefix) &&
    s.SnapshotCreateTime &&
    new Date(s.SnapshotCreateTime).getTime() < cutoff &&
    s.Status === 'available'
  );

  const deleted = [];
  for (const s of toDelete) {
    await rds.send(new DeleteDBSnapshotCommand({ DBSnapshotIdentifier: s.DBSnapshotIdentifier }));
    deleted.push(s.DBSnapshotIdentifier);
  }
  console.log(JSON.stringify({ action: 'delete', count: deleted.length, ids: deleted }));

  return { created: snapshotId, deleted };
};
      `),
    });

    // RDS snapshot 操作権限（インスタンス・manual snapshot リソース限定）
    snapshotManager.addToRolePolicy(new iam.PolicyStatement({
      sid: 'RdsSnapshotWrite',
      actions: [
        'rds:CreateDBSnapshot',
        'rds:DeleteDBSnapshot',
        'rds:AddTagsToResource',
      ],
      resources: [
        `arn:aws:rds:${this.region}:${this.account}:db:${prefix}-db`,
        `arn:aws:rds:${this.region}:${this.account}:snapshot:${prefix}-manual-*`,
      ],
    }));
    // Describe は全 snapshot を検索するため resource * が必要（AWS 仕様）
    snapshotManager.addToRolePolicy(new iam.PolicyStatement({
      sid: 'RdsSnapshotRead',
      actions: ['rds:DescribeDBSnapshots'],
      resources: ['*'],
    }));

    // ── EventBridge: 毎日 JST 03:00 (UTC 18:00) に実行 ──
    new events.Rule(this, 'SnapshotSchedule', {
      ruleName: `${prefix}-snapshot-daily`,
      schedule: events.Schedule.cron({ minute: '0', hour: '18' }),
      targets: [new eventsTargets.LambdaFunction(snapshotManager)],
    });

    new cdk.CfnOutput(this, 'RdsEndpoint', { value: this.rdsEndpoint });
    new cdk.CfnOutput(this, 'RdsPort', { value: this.rdsPort });
    new cdk.CfnOutput(this, 'SnapshotManagerArn', { value: snapshotManager.functionArn });
  }
}
