#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation-stack';
import { DataCoreStack } from '../lib/data-core-stack';
import { DataSharedStack } from '../lib/data-shared-stack';
import { AppStack } from '../lib/app-stack';
import { EdgeStack } from '../lib/edge-stack';

const app = new cdk.App();

const projectName = app.node.tryGetContext('projectName') as string;
const envName = app.node.tryGetContext('env') as string;
const region = app.node.tryGetContext('region') as string;
const alertEmail = app.node.tryGetContext('alertEmail') as string;
const domainName = app.node.tryGetContext('domainName') as string;
const githubOrg = app.node.tryGetContext('githubOrg') as string;
const githubRepo = app.node.tryGetContext('githubRepo') as string;
const vpcCidr = app.node.tryGetContext('vpcCidr') as string;
// Google OAuth Client ID は公開値。cdk.json で一元管理し App Runner / Lambda Proxy 両方へ注入。
// rotate 時は cdk.json の値を更新 → CDK deploy 先行 → GHA variable も同値に更新 → フロント再 build の順。
// 詳細手順: aidlc-docs/construction/auth-error-catalog.md 「文言の統一ルール」隣接セクション
const googleClientId = app.node.tryGetContext('googleClientId') as string;

const prefix = `${projectName}-${envName}`;
const env: cdk.Environment = { region, account: process.env.CDK_DEFAULT_ACCOUNT };

const foundation = new FoundationStack(app, `${prefix}-foundation`, {
  env,
  projectName,
  envName,
  vpcCidr,
  githubOrg,
  githubRepo,
});

const dataCore = new DataCoreStack(app, `${prefix}-data-core`, {
  env,
  projectName,
  envName,
  vpc: foundation.vpc,
  rdsSecurityGroup: foundation.rdsSecurityGroup,
});

const dataShared = new DataSharedStack(app, `${prefix}-data-shared`, {
  env,
  projectName,
  envName,
  googleClientId,
});

const appStack = new AppStack(app, `${prefix}-app`, {
  env,
  projectName,
  envName,
  vpc: foundation.vpc,
  appSecurityGroup: foundation.appSecurityGroup,
  rdsEndpoint: dataCore.rdsEndpoint,
  rdsPort: dataCore.rdsPort,
  rdsResourceId: dataCore.rdsResourceId,
  dbName: dataCore.dbName,
  rdsSecret: dataCore.rdsSecret,
  secrets: dataShared.secrets,
  ecrRepository: dataShared.ecrRepository,
  githubActionsRole: foundation.githubActionsRole,
  alertEmail,
  googleClientId,
  anthropicProxyUrl: dataShared.anthropicProxyUrl,
});

new EdgeStack(app, `${prefix}-edge`, {
  env: { region: 'us-east-1', account: process.env.CDK_DEFAULT_ACCOUNT },
  crossRegionReferences: true,
  projectName,
  envName,
  domainName,
  appRunnerUrl: appStack.appRunnerUrl,
});

app.synth();
