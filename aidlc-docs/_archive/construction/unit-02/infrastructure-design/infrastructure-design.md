# Unit-02 インフラ設計

## 概要

Unit-02（日誌・感情記録コア）のインフラ設計。**Unit-02 で新規追加する AWS サービスはゼロ**。Unit-01 で確立した AWS 基盤（App Runner・RDS・RDS Proxy・CloudFront・WAF・Secrets Manager・CloudWatch Logs・db-migrator Lambda）に対して、Unit-02 固有の設定（DB スキーマ・RLS ポリシー・CloudFront キャッシュビヘイビア・WAF スコープダウン・ログイベント）を追加する。

---

## Unit-01 からの継承事項

| 項目 | 継承内容 |
|---|---|
| ホスティング | AWS App Runner（ap-northeast-1） |
| DB | RDS PostgreSQL 16 + RDS Proxy（IAM 認証） |
| エッジ層 | CloudFront + WAF v2 + Shield Standard |
| シークレット | Secrets Manager |
| ログ | CloudWatch Logs（90日保持） |
| マイグレーション実行基盤 | `vitanota-db-migrator` Lambda（Unit-01 遡及追加） |

**Unit-02 で新規追加する AWS サービス**: なし

---

## 1. データベーススキーマ追加

### 新規テーブル（3個）

Unit-02 の機能設計 `domain-entities.md` で定義されたスキーマを RDS PostgreSQL に追加する。

| テーブル | 概要 | RLS |
|---|---|---|
| `journal_entries` | 日誌エントリ本体 | 2ポリシー（public_read + owner_all） |
| `tags` | タグ（`is_emotion` フラグで感情/業務を統合） | tenant_read ポリシー |
| `journal_entry_tags` | エントリとタグの中間テーブル | journal_entries 経由で暗黙的隔離 |

### マイグレーションファイル

Drizzle Kit 形式で `drizzle/` ディレクトリに配置：

```
drizzle/
  0002_journal_core.sql          # 3テーブル作成 + インデックス
  0003_journal_rls.sql           # RLS ポリシー有効化
  0004_public_journal_view.sql   # SP-U02-04 Layer 4: DB VIEW
  0005_cross_tenant_fk.sql       # SP-U02-04 Layer 8: 複合 FK クロステナント参照物理防止
  meta/
    _journal.json                # マイグレーション履歴
```

**0002_journal_core.sql の概要**:
- `CREATE TABLE journal_entries` (id, tenant_id, user_id, content, is_public, created_at, updated_at)
- `CREATE TABLE tags` (id, tenant_id, name, is_emotion, is_system_default, sort_order, created_at)
- `CREATE TABLE journal_entry_tags` (journal_entry_id, tag_id)
- インデックス: `(tenant_id, created_at DESC)`・`(tenant_id, lower(name)) UNIQUE`・`(tenant_id, is_emotion)`
- FK: `journal_entries.tenant_id → tenants.id`・`journal_entry_tags.journal_entry_id → journal_entries.id ON DELETE CASCADE`

**0003_journal_rls.sql の概要**:
```sql
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entry_public_read ON journal_entries
  AS PERMISSIVE FOR SELECT
  USING (is_public = true AND tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY journal_entry_owner_all ON journal_entries
  AS PERMISSIVE FOR ALL
  USING (user_id = current_setting('app.user_id', true)::uuid
    AND tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid
    AND tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tags_tenant_read ON tags
  AS PERMISSIVE FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- journal_entry_tags は journal_entries の RLS を経由して暗黙的に隔離される
CREATE POLICY journal_entry_tags_via_entry ON journal_entry_tags
  AS PERMISSIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_entry_tags.journal_entry_id
  ));
```

**0004_public_journal_view.sql の概要**（SP-U02-04 多層防御 Layer 4）:
```sql
-- is_public=true エントリのみを露出する VIEW
-- WHERE 句を VIEW 定義に内包し、is_public 列自体も露出しない
CREATE VIEW public_journal_entries AS
  SELECT
    id,
    tenant_id,
    user_id,
    content,
    created_at,
    updated_at
    -- 意図的に is_public 列を返さない（漏えい物理防止）
  FROM journal_entries
  WHERE is_public = true;

-- VIEW に対する SELECT 権限を明示
GRANT SELECT ON public_journal_entries TO vitanota_app;

-- VIEW 経由のアクセスでも基底テーブルの RLS が適用される
-- （PostgreSQL の security_barrier オプションで View 経由の述語プッシュダウンを防ぎ、安全性を強化）
ALTER VIEW public_journal_entries SET (security_barrier = true);
```

