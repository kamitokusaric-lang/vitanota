# サービス定義

## 設計前提

- **サービス層**: 機能別ディレクトリ内に配置（`src/features/{feature}/services/`）
- **共通インフラ**: `src/shared/lib/` に配置（DB 接続・テナント隔離ラッパー等）
- **ORM**: Drizzle ORM + PostgreSQL RLS
- **テナント隔離**: `withTenant()` ラッパーを経由することで DB 層での隔離を保証
- **詳細なビジネスロジック**: 機能設計（Functional Design）フェーズで定義

---

## 共通インフラ（src/shared/lib/）

### `db.ts` — データベース接続・テナント隔離

```
責務:
  - Drizzle ORM クライアントのシングルトン管理
  - withTenant() ラッパーの提供

withTenant(tenantId, fn):
  - トランザクション内で SET LOCAL app.tenant_id = {tenantId} を実行
  - RLS ポリシーが自動的に全クエリに適用される
  - fn(tx) にトランザクションを渡して実行する

使用方法:
  すべての DB アクセスは withTenant() を経由すること
  直接 db.select() を呼ぶことは禁止（RLS バイパスのリスク）
```

### `auth.ts` — Auth.js 設定

```
責務:
  - Auth.js (NextAuth.js) の設定エクスポート
  - Google OAuth プロバイダーの設定
  - セッションに tenantId・role を含めるカスタムコールバック
  - JWT / セッション有効期限の設定
```

---

## FEATURE: auth

### `TenantService`（src/features/auth/services/tenant.service.ts）

```
責務:
  - テナントの存在確認・有効性検証
  - ユーザーのテナント所属確認
  - テナント作成・停止（システム管理者専用）

主要操作:
  - テナント取得（ID による）
  - テナント有効性検証（停止テナントへのアクセス拒否）
  - ユーザーとテナントの紐づけ検証

セキュリティ:
  - すべての操作で withTenant() を使用
  - テナント間クロスアクセスは DB 層の RLS で遮断
```

### `RoleService`（src/features/auth/services/role.service.ts）

```
責務:
  - ユーザーロールの検証（teacher / admin / sysadmin）
  - ロール別アクセス制御の判定ロジック

主要操作:
  - ロール検証（セッションから取得したロールを検証）
  - 管理者ロールの確認
  - 教員ロールの確認
```

---

## FEATURE: journal

### `JournalService`（src/features/journal/services/journal.service.ts）

```
責務:
  - 日誌エントリの CRUD 操作
  - 教員本人のエントリのみ操作可能であることを保証
  - タイムライン表示用のエントリ一覧取得

主要操作:
  - エントリ一覧取得（教員 ID・日付範囲でフィルタ）
  - エントリ作成
  - エントリ更新（本人確認付き）
  - エントリ削除（本人確認付き）

セキュリティ:
  - withTenant() でテナント隔離
  - 更新・削除時は teacherId の一致を検証（IDOR 防止）
  - 管理者は日誌本文を取得できない（API 設計で制御）
```

### `TagService`（src/features/journal/services/tag.service.ts）

```
責務:
  - タグの作成・一覧取得
  - エントリへのタグ付与・解除

主要操作:
  - テナント内タグ一覧取得
  - タグ作成（重複チェック付き）
  - エントリへのタグ紐づけ
```

---

## FEATURE: emotion

### `EmotionService`（src/features/emotion/services/emotion.service.ts）

```
責務:
  - 感情スコア・感情カテゴリの記録・更新
  - 教員個人の感情スコア集計（グラフ用）
  - 管理者向け感情スコア集計（ダッシュボード用・本文非含）

主要操作:
  - 感情データ記録（エントリに紐づけ）
  - 感情データ更新
  - 個人感情スコア時系列取得（週・月）
  - タグ別記録頻度集計
  - 管理者向け：教員ごとの感情スコア平均取得（SQL 集計・リアルタイム）

セキュリティ:
  - 管理者向け集計は感情スコア・カテゴリのみ返却（本文テキスト含まず）
  - withTenant() でテナント隔離
```

---

## FEATURE: admin-dashboard

### `AdminDashboardService`（src/features/admin-dashboard/services/admin-dashboard.service.ts）

```
責務:
  - 管理者ダッシュボード用のデータ集約
  - テナント内全教員のステータスサマリー生成
  - 特定教員の感情推移データ取得

主要操作:
  - 全教員ステータス一覧取得（感情スコア平均・アラートフラグ・要注意フラグ）
  - 特定教員の感情スコア推移取得（週・月）
  - 要注意フラグの設定・解除（メモ付き）

セキュリティ:
  - 返却データに日誌本文テキストを含まない（設計上の制約）
  - 同一テナント内の管理者ロールのみアクセス可能
```

### `AlertService`（src/features/admin-dashboard/services/alert.service.ts）

```
責務:
  - アラート条件の評価（定期バッチから呼び出し）
  - アラートの生成・保存
  - アラートのクローズ（対応済みへの移行）
  - アラート一覧・履歴の取得

主要操作:
  - アラート条件評価（全テナントを横断してバッチ実行）
  - アラート生成（対象教員・種別・発生日時）
  - アラートクローズ（対応者・対応日時を記録）
  - 未対応アラート一覧取得
  - アラート履歴取得

アラート種別（詳細は Functional Design で定義）:
  - 感情スコア連続低下（閾値・期間は FR-09-1 に従う）
  - 記録途絶（設定日数以上）

セキュリティ:
  - アラート情報に日誌本文テキストを含まない
  - クローズ操作は管理者ロールのみ
```

### `AlertDetectionJob`（src/features/admin-dashboard/services/alert-detection.job.ts）

```
責務:
  - スケジュール実行のエントリーポイント（Vercel Cron Jobs から呼び出し）
  - 全テナントのアラート条件を一括チェック
  - AlertService.evaluateAlerts() を各テナントで実行

実行タイミング:
  - 毎日深夜（例：00:00 JST）に Vercel Cron から /api/cron/detect-alerts を呼び出し
  - Cron Secret ヘッダーで不正呼び出しを防止（SECURITY-11）
```
