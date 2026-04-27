import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export interface Secrets {
  nextauthSecret: secretsmanager.ISecret;
  googleClientId: secretsmanager.ISecret;
  googleClientSecret: secretsmanager.ISecret;
  cloudfrontSecret: secretsmanager.ISecret;
  /** Anthropic API key (週次レポート AI 用)。Lambda Proxy が使う、AppRunner には渡さない */
  anthropicApiKey: secretsmanager.ISecret;
  /** AppRunner ↔ AnthropicProxy Lambda の認証用 shared secret (auto-generated) */
  anthropicProxySecret: secretsmanager.ISecret;
}

export interface DataSharedStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
  /** Google OAuth Client ID (public 値・cdk.json で一元管理) */
  googleClientId: string;
}

export class DataSharedStack extends cdk.Stack {
  public readonly secrets: Secrets;
  public readonly ecrRepository: ecr.IRepository;
  public readonly auditBucket: s3.IBucket;
  public readonly auditKmsKey: kms.IKey;
  /** AnthropicProxy Lambda の Function URL (AppRunner から呼出し) */
  public readonly anthropicProxyUrl: string;

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
      // CloudFront Distribution は us-east-1 固定のため、同 region にレプリカを配置して
      // edge-stack (us-east-1) から CFN dynamic reference で参照できるようにする。
      // primary (ap-northeast-1) で rotate すれば replica も自動追従。
      replicaRegions: [{ region: 'us-east-1' }],
    });

    // Anthropic API key (週次レポート AI 用)
    // 値は CDK deploy 後に手動設定: AWS Console → Secrets Manager → このシークレット → Retrieve secret value → Set
    // Lambda Proxy が使う (AppRunner には渡さない、VPC 内から外向き不可なので)
    const anthropicApiKey = new secretsmanager.Secret(this, 'AnthropicApiKey', {
      secretName: `${props.projectName}/anthropic-api-key`,
      description: 'Anthropic API key for weekly summary AI (used by AnthropicProxy Lambda)',
    });

    // AppRunner ↔ AnthropicProxy Lambda の認証用 shared secret (auto-generated 64 chars)
    // 両方が同じ secret を見ることで、Function URL (NONE auth) を直接叩かれても reject できる
    const anthropicProxySecret = new secretsmanager.Secret(this, 'AnthropicProxySecret', {
      secretName: `${props.projectName}/anthropic-proxy-secret`,
      description: 'Shared secret for AppRunner → AnthropicProxy Lambda authentication',
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });

    this.secrets = {
      nextauthSecret,
      googleClientId,
      googleClientSecret,
      cloudfrontSecret,
      anthropicApiKey,
      anthropicProxySecret,
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

    // ── Google Token Exchange Proxy (Lambda, VPC 外) ──
    // Browser は client_secret を保持できないため、Lambda 経由で Google /token を叩く。
    const googleTokenProxy = new lambda.Function(this, 'GoogleTokenProxy', {
      functionName: `${prefix}-google-token-proxy`,
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const https = require('https');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const sm = new SecretsManagerClient({});
let cachedSecret = null;

async function getClientSecret() {
  if (cachedSecret) return cachedSecret;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN }));
  cachedSecret = res.SecretString;
  return cachedSecret;
}

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function fetchToken(body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: 502, body: { error: 'invalid_google_response', raw: data } });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  // OPTIONS preflight は Function URL service が自動応答するため Lambda は呼ばれない。
  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch (e) {
    return resp(400, { error: 'invalid_json' });
  }

  const { code, codeVerifier } = parsed;
  if (!code || !codeVerifier) {
    return resp(400, { error: 'missing_params' });
  }

  const clientSecret = await getClientSecret();
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: process.env.REDIRECT_URI,
  });

  const googleRes = await fetchToken(params.toString());
  // 失敗時のみ Google 応答を CloudWatch に残す (成功時は id_token が含まれるため記録しない)
  if (googleRes.statusCode !== 200) {
    console.error('google_token_exchange_failed', {
      status: googleRes.statusCode,
      error: googleRes.body?.error,
      error_description: googleRes.body?.error_description,
      codeLen: code.length,
      verifierLen: codeVerifier.length,
      redirectUri: process.env.REDIRECT_URI,
    });
  }
  return resp(googleRes.statusCode, googleRes.body);
};
      `),
      environment: {
        SECRET_ARN: googleClientSecret.secretArn,
        GOOGLE_CLIENT_ID: props.googleClientId,
        REDIRECT_URI: 'https://vitanota.io/auth/google-callback',
      },
    });
    googleClientSecret.grantRead(googleTokenProxy);

    const googleTokenProxyUrl = googleTokenProxy.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['https://vitanota.io'],
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ['Content-Type'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // ── AnthropicProxy Lambda (VPC 外、AppRunner からインターネット呼出しを代行) ──
    // AppRunner は PRIVATE_ISOLATED VPC で外向き不可。Anthropic API への呼出しを
    // この Lambda 経由で行う。Google Token Proxy と同じパターン。
    const anthropicProxy = new lambda.Function(this, 'AnthropicProxy', {
      functionName: `${prefix}-anthropic-proxy`,
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const https = require('https');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const sm = new SecretsManagerClient({});
const apiKeyCache = { value: null };
const proxySecretCache = { value: null };

async function getCached(arn, cache) {
  if (cache.value) return cache.value;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  cache.value = res.SecretString;
  return cache.value;
}

function callAnthropic(apiKey, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: 502, body: { error: 'invalid_anthropic_response', raw: data } });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  // 共有 secret 認証 (Function URL は NONE auth なので、誰でも叩ける = AppRunner だけ通すために secret 必須)
  const expectedSecret = await getCached(process.env.PROXY_SECRET_ARN, proxySecretCache);
  const headerSecret =
    event.headers?.['x-anthropic-proxy-secret'] ||
    event.headers?.['X-Anthropic-Proxy-Secret'];
  if (headerSecret !== expectedSecret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_json' }) };
  }
  if (!parsed.model || !parsed.max_tokens || !Array.isArray(parsed.messages)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing_params' }) };
  }

  const apiKey = await getCached(process.env.API_KEY_ARN, apiKeyCache);
  const anthropicRes = await callAnthropic(apiKey, JSON.stringify(parsed));

  // 失敗時のみログ (成功時のレスポンスは記録しない、本人投稿が AI に渡るので残さない)
  if (anthropicRes.statusCode !== 200) {
    console.error('anthropic_call_failed', {
      status: anthropicRes.statusCode,
      error: anthropicRes.body?.error,
    });
  }

  return {
    statusCode: anthropicRes.statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(anthropicRes.body),
  };
};
      `),
      environment: {
        API_KEY_ARN: anthropicApiKey.secretArn,
        PROXY_SECRET_ARN: anthropicProxySecret.secretArn,
      },
    });
    anthropicApiKey.grantRead(anthropicProxy);
    anthropicProxySecret.grantRead(anthropicProxy);

    // CORS なし (AppRunner は server-to-server 呼出し、Origin header 無し)
    const anthropicProxyFnUrl = anthropicProxy.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
    this.anthropicProxyUrl = anthropicProxyFnUrl.url;

    // ── 出力 ──
    new cdk.CfnOutput(this, 'AuditBucketName', { value: this.auditBucket.bucketName });
    new cdk.CfnOutput(this, 'EcrRepositoryUri', { value: this.ecrRepository.repositoryUri });
    new cdk.CfnOutput(this, 'GoogleTokenProxyUrl', {
      value: googleTokenProxyUrl.url,
      description: 'Function URL for Google OAuth token exchange proxy',
    });
    new cdk.CfnOutput(this, 'AnthropicProxyUrl', {
      value: anthropicProxyFnUrl.url,
      description: 'Function URL for Anthropic API proxy (used by AppRunner)',
    });
  }
}
