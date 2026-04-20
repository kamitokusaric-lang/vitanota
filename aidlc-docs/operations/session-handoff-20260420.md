# セッション引き継ぎ (2026-04-20 深夜時点)

**作成理由**: 認証フローのトラブルシュートが続き状態が複雑化したため、一旦セッションを切っても再開できるようにスナップショットを取る。

**次のアクション**: **Lambda Proxy (Google Token Exchange) の実装**

---

## 🎯 現在地 One-Liner

> 認証外部化設計で PKCE + Authorization Code Flow を実装したが、Google の "Web application" クライアントタイプが client_secret を要求するため token exchange が 400 で失敗。Lambda Proxy パターンで解決する方針を決定。実装前にセッション整理中。

---

## 何が動いていて、何が動いていないか

### ✅ 動作確認済み

| 項目 | 状態 | 検証方法 |
|---|---|---|
| CloudFront → AppRunner 経路 | ✅ 稼働 | `curl https://vitanota.io/api/health` → 200 |
| AppRunner コンテナ | ✅ RUNNING | `prod-eb7fa29` image (最新) |
| RDS + db-migrator Lambda | ✅ 12 migration 適用済 | 過去に検証済 |
| snapshot-manager Lambda | ✅ 日次実行中 | EventBridge rule ENABLED |
| CI/CD (GitHub Actions) | ✅ Full pipeline 正常 | 直近 5 回連続成功 |
| Google OAuth 認可画面 | ✅ 表示・認証成功 | Browser → Google 直接通信 OK |
| Browser → Google /token | ❌ **400 エラー** | `"error": "invalid_request", "error_description": "client_secret is missing."` |

### 🔴 現在の詰まり箇所

**Browser → Google `/token` エンドポイントの POST が 400**。
- `client_secret` を含めていない（PKCE flow 前提で省略した）
- Google の "Web application" クライアントは PKCE 併用でも client_secret 必須
- この壁は設計変更でしか越えられない

### ⚠️ 遺物・orphan

| リソース | 問題 | 対処方針 |
|---|---|---|
| NAT Instance (`i-05a89c46ca4878612`) | userData の iptables 設定が機能していない可能性・だが現在は使われていない | 認証外部化が完成してからクリーンアップで削除 |
| 旧 AppRunner VPC Connector (`vitanota-prod-vpc-connector`) | CFN 管理外で残存 | 同上 |
| `vitanota/google-client-secret` Secret | 現在未使用 | **Lambda Proxy で使うため、削除予定を撤回して保持** |

---

## 決定事項の時系列（最重要のみ）

1. **認証外部化方針採択** — AppRunner が VPC 内で Google への外向き通信不可のため
2. **NextAuth Google Provider 削除** — 自前の `/api/auth/google-signin` エンドポイント + Credentials 的なセッション発行
3. **JWKS をバンドル** — Docker build 時に Google 公開鍵を焼き込み
4. **Implicit Flow (response_type=id_token) 却下** — fragment 内 `//` で Next.js router が詰まる
5. **Authorization Code Flow + PKCE 採択** — 近代的・query string ベース
6. **`NEXT_PUBLIC_GOOGLE_CLIENT_ID` を Docker build-arg で注入** — Next.js の client 側埋め込み仕様に対応
7. **useEffect 二重実行の useRef ガード** — sessionStorage 先行削除を防止
8. **Lambda Proxy 方針決定** (本稿) — client_secret を server 側に閉じ込めつつ NAT を避ける

---

## アーキテクチャ構成 (現状 → 目標)

### 現状（Lambda Proxy 未実装）

```
[Browser]
  ├─ signin: PKCE verifier/challenge 生成 → Google /authorize へ redirect
  ├─ Google で認証・同意
  ├─ callback: code 受取
  └─ Browser → Google /token 直接 POST ← 🔴 400 client_secret missing

[AppRunner] (VPC 内・Google と通信なし・既に準備完了)
  /api/auth/google-signin: id_token 受取 → JWKS 検証 → sessions INSERT
```

