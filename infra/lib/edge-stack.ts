import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export interface EdgeStackProps extends cdk.StackProps {
  projectName: string;
  envName: string;
  domainName: string;
  appRunnerUrl: string;
}

export class EdgeStack extends cdk.Stack {
  public readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    const prefix = `${props.projectName}-${props.envName}`;

    // ── Route53 ホストゾーン (既存をルックアップ) ──
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.domainName,
    });

    // CloudFront secret replica (us-east-1)。data-shared-stack の replicaRegions で
    // ap-northeast-1 primary から us-east-1 にレプリケートされたもの。
    // この edge-stack は us-east-1 にデプロイされるので same-region 参照として
    // CFN dynamic reference `{{resolve:secretsmanager:...}}` が解決する。
    //
    // ARN suffix (-i7ognX) は Secret 初期作成時に決まり、replica も同一 suffix を継承。
    // fromSecretNameV2 では CFN が name ベースで lookup する際に replica propagation 直後
    // だと ResourceNotFoundException が出るため、fromSecretCompleteArn で明示指定する。
    const cloudfrontSecretReplica = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'CloudFrontSecretReplica',
      `arn:aws:secretsmanager:us-east-1:${cdk.Aws.ACCOUNT_ID}:secret:${props.projectName}/cloudfront-secret-i7ognX`,
    );

    // ── ACM 証明書 (us-east-1 必須・DNS バリデーションは Route53 に自動投入) ──
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ── WAF v2 Web ACL ──
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `${prefix}-waf`,
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${prefix}-waf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-common`,
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-bad-inputs`,
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-sqli`,
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-ip-reputation`,
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 5,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-rate-limit`,
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // ── CloudFront ディストリビューション ──
    const appRunnerOriginDomain = props.appRunnerUrl
      .replace('https://', '')
      .replace(/\/$/, '');

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${prefix} distribution`,
      defaultBehavior: {
        origin: new origins.HttpOrigin(appRunnerOriginDomain, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          customHeaders: {
            // us-east-1 にある Secret レプリカを CFN dynamic reference で埋め込む。
            // ApRunner 側 middleware が process.env.CLOUDFRONT_SECRET と照合し、
            // 不一致 / 欠損なら 403 で拒否する (CloudFront 迂回攻撃の防御)。
            'X-CloudFront-Secret': cloudfrontSecretReplica.secretValue.unsafeUnwrap(),
          },
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        // AppRunner は Host ヘッダーがサービス URL と一致しないと 404 を返すため
        // client の Host (vitanota.io) を転送せず、origin デフォルトの hostname を使う
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      },
      certificate,
      domainNames: [props.domainName],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      webAclId: webAcl.attrArn,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    this.distributionDomainName = distribution.distributionDomainName;

    // ── Route53 Alias レコード (apex: vitanota.io → CloudFront) ──
    const aliasTarget = route53.RecordTarget.fromAlias(
      new targets.CloudFrontTarget(distribution),
    );
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: props.domainName,
      target: aliasTarget,
    });
    new route53.AaaaRecord(this, 'AliasRecordIpv6', {
      zone: hostedZone,
      recordName: props.domainName,
      target: aliasTarget,
    });

    // ── 出力 ──
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: certificate.certificateArn,
    });
  }
}
