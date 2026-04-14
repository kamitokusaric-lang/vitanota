# Unit-01 NFR要件

## アーキテクチャ方針（Unit-01 で確定）

**デプロイ基盤**: AWS 統一（東京リージョン ap-northeast-1）  
**理由**: 国内データ所在地要件（文科省ガイドライン準拠）・Vercel + RDS の VPC 接続問題の回避

---

## NFR-U01-01: パフォーマンス

インセプションフェーズ NFR-02 を Unit-01 スコープで具体化する。

| 指標 | 要件値 | 対象エンドポイント |
|---|---|---|
| ログインリダイレクト応答 | 500ms 以内（P95） | `GET /auth/signin` |
| OAuth コールバック処理 | 1,000ms 以内（P95） | `GET /api/auth/callback/google` |
| テナント作成 API | 500ms 以内（P95） | `POST /api/system/tenants` |
| 招待トークン検証 | 300ms 以内（P95） | `GET /api/auth/invite?token=` |

**RDS Proxy による接続レイテンシ**: 通常 1〜5ms（同一 VPC 内）のオーバーヘッドを許容する。

---

## NFR-U01-02: スケーラビリティ

| 指標 | MVP 目標値 | 根拠 |
|---|---|---|
| 同時アクティブセッション | 最大 500 | テナント最大 50 校 × 教員平均 10名 |
| テナント数 | 最大 100 テナント | MVP フェーズの想定契約数 |
| RDS 接続数（RDS Proxy 経由） | 最大 50 接続 | Proxy がプールするため実 DB 接続を抑制 |
| App Runner インスタンス | 最小 1・最大 5（オートスケール） | リクエスト数に応じて自動スケール |

---

## NFR-U01-03: 可用性

インセプションフェーズ NFR-04（99.5%）を継承する。

| コンポーネント | 構成 | 可用性への寄与 |
|---|---|---|
| App Runner | マネージド・自動ヘルスチェック | 単一障害点なし |
| RDS | Multi-AZ 構成（本番環境） | フェイルオーバー自動（通常 60秒以内） |
| RDS Proxy | Multi-AZ 対応 | RDS フェイルオーバー時の接続を維持 |

**RTO（目標復旧時間）**: 5分以内  
**RPO（目標復旧時点）**: 1時間以内（RDS 自動バックアップ、保持 7日間）

---

## NFR-U01-04: セキュリティ（Unit-01 スコープ）

SECURITY-01〜15 全適用。Unit-01 で実装するセキュリティ要件を以下に具体化する。

### SECURITY-01: 保存データ・転送データの暗号化
- RDS ストレージ暗号化: AWS KMS マネージドキー（aws/rds）で有効化
- RDS 接続: SSL/TLS 強制（`sslmode=require`）
- RDS Proxy: TLS 終端で RDS との通信を暗号化

### SECURITY-03: 構造化ログ
- **出力先**: Amazon CloudWatch Logs（ロググループ: `/vitanota/app`）
- **保持期間**: 90日（SECURITY-14 準拠）
- **ログ形式**: JSON 構造化ログ（`timestamp`・`requestId`・`level`・`event`・`userId?`・`tenantId?`）
- **禁止項目**: メールアドレス・セッショントークン・DB 接続文字列をログに含めない

### SECURITY-04: HTTP セキュリティヘッダー
- `next.config.js` の `headers()` で全ページに設定（business-rules.md BR-SEC-02 参照）

### SECURITY-11: レート制限
- ログインエンドポイント: IP ごとに 10回/分（MVP はメモリベース実装）
- App Runner のコンテナが複数起動した場合、メモリベースレート制限は各インスタンス独立となる
  - **制約の受け入れ**: MVP スケール（同時 500 セッション）では許容範囲内

### SECURITY-12: セッション管理
- JWT 方式（Auth.js）・24時間スライディングウィンドウ
- HttpOnly・Secure・SameSite=Lax クッキー

### SECURITY-14: セキュリティアラートと監視
- CloudWatch アラーム設定（詳細はインフラ設計ステージで定義）:
  - 認証エラー率が 5分間で 20回超 → アラート
  - RDS CPU 使用率 80%超 → アラート
  - App Runner エラーレート 5%超 → アラート
- ログ保持: 90日

---

## NFR-U01-05: 信頼性

| 要件 | 実装方針 |
|---|---|
| DB 接続失敗時のフォールバック | RDS Proxy が接続プールを維持。一時的な接続失敗は Proxy がリトライ |
| アプリケーションエラーの検知 | CloudWatch アラームでエラーレート監視 |
| デプロイ時のゼロダウンタイム | App Runner のローリングデプロイ |
| シークレット管理 | AWS Secrets Manager（DB 接続文字列・Auth.js シークレット） |

---

## NFR-U01-06: テスト要件

| テスト種別 | ツール | 対象 | カバレッジ目標 |
|---|---|---|---|
| ユニットテスト | Vitest | TenantService・RoleService・招待トークン検証・withTenant() | 80%以上 |
| E2E テスト | Playwright | ログインフロー・招待フロー・テナント停止動作 | 主要ハッピーパス + エラーケース |
| セキュリティテスト | Vitest | ロール検証・IDOR 防止・レート制限 | 全ケース網羅 |

**E2E テストの Google OAuth 対応**:
- NextAuth のコールバックをモックし、実 Google 認証なしで「ログイン済み状態」を再現する
- `NEXTAUTH_SECRET` + テスト用セッションを直接注入する方式で CI 自動化する

---

## NFR-U01-07: 保守性

| 要件 | 実装方針 |
|---|---|
| 環境変数管理 | `.env.local`（開発）/ AWS Secrets Manager（本番） |
| DB マイグレーション | Drizzle Kit（`drizzle-kit push` 開発・`drizzle-kit migrate` 本番） |
| コードフォーマット | ESLint + Prettier（CI で自動チェック） |
| 型安全性 | TypeScript strict モード |
