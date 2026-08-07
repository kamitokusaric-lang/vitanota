#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation-stack';
import { DataCoreStack } from '../lib/data-core-stack';
import { DataSharedStack } from '../lib/data-shared-stack';
import { AppStack } from '../lib/app-stack';
import { EdgeStack } from '../lib/edge-stack';
import { AiChatStack } from '../lib/ai-chat-stack';
import { JwksStack } from '../lib/jwks-stack';

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

// AiChatStack を AppStack より先に作る (AppStack 内で extractFunction を参照するため)
const aiChatStack = new AiChatStack(app, `${prefix}-ai-chat`, {
  env,
  projectName,
  envName,
});

// JwksStack も AppStack より先に作る (AppStack が refresherFunction / jwksSecret を参照するため)
const jwksStack = new JwksStack(app, `${prefix}-jwks`, {
  env,
  projectName,
  envName,
});

// テナント単位 allowlist (例: chimo テナント先行 ON 用)
// 空文字なら ALLOWLIST 未設定 = 全テナント ON (= ENABLE_AI_CHAT_EXTRACTION 単独評価)
const aiChatAllowlistTenantIds =
  (app.node.tryGetContext('aiChatAllowlistTenantIds') as string | undefined) ??
  '';
// chimo 2026-05-17: prod 環境では default 'true' (= 本番値) に固定。
// 経緯: 2026-05-14 事故で context 未指定 cdk deploy が本番 AppRunner env を
// 'false' に上書きして AI 機能停止した。context 渡し忘れ防御として
// fallback default を環境別に分ける。
// false に戻したいとき (AI 機能を全 OFF にしたいとき) の手順:
//   1. cdk deploy で明示的に context を渡す: -c aiChatEnableExtraction=false
//   2. または本ファイルの prod 分岐を 'false' に変更してデプロイ
// 詳細経緯: post-mvp-backlog.md「AI 機能フラグ default の経緯」セクション
const aiChatEnableExtraction =
  ((app.node.tryGetContext('aiChatEnableExtraction') as string | undefined) ??
    (envName === 'prod' ? 'true' : 'false'));
const aiChatRateLimitPerDay =
  ((app.node.tryGetContext('aiChatRateLimitPerDay') as string | undefined) ??
    '20');
// ふりかえり→AIリコメンド master flag。aiChatEnableExtraction と同型で prod は default 'true' に固定
// (context 渡し忘れで本番 env が false 上書きされる事故を防ぐ)。allowlist は AI チャットと共有。
// OFF に戻すとき: -c retroRecommendEnable=false
const retroRecommendEnable =
  ((app.node.tryGetContext('retroRecommendEnable') as string | undefined) ??
    (envName === 'prod' ? 'true' : 'false'));
// 研修 (workshop) master flag。aiChatEnableExtraction と同型で prod は default 'true' に固定
// (context 渡し忘れで本番 env が false 上書きされ、研修当日に機能が消える事故を防ぐ)。
// OFF に戻すとき: -c workshopEnable=false
const workshopEnable =
  ((app.node.tryGetContext('workshopEnable') as string | undefined) ??
    (envName === 'prod' ? 'true' : 'false'));
// 研修専用 allowlist (AI チャットとは共有しない)。
// 空文字だと「全テナント ON」の意味になり、研修が他校にも出てしまう。
// そのためニセコ中の tenant_id は cdk.json context に固定してある (渡し忘れ防御)。
const workshopAllowlistTenantIds =
  (app.node.tryGetContext('workshopAllowlistTenantIds') as string | undefined) ??
  '';

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
  aiChatExtractFunction: aiChatStack.extractFunction,
  aiChatEnableExtraction,
  aiChatAllowlistTenantIds,
  aiChatRateLimitPerDay,
  retroRecommendEnable,
  workshopEnable,
  workshopAllowlistTenantIds,
  jwksRefresherFunction: jwksStack.refresherFunction,
  googleJwksSecret: jwksStack.jwksSecret,
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
