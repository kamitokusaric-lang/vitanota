# Unit-04 NFR要件 質問

Unit-04（管理者ダッシュボード・アラート）の NFR 要件にあたり、以下の質問にお答えください。
各質問の `[Answer]:` の後に選択肢の記号を記入してください。

---

## Question 1
**alerts テーブルの RLS について**

alerts テーブルにも RLS を適用しますか？

A) RLS 適用（tenant_id ベースで school_admin のみ SELECT/UPDATE 可能）
B) RLS なし、API 層の school_admin チェックのみで制御
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2
**cron API の認証方式について**

`/api/cron/detect-alerts` の認証をどうしますか？

A) 環境変数 `CRON_API_KEY` との Bearer トークン比較（シンプル）
B) 通常の session 認証（system_admin ロールでログインして叩く）
C) Other (please describe after [Answer]: tag below)

[Answer]: 

---

## Question 3
**全教員ステータス集計のパフォーマンスについて**

テナント内の全教員のステータスを1リクエストで集計します。教員 50名×直近7日で最大何百行の JOIN になりますが、対策は？

A) 追加インデックス不要（既存の user_created_idx + tenant_id で十分）
B) alerts テーブルの (tenant_id, status) 複合インデックスのみ追加（domain-entities.md で定義済み）
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 4
**アラート検知バッチの実行スコープについて**

`/api/cron/detect-alerts` は全テナントを一括処理しますか？

A) 全テナント一括（MVP の規模なら十分）
B) テナントID指定で個別実行（将来のスケール対応）
C) Other (please describe after [Answer]: tag below)

[Answer]: A
