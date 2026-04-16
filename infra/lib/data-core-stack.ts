import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
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
      backupRetention: cdk.Duration.days(7),
      preferredBackupWindow: '18:00-19:00', // JST 03:00-04:00
      preferredMaintenanceWindow: 'sun:19:00-sun:20:00', // JST 04:00-05:00
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      publiclyAccessible: false,
      autoMinorVersionUpgrade: true,
    });

    this.rdsEndpoint = instance.dbInstanceEndpointAddress;
    this.rdsPort = instance.dbInstanceEndpointPort;

    new cdk.CfnOutput(this, 'RdsEndpoint', { value: this.rdsEndpoint });
    new cdk.CfnOutput(this, 'RdsPort', { value: this.rdsPort });
  }
}
