# Unit-02 テックスタック決定事項

## 方針
Unit-02（日誌・感情記録コア）は Unit-01（認証・テナント基盤）で確定したテックスタックを**全継承**する。新規技術の追加は行わない。

---

## 継承テックスタック（Unit-01 から）

| レイヤー | 技術 | バージョン | 用途 |
|---|---|---|---|
| フレームワーク | Next.js | 14.x (Pages Router) | フロント+API統合 |
| 言語 | TypeScript | 5.x (strict mode) | 型安全 |
| 認証 | Auth.js (NextAuth) | v4 | JWT セッション管理 |
| DB | PostgreSQL | 16.x (RDS) | データ永続化 |
| ORM | Drizzle ORM | latest | 型安全なクエリ・マイグレーション |
| 接続プール | RDS Proxy | - | コネクション管理 |
| バリデーション | Zod | latest | 入力検証・スキーマ共有 |
| フォーム | React Hook Form | latest | クライアント入力管理 |
| テスト | Vitest | latest | ユニット・統合テスト |
| ログ | pino + pino-redact | latest | 構造化ログ・機密情報マスキング |
| ホスティング | AWS App Runner | - | Next.js アプリ（ap-northeast-1） |
| DB | AWS RDS PostgreSQL 16 | - | プライベート VPC |
| バッチ | AWS EventBridge Scheduler + Lambda | - | Unit-04 アラート用 |
| シークレット | AWS Secrets Manager | - | DB認証情報・Auth.js secret |
| ログ | Amazon CloudWatch Logs | - | 90日保持 |

---

## Unit-02 追加ライブラリ

なし。Unit-01 の依存関係で全機能を実装可能。

---

## テックスタック決定の根拠

- **AWS 統一構成**: Unit-01 で国内データ所在地要件（文科省ガイドライン）と VPC 接続要件から Vercel を却下し、AWS App Runner + RDS（ap-northeast-1）に確定済み。Unit-02 もこれを継承
- **一貫性**: 単一のテックスタックで全ユニットを実装することで、開発・運用コストを最小化
- **Zodスキーマ共有**: NFR-U02-05 の二層バリデーションを実現するため、クライアント・API層で同一の Zodスキーマを使用
- **Drizzle ORM**: RLS を考慮した生SQL寄りのクエリと、マイグレーション管理を両立
- **Pages Router 継続**: Unit-01 で採用済み。App Router への移行は本プロジェクトのスコープ外

---

## 非採用技術（検討したが不要と判断）

| 技術 | 不採用理由 |
|---|---|
| Redis / ElastiCache | NFR-U02-02 のタイムラインキャッシュは Next.js の `Cache-Control: s-maxage + stale-while-revalidate` で十分。インフラ追加不要 |
| Vercel | Unit-01 で却下済み（国内データ所在地要件・RDS の VPC 接続問題） |
| 全文検索エンジン（OpenSearch等） | MVP ではエントリ検索機能なし。Phase 2 で再検討 |
| GraphQL | REST (Next.js API Routes) で十分。複雑なクエリ要件なし |
| 状態管理ライブラリ（Zustand等） | タイムライン・フォーム状態は React Hook Form + SWR / fetch で管理可能 |
