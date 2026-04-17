# Unit-03 NFR設計パターン

**作成日**: 2026-04-16
**対象ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）

---

## 継承パターン（Unit-01・02 で確立済み）

Unit-03 は以下の既存パターンをそのまま適用する。新規パターンの追加はない。

### SP-01: 構造化ログ（継承）

- pino + redact で PII 除外
- `logEvent()` ヘルパーで型安全なイベントログ
- 感情傾向 API のアクセスログを記録（リクエストパラメータ・レスポンス件数）
- エントリ本文は一切ログに含めない

### SP-02: 入力バリデーション（継承）

- Zod スキーマで `period` パラメータを検証（`week` / `month` / `quarter` のみ）
- 不正値は 400 エラー

### SP-03: RLS 多層防御（継承）

- API 層: `requireAuth()` で認証チェック
- DB 層: `withTenantUser()` で `app.tenant_id` + `app.user_id` を SET → RLS が自動適用
- 集計クエリは RLS 配下で実行されるため、他教員・他テナントのデータは自動除外

### SP-04: HTTP セキュリティヘッダー（継承）

- 既存の Next.js middleware でヘッダーを付与（CSP, HSTS, X-Frame-Options 等）
- `/dashboard/teacher` ページにも自動適用

---

## Unit-03 固有の設計決定

### DP-U03-01: スキーマ変更の段階的マイグレーション

`is_emotion` → `type`/`category` への移行を安全に実行するための段階的手順：

```
Step 1: ADD COLUMN type (DEFAULT 'context')     ← 既存データは自動的に 'context'
Step 2: ADD COLUMN category (nullable)
Step 3: UPDATE tags SET type='emotion' WHERE is_emotion=true
Step 4: UPDATE 既知の感情タグに category を設定
Step 5: ADD CHECK 制約 (type/category 整合性)
Step 6: INSERT 新規システムデフォルトタグ (ON CONFLICT DO NOTHING)
Step 7: DROP COLUMN is_emotion
Step 8: RENAME INDEX tags_tenant_emotion_idx → tags_tenant_type_idx
```

**ロールバック**: Step 7 の前であれば `is_emotion` から復元可能。Step 7 以降は `type = 'emotion'` から `is_emotion = true` を再生成可能。

### DP-U03-02: 集計データの本文非含有保証

感情傾向 API のレスポンスには以下のみを含む：
- `date`: 日付
- `positive` / `negative` / `neutral`: カウント値
- `total`: 合計カウント
- `totalEntries`: 期間内エントリ総数

**物理的保証**: 集計クエリの SELECT 句にエントリ本文（`content`）を含めない。Service 層の返り値型 `EmotionTrendResponse` に content フィールドは存在しない。

### DP-U03-03: タイムゾーン処理

- DB: `created_at` は `timestamptz`（UTC で保存）
- 集計: サーバー側で `AT TIME ZONE 'Asia/Tokyo'` を使って日本時間の日付に変換後 GROUP BY
- フロントエンド: API から受け取った `date` (YYYY-MM-DD) をそのまま表示（タイムゾーン変換不要）
