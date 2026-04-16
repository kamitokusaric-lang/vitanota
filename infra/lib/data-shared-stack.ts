import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export interface Secrets {
  nextauthSecret: secretsmanager.ISecret;
  googleClientId: secretsmanager.ISecret;
  googleClientSecret: secretsmanager.ISecret;
  cloudfrontSecret: secretsmanager.ISecret;
}

export interface DataSharedStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
}

export class DataSharedStack extends cdk.Stack {
  public readonly secrets: Secrets;
  public readonly ecrRepository: ecr.IRepository;
  public readonly auditBucket: s3.IBucket;
  public readonly auditKmsKey: kms.IKey;

  constructor(scope: Construct, id: string, props: DataSharedStackProps) {
    super(scope, id, props);

    const prefix = `${props.projectName}-${props.envName}`;

    // ── Secrets Manager ──
    const nextauthSecret = new secretsmanager.Secret(this, 'NextAuthSecret', {
      secretName: `${props.projectName}/nextauth-secret`,
      description: 'NextAuth session signing key',
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });

    const googleClientId = new secretsmanager.Secret(this, 'GoogleClientId', {
      secretName: `${props.projectName}/google-client-id`,
      description: 'Google OAuth client ID (set manually)',
    });

    const googleClientSecret = new secretsmanager.Secret(this, 'GoogleClientSecret', {
      secretName: `${props.projectName}/google-client-secret`,
      description: 'Google OAuth client secret (set manually)',
    });

    const cloudfrontSecret = new secretsmanager.Secret(this, 'CloudFrontSecret', {
      secretName: `${props.projectName}/cloudfront-secret`,
      description: 'CloudFront → App Runner origin verification header',
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });

    this.secrets = {
      nextauthSecret,
      googleClientId,
      googleClientSecret,
      cloudfrontSecret,
    };

    // ── KMS (監査ログ暗号化) ──
    this.auditKmsKey = new kms.Key(this, 'AuditKmsKey', {
      alias: `${prefix}-audit-kms`,
      description: 'Audit log encryption key',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── S3 監査ログバケット ──
    this.auditBucket = new s3.Bucket(this, 'AuditBucket', {
      bucketName: `${prefix}-audit-logs`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.auditKmsKey,
      versioned: true,
      objectLockEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'glacier-after-1y',
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
        {
          id: 'deep-archive-after-3y',
          transitions: [
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(1095),
            },
          ],
        },
      ],
    });

    // ── ECR ──
    this.ecrRepository = new ecr.Repository(this, 'EcrRepo', {
      repositoryName: `${props.projectName}/app`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          description: 'Keep last 30 images',
          maxImageCount: 30,
          rulePriority: 1,
        },
      ],
    });

    // ── 出力 ──
    new cdk.CfnOutput(this, 'AuditBucketName', { value: this.auditBucket.bucketName });
    new cdk.CfnOutput(this, 'EcrRepositoryUri', { value: this.ecrRepository.repositoryUri });
  }
}
