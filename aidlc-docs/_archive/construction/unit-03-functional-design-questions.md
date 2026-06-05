# Unit-03 機能設計 質問

Unit-03（教員ダッシュボード）の機能設計にあたり、以下の質問にお答えください。
各質問の `[Answer]:` の後に選択肢の記号を記入してください。

---

## Question 1
**感情スコアのデータモデルについて**

現在のスキーマには「感情スコア（1〜5）」を記録するカラムがありません。
`tags` テーブルに `is_emotion` フラグがあり、感情タグ（例：喜び・不安・疲労・充実）として記録しています。

Unit-03 で「感情スコアの時系列グラフ」を実現するために、どの方針を採用しますか？

A) `journal_entries` テーブルに `emotion_score` カラム（integer 1〜5）を追加する新規マイグレーションを作成する（要件 FR-04-1 に忠実）
B) 感情タグの使用頻度を「感情指標」として集計し、数値スコアの代わりにタグベースの可視化にする（スキーマ変更なし）
C) `emotion_records` テーブルを新規作成し、エントリごとに感情スコア + 感情カテゴリを記録する（当初のユニット定義に忠実）
D) Other (please describe after [Answer]: tag below)

[Answer]: D

**ユーザー回答詳細**:
tags テーブルの `is_emotion` boolean を `type` enum (emotion/context) に置き換え、`category` enum (positive/negative/neutral) を emotion タグにのみ付与する。
感情タグ 15個（positive 5: 喜び・達成感・充実・安心・感謝 / negative 5: 不安・ストレス・疲労・焦り・不満 / neutral 5: 忙しい・混乱・気づき・無力感・もやもや）+ コンテキストタグ 8個（授業・生徒対応・保護者対応・校務・会議・部活動・事務作業・その他）をシステムデフォルトとして配置。
tenant_id・is_system_default・sort_order・created_by・複合FK・RLS はすべて維持。

---

## Question 2
**グラフライブラリの選定について**

教員ダッシュボードではインタラクティブなグラフ（折れ線・棒グラフ・期間切り替え）が必要です。どのライブラリを使用しますか？

A) Recharts（React 向け、宣言的 API、バンドルサイズ中程度、人気高）
B) Chart.js + react-chartjs-2（軽量、幅広い対応、Canvas ベース）
C) Nivo（React + D3 ベース、アニメーション充実、バンドル大きめ）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 3
**月次サマリーの表示項目について**

US-T-032（月次サマリー）で表示する情報はどの範囲にしますか？

A) 最小限：当月の記録件数・感情スコア平均（ユニット定義通り）
B) 標準：記録件数・感情スコア平均 + 前月比（増減表示）
C) 拡張：記録件数・感情スコア平均・前月比 + 最多使用タグ Top 3 + 記録頻度（週何回ペース）
D) Other (please describe after [Answer]: tag below)

[Answer]: 

---

## Question 4
**ダッシュボードの配置先について**

教員ダッシュボード（グラフ・サマリー）のUIをどこに配置しますか？

A) 既存の `/journal` ページにタブまたはセクションとして統合する（ページ遷移なし）
B) 新規ページ `/dashboard/teacher` を作成し、ナビゲーションメニューからアクセスする
C) `/journal` ページ上部にサマリーカードを配置し、詳細グラフは `/dashboard/teacher` に分離する
D) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 5
**期間切り替えの粒度について**

US-T-030 では「週・月で表示期間を切り替えられる」とありますが、どの粒度にしますか？

A) 週（直近7日）・月（直近30日）の2段階（ユニット定義通り）
B) 週（直近7日）・月（直近30日）・3ヶ月（直近90日）の3段階
C) カスタム期間選択（カレンダーピッカーで任意の範囲を指定）
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 6
**データが不足している場合の表示について**

教員がまだ記録を始めたばかりでデータが少ない場合、グラフをどう表示しますか？

A) データポイントが少なくてもそのままグラフを表示する（1点でも表示）
B) 最低3件以上のデータがある場合のみグラフを表示し、不足時は「記録を続けるとグラフが見られます」等のガイドメッセージを表示する
C) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 7
**タグ別頻度グラフの対象について**

US-T-031（タグ別記録頻度グラフ）で表示するタグの範囲はどうしますか？

A) 感情タグ（`is_emotion = true`）のみを対象にする
B) 全タグ（感情タグ + 業務タグ）を対象にする
C) 感情タグと業務タグを分けて2つのグラフを表示する
D) Other (please describe after [Answer]: tag below)

[Answer]: 