**設計判断**:
- `security_barrier = true` で、悪意ある関数によるサブクエリ経由の情報漏えいを防ぐ
- View の列に `is_public` を含めないことで、仮にアプリが誤って全列選択しても露出しない
- 将来 `deleted_at` ソフト削除等を追加する場合、View も同時に更新必須
- `PublicTimelineRepository` はこの View のみを SELECT 対象とする

**0005_cross_tenant_fk.sql の概要**（SP-U02-04 多層防御 Layer 8 クロステナント参照物理防止）:
```sql
-- 親テーブルに複合 UNIQUE 制約を追加（複合 FK の参照先として必要）
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_id_tenant_unique UNIQUE (id, tenant_id);
ALTER TABLE tags
  ADD CONSTRAINT tags_id_tenant_unique UNIQUE (id, tenant_id);

-- 既存の単独 FK を drop し、tenant_id カラムを中間テーブルに追加
ALTER TABLE journal_entry_tags
  DROP CONSTRAINT IF EXISTS journal_entry_tags_entry_id_fkey,
  DROP CONSTRAINT IF EXISTS journal_entry_tags_tag_id_fkey;

ALTER TABLE journal_entry_tags
  ADD COLUMN tenant_id UUID NOT NULL;

-- 複合 FK: テナント境界を超えた参照を物理的に拒否
ALTER TABLE journal_entry_tags
  ADD CONSTRAINT journal_entry_tags_entry_fk
    FOREIGN KEY (entry_id, tenant_id)
    REFERENCES journal_entries(id, tenant_id)
    ON DELETE CASCADE,
  ADD CONSTRAINT journal_entry_tags_tag_fk
    FOREIGN KEY (tag_id, tenant_id)
    REFERENCES tags(id, tenant_id)
    ON DELETE CASCADE;

-- インデックス追加（RLS 評価と JOIN 最適化のため）
CREATE INDEX journal_entry_tags_tenant_idx ON journal_entry_tags(tenant_id);
```

**効果**:
- テナント A のエントリにテナント B のタグを紐づけようとすると DB エンジンが FK violation で即拒否
- アプリコードのバグ・RLS の穴・生 SQL 実行のいずれに対しても物理的に無効化
- SP-U02-04 多層防御の Layer 8 として、論点 H（マルチテナント隔離）に対する追加の物理防衛線

**INSERT 時の注意**:
- アプリ側は必ず `tenant_id` を含めて INSERT する必要がある
- `withTenant` HOF で tenantId を取得済みなので追加コスト小
- Drizzle のスキーマで `.notNull()` を指定しているため TypeScript が強制

### マイグレーション実行

Unit-01 で追加した `vitanota-db-migrator` Lambda 経由で実行する。

**Phase 1（Unit-02 初期リリース、手動）**:
```bash
# dev へ適用
aws lambda invoke --function-name vitanota-db-migrator-dev \
  --payload '{"command":"migrate"}' \
  --cli-binary-format raw-in-base64-out response.json

# 問題なければ prod へ適用
aws lambda invoke --function-name vitanota-db-migrator-prod \
  --payload '{"command":"migrate"}' \
  --cli-binary-format raw-in-base64-out response.json
```

**Phase 2（自動化後）**:
`deployment-architecture.md` の CI/CD パイプラインで自動実行。

### 既存テナントへのシード

**対応不要**（Q2=A）。プロジェクトはグリーンフィールドでテナントが存在しないため、一度限りのスクリプトは作成しない。新規テナント作成時のシードは Unit-01 の `POST /api/system/tenants` ハンドラにアプリケーションコードで実装する（NFR-U02-03）。

---

## 2. CloudFront キャッシュビヘイビア追加

### 方針（Q3=A：ホワイトリスト方式）

Unit-01 で確立したディストリビューションのデフォルト動作 `Managed-CachingDisabled` を維持したまま、**共有タイムラインエンドポイントのみパスパターンで opt-in** する。

### パスパターン設定

