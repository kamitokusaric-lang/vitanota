# Unit-01 テックスタック決定

## 決定一覧

| カテゴリ | 採用技術 | 決定ステージ |
|---|---|---|
| フロントエンド | Next.js 14（Pages Router） | アプリケーション設計 |
| 言語 | TypeScript（strict モード） | アプリケーション設計 |
| ORM | Drizzle ORM | アプリケーション設計 |
| 認証 | Auth.js v4（NextAuth.js） | アプリケーション設計 |
| データベース | AWS RDS PostgreSQL 16（東京） | Unit-01 NFR要件 |
| 接続プール | AWS RDS Proxy | Unit-01 NFR要件 |
| アプリホスティング | AWS App Runner（東京） | Unit-01 NFR要件 |
| バッチ実行 | AWS EventBridge Scheduler + Lambda | Unit-01 NFR要件 |
| ログ管理 | Amazon CloudWatch Logs | Unit-01 NFR要件 |
| モニタリング | Amazon CloudWatch アラーム | Unit-01 NFR要件 |
| シークレット管理 | AWS Secrets Manager | Unit-01 NFR要件 |
| ユニットテスト | Vitest | Unit-01 NFR要件 |
| E2E テスト | Playwright | Unit-01 NFR要件 |

---

## AWS インフラ構成（Unit-01 確定分）

```
インターネット
     ↓
[AWS ALB / App Runner インgresss]
     ↓
[App Runner] ← Next.js アプリ（東京 ap-northeast-1）
     ↓ VPC コネクター経由
[RDS Proxy]  ← 接続プール管理（東京）
     ↓
[RDS PostgreSQL] ← プライベート VPC（東京・Multi-AZ）
```

### AWS リージョン
- **全リソース**: ap-northeast-1（東京）
- **理由**: 国内データ所在地要件（文科省ガイドライン）

---

## 各技術の採用理由

### AWS App Runner（Next.js ホスティング）
- **採用理由**: コンテナ管理不要のマネージドサービス。ECS Fargate より運用コストが低い
- **VPC コネクター**: App Runner から RDS（プライベート VPC）への接続を実現
- **代替案**: AWS ECS Fargate（却下：クラスター管理・タスク定義の運用コストが高い）
- **代替案**: AWS Amplify（却下：VPC 内 RDS への接続設定が複雑）

### AWS RDS PostgreSQL 16
- **採用理由**: PostgreSQL RLS（行レベルセキュリティ）による堅牢なマルチテナント隔離が必要
- **東京リージョン**: 国内データ所在地要件を満たす唯一の選択肢
- **Multi-AZ**: 本番環境で 99.5% 可用性を達成するために必須
- **代替案**: Neon・Supabase（却下：東京リージョン未対応）

### AWS RDS Proxy
- **採用理由**: App Runner は接続ごとに新しいコンテナを起動する可能性があり、RDS の接続数上限対策が必要
- **IAM 認証**: DB パスワードをアプリに直接持たせずセキュリティを強化
- **フェイルオーバー維持**: RDS Multi-AZ フェイルオーバー時も既存接続を維持

### AWS EventBridge Scheduler + Lambda（Unit-04 のバッチ用）
- **採用理由**: Vercel Cron の代替。AWS 統一構成で完結する
- **対象**: アラート検知バッチ（毎日深夜実行）
- **注記**: Unit-04 のインフラ設計で詳細を定義する

### Amazon CloudWatch Logs
- **採用理由**: App Runner・RDS・Lambda のログを AWS ネイティブで一元管理
- **保持期間**: 90日（SECURITY-14 準拠）
- **代替案**: Datadog・Axiom（却下：AWS 統一方針・追加コスト不要）

### Vitest
- **採用理由**: Next.js / TypeScript との相性が良い。Jest 互換 API で移行コストが低い
- **対象**: サービス層・ユーティリティ関数・ビジネスルールのユニットテスト

### Playwright
- **採用理由**: Next.js の E2E テストで最も広く使われるツール。クロスブラウザ対応
- **Google OAuth モック**: `NEXTAUTH_SECRET` + テスト用セッション注入で実認証を回避し CI 自動化
- **代替案**: Cypress（却下：Playwright の方が CI 環境でのセットアップがシンプル）

---

## パッケージ構成（Unit-01 スコープ）

```json
{
  "dependencies": {
    "next": "^14.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "next-auth": "^4.x",
    "drizzle-orm": "^0.x",
    "postgres": "^3.x",
    "@aws-sdk/client-secrets-manager": "^3.x"
  },
  "devDependencies": {
    "drizzle-kit": "^0.x",
    "typescript": "^5.x",
    "vitest": "^1.x",
    "@vitejs/plugin-react": "^4.x",
    "playwright": "^1.x",
    "@playwright/test": "^1.x",
    "eslint": "^8.x",
    "prettier": "^3.x"
  }
}
```

---

## 環境変数定義（Unit-01）

| 変数名 | 用途 | 管理場所 |
|---|---|---|
| `DATABASE_URL` | RDS Proxy エンドポイント（postgres://...） | AWS Secrets Manager |
| `NEXTAUTH_URL` | Auth.js のコールバック URL | App Runner 環境変数 |
| `NEXTAUTH_SECRET` | JWT 署名キー | AWS Secrets Manager |
| `GOOGLE_CLIENT_ID` | Google OAuth クライアント ID | AWS Secrets Manager |
| `GOOGLE_CLIENT_SECRET` | Google OAuth クライアントシークレット | AWS Secrets Manager |
| `AWS_REGION` | AWS リージョン | App Runner 環境変数（ap-northeast-1） |

---

## インセプションフェーズからの変更点

| 項目 | 変更前（Vercel 想定） | 変更後（AWS 統一） |
|---|---|---|
| ホスティング | Vercel | AWS App Runner（東京） |
| DB ホスティング | Neon / Supabase（想定） | AWS RDS PostgreSQL（東京） |
| 接続プール | Neon ドライバー / Supavisor | AWS RDS Proxy |
| アラートバッチ | Vercel Cron | AWS EventBridge Scheduler + Lambda |
| ログ | Vercel ログ | Amazon CloudWatch Logs |
| シークレット | Vercel 環境変数 | AWS Secrets Manager |

**影響するドキュメント**: `aidlc-docs/inception/application-design/application-design.md` のインフラ記述はインフラ設計ステージで更新する。