### 目標（Lambda Proxy 実装後）

```
[Browser]
  ├─ signin: PKCE verifier/challenge 生成 → Google /authorize へ redirect
  ├─ Google で認証・同意
  ├─ callback: code 受取
  └─ Browser → Lambda Function URL へ POST (code + verifier)

[Lambda vitanota-prod-google-token-proxy] (VPC 外・新規追加)
  ├─ Secrets Manager から client_secret 取得
  ├─ Google /token へ POST (client_id + client_secret + code + verifier)
  └─ id_token を Browser へ返却

[Browser]
  └─ POST /api/auth/google-signin with id_token (既存・無変更)

[AppRunner] (変更なし)
  JWKS でローカル検証 → sessions INSERT
```

---

## Lambda Proxy 実装タスクの詳細

### CDK 変更

`infra/lib/data-shared-stack.ts` に追記:

```typescript
const googleTokenProxy = new lambda.Function(this, 'GoogleTokenProxy', {
  functionName: `${prefix}-google-token-proxy`,
  runtime: lambda.Runtime.NODEJS_20_X,
  memorySize: 128,
  timeout: Duration.seconds(10),
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

    exports.handler = async (event) => {
      // CORS preflight
      if (event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders(), body: '' };
      }

      const body = JSON.parse(event.body || '{}');
      const { code, codeVerifier } = body;
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
      return resp(googleRes.statusCode, googleRes.body);
    };

    function fetchToken(body) {
      return new Promise((resolve, reject) => {
        const req = https.request('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
        });
        req.on('error', reject);
        req.write(body); req.end();
      });
    }

    function corsHeaders() {
      return {
        'Access-Control-Allow-Origin': 'https://vitanota.io',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600',
      };
    }

    function resp(statusCode, body) {
      return { statusCode, headers: { ...corsHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    }
  `),
  environment: {
    SECRET_ARN: googleClientSecret.secretArn,
    GOOGLE_CLIENT_ID: '624139713607-el3sq55ninu8nsr394d8eiam7fjghraa.apps.googleusercontent.com',
    REDIRECT_URI: 'https://vitanota.io/auth/google-callback',
  },
});
googleClientSecret.grantRead(googleTokenProxy);

const googleTokenProxyUrl = googleTokenProxy.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,  // public (CORS で origin 制限)
  cors: {
    allowedOrigins: ['https://vitanota.io'],
    allowedMethods: [lambda.HttpMethod.POST],
    allowedHeaders: ['Content-Type'],
  },
});

// AppStack に props 経由で URL を渡す or 出力する
new cdk.CfnOutput(this, 'GoogleTokenProxyUrl', { value: googleTokenProxyUrl.url });
```

### アプリコード変更

`pages/auth/google-callback.tsx`:
- `fetch('https://oauth2.googleapis.com/token', ...)` を `fetch(process.env.NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL, ...)` に変更
- body を `{ code, codeVerifier }` JSON に変更

`next.config.js`:
- CSP `connect-src` に Lambda Function URL を追加
- `https://oauth2.googleapis.com` は削除（browser から直接呼ばないため）

`AppStack` (app-stack.ts):
- AppRunner runtimeEnvironmentVariables に `NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL` 追加
- Dockerfile に `ARG NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL` + `ENV` 追加
- deploy.yml に `--build-arg` 追加
- GitHub variable に `NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL` 追加

### 実装順序

1. CDK に Lambda + Function URL 追加 → デプロイ
2. 出力された Lambda Function URL を確認
3. GitHub variable `NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL` を設定
4. Dockerfile + deploy.yml に build-arg 追加
5. `google-callback.tsx` の fetch URL を proxy に変更
6. `next.config.js` の CSP 更新
7. AppStack に env var 追加して CDK deploy
8. 全体コミット + push → CI デプロイ
9. ログインテスト

