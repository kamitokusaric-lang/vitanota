import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
  vpcCidr: string;
  githubOrg: string;
  githubRepo: string;
}

export class FoundationStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly appSecurityGroup: ec2.ISecurityGroup;
  public readonly rdsSecurityGroup: ec2.ISecurityGroup;
  public readonly githubActionsRole: iam.Role;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    const prefix = `${props.projectName}-${props.envName}`;

    // VPC
    // PRIVATE_ISOLATED のみ (RDS, db-migrator Lambda, AppRunner VPC Connector)
    // AppRunner の外向き通信は発生しない (Google OAuth は Lambda Proxy 経由で browser から、
    // Secrets Manager は VPC Interface Endpoint 経由)。そのため NAT / PUBLIC / IGW は不要。
    // 2026-04-22: PRIVATE_WITH_EGRESS + PUBLIC + NAT Instance を撤廃。
    const vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${prefix}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr),
      maxAzs: 2,
      // private-isolated を先頭で維持：既存 subnet の Logical ID と CIDR を保持する
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'private-isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });
    this.vpc = vpc;

    // App Runner → RDS 用セキュリティグループ
    this.appSecurityGroup = new ec2.SecurityGroup(this, 'AppSg', {
      vpc,
      securityGroupName: `${prefix}-app-sg`,
      description: 'App Runner VPC Connector',
      allowAllOutbound: false,
    });

    // RDS セキュリティグループ
    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      securityGroupName: `${prefix}-rds-sg`,
      description: 'RDS PostgreSQL',
      allowAllOutbound: false,
    });
    rdsSg.addIngressRule(this.appSecurityGroup, ec2.Port.tcp(5432), 'From App Runner (legacy isolated)');
    this.appSecurityGroup.addEgressRule(rdsSg, ec2.Port.tcp(5432), 'To RDS');
    this.appSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'To AWS APIs (incl. VPC Endpoints)');
    // VPC Endpoint 経由の HTTPS Ingress を許可（Lambda から Secrets Manager への応答）
    this.appSecurityGroup.addIngressRule(this.appSecurityGroup, ec2.Port.tcp(443), 'From self for VPC Endpoint');
    this.rdsSecurityGroup = rdsSg;

    // VPC Interface Endpoint: Secrets Manager
    // PRIVATE_ISOLATED Lambda（db-migrator）から Secrets Manager API に到達するため必須
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.appSecurityGroup],
      privateDnsEnabled: true,
    });

    // GitHub Actions OIDC プロバイダー
    const oidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    // GitHub Actions デプロイロール
    const ghActionsRole = new iam.Role(this, 'GitHubActionsRole', {
      roleName: `${prefix}-github-actions-role`,
      assumedBy: new iam.FederatedPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': [
              `repo:${props.githubOrg}/${props.githubRepo}:ref:refs/heads/main`,
              `repo:${props.githubOrg}/${props.githubRepo}:environment:production`,
            ],
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });
    this.githubActionsRole = ghActionsRole;

    // GitHub Actions: ECR 認証トークン取得（リソースは * 固定が AWS 仕様）
    ghActionsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrAuthToken',
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    // GitHub Actions: ECR push/pull（vitanota/app リポジトリに限定）
    ghActionsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EcrPush',
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
        'ecr:BatchGetImage',
      ],
      resources: [
        `arn:aws:ecr:${this.region}:${this.account}:repository/${props.projectName}/app`,
      ],
    }));

    // Permission Boundary（最小版）
    const boundary = new iam.ManagedPolicy(this, 'PermissionBoundary', {
      managedPolicyName: `${prefix}-permission-boundary`,
      statements: [
        new iam.PolicyStatement({
          sid: 'DenyIamEscalation',
          effect: iam.Effect.DENY,
          actions: [
            'iam:CreateUser',
            'iam:DeleteUser',
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:AttachRolePolicy',
            'iam:DetachRolePolicy',
            'iam:PutRolePolicy',
            'iam:DeleteRolePolicy',
            'iam:PutUserPolicy',
          ],
          resources: ['*'],
        }),
      ],
    });

    // 出力
    new cdk.CfnOutput(this, 'VpcId', { value: vpc.vpcId });
    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', { value: ghActionsRole.roleArn });
    new cdk.CfnOutput(this, 'PermissionBoundaryArn', { value: boundary.managedPolicyArn });
  }
}
