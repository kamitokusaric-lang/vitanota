# Unit-04 機能設計 質問

Unit-04（管理者ダッシュボード・アラート）の機能設計にあたり、以下の質問にお答えください。
各質問の `[Answer]:` の後に選択肢の記号を記入してください。

---

## Question 1
**全教員ステータス一覧のカード表示について**

US-A-010 で管理者が見る教員カードに表示する情報はどの範囲にしますか？

A) 教員名 + 直近7日の感情カテゴリ比率（positive/negative/neutral のバー）+ 最終記録日
B) 教員名 + 直近7日の negative 比率のみ（シンプルな色分けインジケーター: 緑/黄/赤）
C) 教員名 + 直近7日の感情カテゴリ比率 + 最終記録日 + アクティブアラート件数バッジ
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2
**アラート検知のタイミングについて**

要件では「毎日深夜の定期バッチ」ですが、MVP でのアラート検知方法はどうしますか？

A) API Route（`/api/cron/detect-alerts`）を EventBridge Scheduler で毎日深夜に呼び出す
B) API Route を用意するが、MVP では手動実行のみ（EventBridge 連携は Phase 2）
C) エントリ投稿時にリアルタイムでチェック（バッチなし）
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 3
**アラート検知条件: 感情カテゴリベースの閾値について**

感情スコア（1-5）を廃止したので、「感情スコア連続低下」に相当する検知条件を再定義する必要があります。

A) 直近7日間で negative タグの比率が 60% 以上（全感情タグのうち）
B) 直近 N 日間連続で negative タグのみ使用（positive/neutral が 0）
C) 直近7日間で negative タグが N 件以上（絶対数で判定）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 4
**アラート検知条件: 記録途絶の閾値について**

「一定期間、記録が途絶えている」の日数はどうしますか？

A) 3日間（平日で考えると月水金の記録が途切れた程度）
B) 5日間（平日1週間分の記録がない状態）
C) 7日間（1週間完全に記録がない状態）
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 5
**管理者から見た特定教員の感情傾向グラフについて**

US-A-011 で管理者が特定教員の感情傾向を見る際、Unit-03 で実装した EmotionTrendService をどう再利用しますか？

A) EmotionTrendService に「指定した userId のデータを返す」メソッドを追加し、管理者 API から呼ぶ（本人限定の制約を外したバージョン）
B) 管理者専用の AdminEmotionService を別途作成する（EmotionTrendService とは独立）
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 6
**アラートクローズ後の扱いについて**

US-A-021 でアラートを「対応済み」にクローズした後、そのアラートはどう扱いますか？（US-A-022 アラート履歴は Should で落としたため）

A) クローズ済みアラートは DB に残すが、UI では非表示（将来の履歴機能で使える）
B) クローズ済みアラートは論理削除（`closed_at` タイムスタンプ）して、アクティブ一覧から除外
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 7
**管理者ダッシュボードの自動更新について**

要件では「SWR 30秒ポーリング」ですが、MVP ではどうしますか？

A) SWR `refreshInterval: 30000` で 30秒ごとに自動更新
B) SWR `refreshInterval: 60000` で 60秒ごと（負荷軽減）
C) 自動更新なし、手動リロードのみ
D) Other (please describe after [Answer]: tag below)

[Answer]: C
