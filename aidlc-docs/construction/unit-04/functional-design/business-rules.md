# Unit-04 ビジネスルール

**作成日**: 2026-04-17
**対象ストーリー**: US-A-010・US-A-011・US-A-020・US-A-021

---

## BR-U04-01: アクセス制御

| ルール | 内容 |
|---|---|
| BR-U04-01a | `/api/admin/*` は `school_admin` ロール必須。teacher は 403 |
| BR-U04-01b | 管理者は自テナント内の教員データのみ閲覧可能（RLS で強制） |
| BR-U04-01c | 管理者は日誌本文（content）を一切取得できない。API レスポンスに content フィールドを含めない |
| BR-U04-01d | 管理者が閲覧できるのは集計データ（感情カテゴリ比率・件数・日付）のみ |

---

## BR-U04-02: 教員ステータスカード

| ルール | 内容 |
|---|---|
| BR-U04-02a | テナント内の全教員（role='teacher'）をカード表示 |
| BR-U04-02b | 退会済み（deleted_at IS NOT NULL）の教員は除外 |
| BR-U04-02c | 直近7日の感情カテゴリ比率（positive/negative/neutral）を表示 |
| BR-U04-02d | 最���記録日を表示（記録なしの場合は「記録なし」） |
| BR-U04-02e | アクティブアラート件数をバッジ表示 |

---

## BR-U04-03: アラート検知 — negative_trend

| ルール | 内容 |
|---|---|
| BR-U04-03a | 直近7日間の全感情タグのうち negative 比率 >= 60% でアラート生成 |
| BR-U04-03b | 感情タグが 0件の教員はスキップ（記録途絶で別途検知） |
| BR-U04-03c | 同一教員に同じ type の open アラートが既にある場合はスキップ（重複防止） |
| BR-U04-03d | detection_context に比率・件数・閾値を記録 |

---

## BR-U04-04: アラート検知 — recording_gap

| ルール | 内容 |
|---|---|
| BR-U04-04a | 最終記録日から5日以上経過でアラート生成 |
| BR-U04-04b | 記録が1件もない教員もスキップ（新規登録直後は対象外） |
| BR-U04-04c | 同一教員に同じ type の open アラートが既にある場���はスキップ |
| BR-U04-04d | detection_context に最終記録日・経過日数・閾値を記録 |

---

## BR-U04-05: アラートクローズ

| ルール | ��容 |
|---|---|
| BR-U04-05a | school_admin のみクローズ可能 |
| BR-U04-05b | status を 'open' → 'closed' に更新 |
| BR-U04-05c | closed_by にクローズした管理者の userId を記録 |
| BR-U04-05d | closed_at に現在時刻を記録 |
| BR-U04-05e | 既に closed のアラートをクローズしようとした場合は 400 |
| BR-U04-05f | クローズ済みアラートは DB に残すが UI のアクティブ一覧には表示しない |

---

## BR-U04-06: cron API 認証

| ルール | 内容 |
|---|---|
| BR-U04-06a | `/api/cron/detect-alerts` は API キー認証（`Authorization: Bearer <CRON_API_KEY>`） |
| BR-U04-06b | MVP では `.env.local` に `CRON_API_KEY` を設定 |
| BR-U04-06c | 将来は EventBridge Scheduler から呼び出し |
| BR-U04-06d | 全テナントを対象に一括検知を実行 |

---

## BR-U04-07: 管理者向け感情傾向グラフ

| ルール | 内容 |
|---|---|
| BR-U04-07a | EmotionTrendService を拡張し、school_admin が指定教員のデータを取得可能にする |
| BR-U04-07b | 期間は week / month / quarter の3段階（Unit-03 と同じ） |
| BR-U04-07c | targetUserId がテナント内の教員であることを API 層で検証 |
| BR-U04-07d | 日誌本文は含めない（集計データのみ） |
