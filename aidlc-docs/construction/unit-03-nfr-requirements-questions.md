# Unit-03 NFR要件 質問

Unit-03（教員ダッシュボード）の NFR 要件にあたり、以下の質問にお答えください。
各質問の `[Answer]:` の後に選択肢の記号を記入してください。

---

## Question 1
**感情傾向 API のキャッシュ戦略について**

`GET /api/private/dashboard/emotion-trend` は教員本人のデータを集計して返します。どのキャッシュ戦略を採用しますか？

A) キャッシュなし（毎回 DB 集計、常に最新データ）
B) SWR クライアントキャッシュのみ（dedupingInterval で重複リクエスト抑制、サーバー側キャッシュなし）
C) サーバー側 Cache-Control + SWR（`private, s-maxage=60, stale-while-revalidate=120`）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2
**集計クエリの最適化について**

感情傾向の集計は `journal_entries JOIN journal_entry_tags JOIN tags` の 3テーブル結合 + `GROUP BY DATE()` です。quarter（90日）期間では対象行が多くなる可能性があります。

A) 現状のインデックス（`journal_entries_user_created_idx`、`journal_entry_tags_tag_idx`）で十分。追加インデックスは不要
B) `tags` テーブルに `(type, category)` 複合インデックスを追加する
C) マテリアライズドビューで日次集計を事前計算する
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 3
**Recharts のバンドルサイズ対策について**

Recharts は tree-shaking 対応ですが、全体で約 100KB (gzip) あります。

A) 必要なコンポーネントのみ named import し、tree-shaking に任せる（追加対策なし）
B) `next/dynamic` で `/dashboard/teacher` ページのグラフ部分を動的インポートする（初回ロードに含めない）
C) Other (please describe after [Answer]: tag below)

[Answer]: A
