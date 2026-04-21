# Post-MVP バックログ

**目的**: MVP 本番稼働後に着手する改善・整理項目の一元管理。致命度は低いが放置すると負債化する案件を記録する。

**運用**:
- 着手時は関連 PR 番号を記載し、完了したら該当項目を削除する
- 新規項目は「発見日: YYYY-MM-DD / 発見元セッション」を添える
- 優先度は 高 / 中 / 低 の 3 段階。高は 1 ヶ月以内、中は 3 ヶ月以内、低はいつでも

---

## Auth / OAuth

### 🟡 中: `TOKEN_EXCHANGE_FAILED:<detail>` 画面 surface を plain に戻す
- **発見日**: 2026-04-21
- **現状**: `pages/auth/google-callback.tsx:78-98` が Lambda Proxy エラー詳細をユーザー画面に露出
- **理由**: Auth 修正直後の診断価値のため残しているが、UX が英数字混じりで見苦しい
- **着手判断**: Auth が 1〜2 週間無事故稼働を確認してから plain `TOKEN_EXCHANGE_FAILED` に戻す

### 🟡 中: Google Client ID の 3 重ハードコード解消
- **発見日**: 2026-04-21
- **現状**: `infra/lib/app-stack.ts:104,108` で 2 箇所 + GitHub variable の計 3 箇所に同値ハードコード
- **理由**: Secret ローテ時の変更漏れリスク、変更箇所が散らばる
- **対策**: Secrets Manager `vitanota/google-client-id` に一元化し、環境変数は `runtimeEnvironmentSecrets` で注入

### 🟢 低: Google Token Proxy Lambda の inline code を別ファイル化
- **発見日**: 2026-04-21
- **現状**: `infra/lib/data-shared-stack.ts` 内の 88 行文字列リテラル
- **理由**: syntax highlight なし、ユニットテスト不可
- **対策**: `infra/lambda/google-token-proxy/index.js` に分離、`lambda.Code.fromAsset` で参照

### 🟢 低: CSP の Lambda URL ハードコード解消
- **発見日**: 2026-04-21
- **現状**: `pages/api/auth/google-signin.ts` 等で CSP connect-src に Lambda URL を直書き
- **対策**: CDK `GoogleTokenProxyUrl` output を GitHub Actions で読み取り、ビルド時 env var で注入

### 🟡 中: ログアウト API の実装確認・必要なら実装
- **発見日**: 2026-04-21
- **現状**: `pages/api/auth/` に明示的な signout ハンドラなし。NextAuth v4 デフォルトの `/api/auth/signout` 経路の動作未確認
- **対策**: 自前 session テーブル運用なので専用 DELETE エンドポイントが必要。実装有無を調査 → 未実装なら `POST /api/auth/signout` を追加（session token 削除 + cookie 無効化）

---

## DB / 接続

### 🟡 中: 期限切れ session の自動クリーンアップ
- **発見日**: 2026-04-21
- **現状**: `migrations/0002_unit02_sessions.sql:40` にコメントで SQL あり、実装なし
- **影響**: 長期的にテーブル肥大化、インデックス劣化
- **対策**: EventBridge Scheduler + Lambda で日次実行 `DELETE FROM sessions WHERE expires < NOW() - INTERVAL '7 days'`

### 🟢 低: pg Pool の `idleTimeoutMillis` 見直し
- **発見日**: 2026-04-21
- **現状**: `src/shared/lib/db.ts:35` で 30 秒
- **影響**: idle 30 秒で connection が破棄され、次リクエストで新規 PAM 認証（コスト・レイテンシ）
- **対策**: 5〜10 分に緩和して再利用率を上げる。ただし max 10 で RDS connection 数との兼ね合いを確認

### 🟢 低: 古い App Runner ログ group の削除
- **発見日**: 2026-04-21
- **現状**: `/aws/apprunner/vitanota-prod-app/27cf452510c6471882edb89b6fb5fcf3/*` が停止 VPC Connector 時代の残骸で存続
- **影響**: CloudWatch 保管コスト（微小）
- **対策**: 新 group (`9063731f...`) が安定稼働後、旧 group を `aws logs delete-log-group` で削除

---

## インフラ整理

### 🟢 低: RDS SSL 証明書の `rejectUnauthorized: true` 化
- **発見日**: 2026-04-19 以前（既に `db.ts:31` にコメント記載）
- **現状**: `src/shared/lib/db.ts:29-31` で VPC 内通信のため false
- **対策**: RDS CA bundle を Docker イメージに同梱し true に切替

### 🟢 低: CloudFront CLOUDFRONT_SECRET 強制化
- **発見日**: 以前から TODO（`infra/lib/app-stack.ts:115` コメント）
- **現状**: PLACEHOLDER 運用で middleware が secret チェックをスキップ
- **対策**: クロスリージョン Secret (CloudFront=us-east-1 / Secret=ap-northeast-1) 問題を解決して有効化

---

## ドキュメント整理

### 🟢 低: `aidlc-docs/construction/auth-externalization.md` の正本化
- **発見日**: 2026-04-21
- **現状**: 先頭に「Lambda Proxy に変更」注記のみ付けた暫定対応
- **対策**: 本文自体を新フロー前提に書き直す。誤情報リスクが低い程度に Auth 実装が枯れてから

### 🟢 低: `aidlc-docs/0421_tmp.md` と `aidlc-docs/operations/session-handoff-20260420.md` の扱い
- **発見日**: 2026-04-21
- **現状**: 当時のセッション記録。役目を終えたが git 履歴として残している
- **対策**: 本バックログに移植し終えたので、将来的に `aidlc-docs/operations/history/` サブディレクトリに退避 or 削除

---

## 関連リファレンス

- 招待フロー仕様: `aidlc-docs/construction/user-onboarding-flow.md`
- 認証外部化設計: `aidlc-docs/construction/auth-externalization.md`
- セッション引き継ぎスナップショット: `aidlc-docs/operations/session-handoff-20260420.md`
- デプロイフェーズ: `aidlc-docs/construction/deployment-phases.md`