| 優先度 | パスパターン | キャッシュポリシー | オリジンリクエストポリシー | 備考 |
|---|---|---|---|---|
| 1 | `/api/public/journal/entries` | `vitanota-timeline-cache`（新規作成） | `AllViewerExceptHostHeader` | GET のみキャッシュ対象、POST/PUT/DELETE はキャッシュ無効 |
| 2 | `/api/private/*` | `Managed-CachingDisabled` | `AllViewer` | マイ記録・CRUD 等の非公開 API は絶対にキャッシュしない |
| 3 | `/api/*`（デフォルト） | `Managed-CachingDisabled` | `AllViewer` | Unit-01 からの継承 |
| 4 | `/*`（デフォルト） | `Managed-CachingDisabled` | `AllViewer` | Unit-01 からの継承 |

### `vitanota-timeline-cache` キャッシュポリシー仕様

**新規作成するカスタムキャッシュポリシー**:

```yaml
Name: vitanota-timeline-cache
TTL:
  MinTTL: 0
  DefaultTTL: 0     # Cache-Control ヘッダーに完全に従う
  MaxTTL: 300       # 5分を上限として s-maxage の暴走を防ぐ
CacheKey:
  Headers:
    # Authorization・Cookie は意図的に含めない
    - X-Tenant-Context  # テナント切替時のキー分離（将来拡張）
  QueryStrings:
    - page            # ページネーション
    - perPage
  Cookies: none       # テナント共有キャッシュのためクッキーは無視
Compression:
  Gzip: true
  Brotli: true
```

**重要な設計判断**:
- **`Authorization` / `Cookie` をキャッシュキーに含めない**ことで、テナント内の全教員が同じキャッシュを共有（PP-U02-02 の目的）
- アプリ側の認証チェック（withTenant）は CloudFront 経由で飛んで来たリクエストに対して都度実行される
- **公開タイムラインのデータはテナント境界内で共有可能**という前提（SP-U02-02 RLS 2ポリシーで担保）
- マイ記録は絶対に別パスパターンで隔離

### キャッシュ無効化運用

- **通常デプロイ時**: `/*` の invalidation を GitHub Actions で実行（Unit-01 deployment-architecture.md 継承）
- **エントリ投稿直後**: クライアント側 SWR `mutate()` で即時再フェッチ（楽観的更新）
- **エッジキャッシュの不整合**: 最大90秒（s-maxage=30 + stale-while-revalidate=60）を受容（operational-risks.md R4 の方針）

---

## 3. WAF スコープダウンルール追加

### 方針（Q4=A：日誌 POST のみ Count モードで段階投入）

Unit-01 で確立した WAF Web ACL はそのまま Block モードで運用しつつ、**Unit-02 で新規に露出する `POST /api/private/journal/entries` のみ、本文検査ルールを Count モードで初期運用**する。

### スコープダウンルール定義

Unit-01 の Web ACL に以下のルールを追加（優先度は最上位、既存 Managed Rules より前に評価）：

```yaml
Name: journal-entry-post-bodycheck-count-mode
Priority: 0
Statement:
  AndStatement:
    - ByteMatchStatement:
        FieldToMatch: { UriPath: {} }
        PositionalConstraint: EXACTLY
        SearchString: /api/private/journal/entries
    - ByteMatchStatement:
        FieldToMatch: { Method: {} }
        PositionalConstraint: EXACTLY
        SearchString: POST
Action: Count
VisibilityConfig:
  SampledRequestsEnabled: true
  CloudWatchMetricsEnabled: true
  MetricName: journal-entry-post-bodycheck
```

**このルールの効果**:
- `POST /api/private/journal/entries` にマッチしたリクエストを **Count で記録**しつつ通過
- 後続の CommonRuleSet（BODY 検査含む）も引き続き評価されるが、Count ルールが先にマッチするため BlockedRequests としてカウントされない
- CloudWatch Logs の WAF ログで該当リクエストが `COUNT` アクションとして記録される

### 段階投入プロセス

| Day | アクション |
|---|---|
| Day 0 | Unit-02 リリース、Count モードで稼働開始 |
| Day 1-6 | 日次で CloudWatch Logs Insights でマッチ状況を確認 |
| Day 7 | 誤検知レビュー会、問題なければ次の手順へ |
| Day 7+ | スコープダウンルールを削除（= Block モードに戻る）、または問題があれば除外条件を追加 |

### レビュー用 CloudWatch Logs Insights クエリ

