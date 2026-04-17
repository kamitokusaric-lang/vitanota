# Unit-03 NFR要件

**作成日**: 2026-04-16
**対象ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）

---

## 継承 NFR（Unit-01・02 確定済み）

Unit-03 は Unit-01・02 のインフラ・設定をそのまま利用する。以下は確定済みのため再決定不要。

| NFR | 確定内容 |
|---|---|
| パフォーマンス | API レスポンス 500ms 以内（P95）、ページロード 3秒以内（P95） |
| セキュリティ | Security Baseline 全ルール適用（SECURITY-01〜15） |
| スケーラビリティ | RLS によるテナント隔離・RDS Proxy 接続プール |
| ログ | pino + redact（SP-01）・CloudWatch Logs 90日保持 |
| 認証 | Auth.js v4 database セッション・withTenantUser() パターン |
| テスト | ビジネスロジック 80% カバレッジ（Vitest） |
| バリデーション | Zod スキーマ共有（クライアント + API 二層） |

---

## Unit-03 固有 NFR

### NFR-U03-01: 感情傾向 API パフォーマンス

**要件**: `GET /api/private/dashboard/emotion-trend` は 500ms 以内（P95）でレスポンスを返す。

**詳細**:
- 3テーブル結合（journal_entries + journal_entry_tags + tags）+ GROUP BY DATE() の集計クエリ
- 最大 90日（quarter）の期間を対象
- 既存インデックス `journal_entries_user_created_idx` (user_id, created_at) で user_id + 期間の絞り込みが効く
- 追加インデックスは不要（教員1名あたり 90日分のデータ量は十分小さい）
- キャッシュなし（毎回 DB 集計・常に最新データを返す）

**根拠**: 1テナント 10〜50名の教員が 1日 1〜3件記録する想定で、90日分でも最大 150行程度。3テーブル JOIN + GROUP BY は既存インデックスで十分高速。

---

### NFR-U03-02: tags スキーマ変更のマイグレーション安全性

**要件**: `is_emotion` → `type` enum + `category` enum への移行を安全に実行する。

**詳細**:
- 既存データの自動変換: `is_emotion = true` → `type = 'emotion'`、`is_emotion = false` → `type = 'context'`
- 既存の感情タグへの category 付与: マイグレーション内で既知のシステムデフォルトタグに category を設定
- 新規 CHECK 制約: `type = 'emotion'` なら `category NOT NULL`、`type = 'context'` なら `category IS NULL`
- `is_emotion` カラム削除は変換完了後に実行
- 既存テナントへの新タグシード: `ON CONFLICT DO NOTHING` で冪等に挿入
- ロールバック: `is_emotion` カラムは DROP 前に `type` から逆算可能

**RLS への影響**:
- 既存の `tags` RLS ポリシーは `tenant_id` のみで判定 → `type`/`category` 追加の影響なし
- インデックス `tags_tenant_emotion_idx` を `tags_tenant_type_idx` にリネーム

---

### NFR-U03-03: セキュリティ固有要件

Unit-03 の機能に対する Security Baseline の適用：

| ルール | Unit-03 での適用内容 |
|---|---|
| SECURITY-05（入力検証） | period パラメータを Zod enum で検証（`week`/`month`/`quarter` のみ許可） |
| SECURITY-08（IDOR防止） | withTenantUser() で user_id を注入、他教員のデータは RLS で自動除外 |
| SECURITY-11（多層防御） | API 層（requireAuth）+ DB 層（RLS）の二重防御を維持 |
| NFR-01-EX-1（情報分類） | 集計 API は件数のみ返却、エントリ本文は一切含めない |

---

### NFR-U03-04: Recharts バンドルサイズ

**要件**: Recharts の導入がページロード 3秒以内（P95）の基準を超えないこと。

**対策**:
- 必要なコンポーネントのみ named import（`LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`）
- tree-shaking で不要な Recharts コンポーネントを除外
- `/dashboard/teacher` ページでのみ使用（他ページへの影響なし）
- 追加の動的インポート対策は不要（tree-shaking で十分）

---

### NFR-U03-05: テスト要件

| テスト種別 | 対象 | 基準 |
|---|---|---|
| ユニットテスト | EmotionTrendService 集計ロジック・日付補完ロジック | 80% カバレッジ |
| コンポーネントテスト | EmotionTrendChart・PeriodSelector・EmptyStateGuide | 描画確認 + props バリエーション |
| 統合テスト | GET /api/private/dashboard/emotion-trend | 認証・RLS・period パラメータ検証 |
| テナント隔離テスト | 他テナントの感情データが集計に混入しないこと | 必須 |
