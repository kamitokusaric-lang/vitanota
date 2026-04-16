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
});

const appStack = new AppStack(app, `${prefix}-app`, {
  env,
  projectName,
  envName,
  vpc: foundation.vpc,
  appSecurityGroup: foundation.appSecurityGroup,
  rdsEndpoint: dataCore.rdsEndpoint,
  rdsPort: dataCore.rdsPort,
  dbName: dataCore.dbName,
  secrets: dataShared.secrets,
  ecrRepository: dataShared.ecrRepository,
  alertEmail,
});

new EdgeStack(app, `${prefix}-edge`, {
  env: { region: 'us-east-1', account: process.env.CDK_DEFAULT_ACCOUNT },
  crossRegionReferences: true,
  projectName,
  envName,
  domainName,
  appRunnerUrl: appStack.appRunnerUrl,
  cloudfrontSecretHeaderValue: dataShared.secrets.cloudfrontSecret,
});

app.synth();