```
fields @timestamp, action, terminatingRuleId, httpRequest.uri, httpRequest.method, httpRequest.clientIp
| filter httpRequest.uri = "/api/private/journal/entries" and httpRequest.method = "POST"
| filter action = "COUNT"
| stats count() by terminatingRuleId
| sort count desc
```

### 切替手順

Count → Block への切替は運用 Runbook として文書化し、手動で `aws wafv2 update-web-acl` を実行する（将来的に IaC 化）。

---

## 4. CloudWatch Logs メトリクスフィルター追加

Unit-02 で追加される構造化ログイベント（OP-U02-01）を CloudWatch Metrics として可視化する。

### フィルター定義

| メトリクス名 | フィルターパターン | 用途 |
|---|---|---|
| `JournalEntryCreated` | `{ $.event = "journal_entry_created" }` | 投稿数トレンド |
| `JournalEntryUpdated` | `{ $.event = "journal_entry_updated" }` | 編集頻度 |
| `JournalEntryDeleted` | `{ $.event = "journal_entry_deleted" }` | 削除トレンド |
| `TagCreated` | `{ $.event = "tag_created" }` | タグ増加トレンド |
| `TagDeleted` | `{ $.event = "tag_deleted" }` | タグ削除（school_admin 操作） |

### アラーム追加

Unit-01 の既存アラームに以下を追加：

| アラーム名 | 条件 | 目的 |
|---|---|---|
| `JournalEntryCreatedZero` | 平日日中（9:00-17:00 JST）の `JournalEntryCreated` が 0 回/30分 | サービス可用性の間接指標（本番利用の検知） |

このアラームは本番運用が安定した後に有効化する（初期は false positive が多いため）。

---

## 5. Secrets Manager への追加

Unit-02 で追加する新しいシークレットは**なし**。Unit-01 の既存シークレットで全てカバー。

---

## 6. 環境変数への追加

App Runner に追加する環境変数：**なし**。

Unit-02 のコード生成で参照する環境変数は全て Unit-01 で定義済み。

---

## Unit-02 インフラ追加要素のサマリー

| 要素 | 追加先 | 種別 |
|---|---|---|
| `journal_entries` / `tags` / `journal_entry_tags` テーブル | RDS | DB スキーマ |
| RLS ポリシー 4個 | RDS | DB ポリシー |
| `vitanota-timeline-cache` キャッシュポリシー | CloudFront | 新規リソース |
| パスパターン 2個（`/api/public/journal/entries`・`/api/private/*`） | CloudFront | キャッシュビヘイビア |
| `journal-entry-post-bodycheck-count-mode` ルール | WAF Web ACL | 時限ルール（7日後削除） |
| メトリクスフィルター 5個 | CloudWatch Logs | 監視 |

**新規 AWS サービス**: ゼロ
**新規 IAM ロール**: ゼロ
**新規シークレット**: ゼロ
**Unit-01 への遡及追加**: `vitanota-db-migrator` Lambda（Unit-01 infrastructure-design.md に反映済み）

---

## コスト影響

Unit-02 追加要素の月額推定（prod 環境、小規模 BtoB 想定）:

| 項目 | 月額 |
|---|---|
| CloudFront エッジキャッシュ（共有タイムライン） | ほぼゼロ（既存ディストリビューション内、転送量のみ） |
| WAF スコープダウンルール | ゼロ（WebACL ルール数上限内） |
| CloudWatch Logs メトリクスフィルター | ゼロ（フィルター自体は無料、メトリクスストレージに微額） |
| Lambda マイグレーター呼び出し | $0（月数回の手動実行では無料枠内） |

**Unit-02 の追加コストは実質ゼロ**。RDS ストレージと App Runner の CPU 時間は利用量次第で変動するが、ベース構成のコストは Unit-01 と変わらない。

---

## 運用リスクとの紐づけ

`../nfr-design/operational-risks.md` の以下リスクと対応：

| リスク | インフラ側の対応 |
|---|---|
| R4 二重キャッシュ | CloudFront キャッシュ設計で `s-maxage=30` を上限に制限、マイ記録は別パスで完全分離 |
| R5 RLS ポリシー順序 | 0003_journal_rls.sql で PERMISSIVE 明示、missing_ok による fail-safe |
| R7 マイグレーション競合 | Lambda マイグレーター経由で App Runner デプロイ前に確実に実行 |
| R11 署名ヘッダー | Unit-01 の SP-06 パターン継承 |
| R12 WAF 誤検知 | スコープダウンルールで Count モード初期運用 |