### 見積もり工数

- CDK 実装: 20 分
- CDK デプロイ + URL 取得: 5 分
- GitHub variable + Dockerfile + deploy.yml: 10 分
- フロント + CSP: 10 分
- AppStack env + CDK deploy: 10 分
- commit/push/CI/テスト: 15 分
- **合計: 約 70 分**

---

## 重要リソース参照

### AWS
- アカウント: `107094297297`
- リージョン: `ap-northeast-1`（主）・`us-east-1`（CloudFront / ACM）
- Secrets Manager `vitanota/google-client-secret` に Client Secret 保管済み (`GOCSPX-...`)
- Google Client ID: `624139713607-el3sq55ninu8nsr394d8eiam7fjghraa.apps.googleusercontent.com`

### GitHub
- Repository: `kamitokusaric-lang/vitanota`
- Variables (既存): `ECR_REPOSITORY`, `AWS_ACCOUNT_ID`, `APPRUNNER_SERVICE_ARN_PROD`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- Variables (追加予定): `NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL`

### Google Cloud Console
- OAuth Client Type: Web application
- 承認済みリダイレクト URI: `https://vitanota.io/auth/google-callback`
- 承認済み JavaScript 生成元: `https://vitanota.io`

### 直近コミット
- `eb7fa29 fix(build): NEXT_PUBLIC_GOOGLE_CLIENT_ID を Docker build-arg で注入` ← 現 HEAD

---

## 未解決課題・後回しにした決定

### Phase 2 までに対応予定

| # | 項目 | Task ID |
|---|---|---|
| 1 | インフラクリーンアップ (NAT Instance・orphan VPC Connector・未使用 SG・subnet) | EXT-AUTH-11 |
| 2 | ドキュメント更新 (deployment-phases.md As-Built・migration-apprunner-to-ecs) | EXT-AUTH-12 |
| 3 | CloudFront Secret Header 実値化 (Secrets Manager replicaRegions) | CF-SEC-1 |
| 4 | ECS Express Mode 移行 | ECS-MIG-0 |
| 5 | JWKS 週次自動更新 cron (weekly cron empty commit push) | 新規 |
| 6 | RDS CA bundle を Docker に同梱して `rejectUnauthorized: true` 復元 | 新規 |

### β ローンチ直前に必須

| # | 項目 |
|---|---|
| 1 | **招待ユーザーを users テーブルに登録** (現状 empty) |
| 2 | CloudWatch Alarms の SNS メール送信動作確認 |
| 3 | 緊急ロールバック手順書 |
| 4 | 本番ログイン E2E テスト完遂 |

### タイミング調整中

- AppRunner は 2026-04-30 で新規受付停止・既存サービスは継続利用可
- β ローンチ目標: 2026-04-23 頃（あと数日）
- ECS 移行: β ローンチ後に計画的実施

---

## ロールバック情報

直前にログイン動作が壊れた場合の戻し先:
- 直前の「動く」image は AppRunner に既にある `:prod-eb7fa29` 以前のもの
- AppRunner の過去 image tag は ECR に最大 30 件保持
- `aws apprunner update-service --service-arn ... --source-configuration '{"ImageRepository": {"ImageIdentifier": "...:prod-{sha}", ...}}'` で差し替え可能

CDK のロールバック:
- `git revert <commit>` + `cdk deploy` で前状態に戻せる
- ただし data-shared の Secrets は `removalPolicy: RETAIN` のため誤削除のリスクは低い

---

## 次回セッション再開時の最短手順

1. このドキュメントを開く
2. 「Lambda Proxy 実装タスクの詳細」セクションの CDK 実装から着手
3. `data-shared-stack.ts` に上記インライン Lambda を追加
4. `cdk deploy vitanota-prod-data-shared` → URL 取得
5. 以降の順序で進める
