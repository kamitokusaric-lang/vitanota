# ユーザーストーリー生成プラン

## 実行チェックリスト

### PART 1: プランニング
- [x] Step 1: ユーザーストーリー実施判断（完了）
- [x] Step 2: ストーリープラン作成（本ファイル）
- [x] Step 3: 質問生成（本ファイルに埋め込み）
- [x] Step 4: 必須成果物の確認
- [x] Step 5: ストーリー整理アプローチの選択（D: ペルソナ × エピック）
- [x] Step 6: プランの保存（完了）
- [x] Step 7: ユーザーへの入力依頼
- [x] Step 8: 回答収集（全8問回答済み）
- [x] Step 9: 回答の分析（矛盾・曖昧点なし）
- [x] Step 10: フォローアップ質問不要
- [x] Step 11: 実装詳細を避けることを確認（ストーリー生成方針・フォーマットの決定に集中し、優先順位付けや開発スケジュールは含めない）
- [x] Step 12: 承認プロンプトを audit.md に記録（2026-04-12T00:15:00Z）
- [x] Step 13: プランの承認（回答完了をもって承認とみなす）

### PART 2: 生成
- [x] Step 15: personas.md の生成
- [x] Step 16: stories.md の生成
- [x] Step 17: 進捗更新（aidlc-state.md を更新）
- [x] Step 18: 生成の継続または完了確認（全必須成果物 personas.md・stories.md の生成を確認）
- [x] Step 19: 完了メッセージ前の audit.md 記録（2026-04-12T00:16:00Z）
- [x] Step 20: 完了メッセージの提示

---

## 質問ファイル

### Question 1
ユーザーストーリーの整理方法として、どのアプローチが最も合っていますか？

A) ペルソナベース — 教員・管理者それぞれの視点でストーリーをグループ化する
B) ユーザージャーニーベース — 「ログイン → 記録 → 閲覧 → 分析」などの流れに沿って整理する
C) エピックベース — 大きな機能単位（認証・日誌・ダッシュボード・アラート等）でまとめ、その下にストーリーを配置する
D) A と C の組み合わせ（ペルソナ × エピック）
E) Other (please describe after [Answer]: tag below)

[Answer]: D

---

### Question 2
ストーリーの粒度（大きさ）はどの程度にしますか？

A) エピック + ストーリー（大きな機能をエピックとして定義し、その下に実装可能な小さなストーリーを配置）
B) ストーリーのみ（エピックなしでフラットに管理）
C) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3
受け入れ基準（Acceptance Criteria）の記述形式はどうしますか？

A) Given / When / Then 形式（BDDスタイル、E2Eテストシナリオと直接対応）
B) 箇条書き形式（シンプルな「〜できること」リスト）
C) A と B の組み合わせ（主要ストーリーは Given/When/Then、シンプルなものは箇条書き）
D) Other (please describe after [Answer]: tag below)

[Answer]: C

---

### Question 4
ペルソナの詳細度はどの程度にしますか？

A) 簡易ペルソナ（名前・役割・主な目標・課題 の4項目）
B) 標準ペルソナ（名前・背景・役割・日常業務・目標・課題・技術リテラシー）
C) 詳細ペルソナ（標準 + 感情的なニーズ・使用シーン・クォート）
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 5
教員ペルソナについて、どのような教員像を想定していますか？

A) ICTに不慣れな中高年教員（スマホは使うがPCは苦手）
B) ICTに慣れた若手教員（日常的にスマホ・アプリを活用）
C) A と B 両方のペルソナを作成する
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

### Question 6
学校管理者ペルソナについて、主に誰を想定しますか？

A) 校長（最終判断者・多忙・ダッシュボードをサッと確認したい）
B) 教頭（実務担当・教員と直接対話する立場）
C) A と B 両方のペルソナを作成する
D) 事務職員も含める
E) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 7
ストーリーの優先度付けはどうしますか？

A) MoSCoW法（Must / Should / Could / Won't）で優先度を明示する
B) MVP / フェーズ2 の区分のみで管理する（要件定義と同じ区分）
C) 優先度は付けず、ストーリーの内容に集中する
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 8
ストーリーの記述言語はどうしますか？

A) 日本語（ステークホルダーへの共有を考慮）
B) 英語（コードベースとの統一）
C) 日本語（ストーリー本文）+ 英語（技術的な受け入れ基準）
D) Other (please describe after [Answer]: tag below)

[Answer]: A
