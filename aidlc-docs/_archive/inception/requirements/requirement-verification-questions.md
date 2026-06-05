# 要件確認質問（全回答済み）

---

## Question 1
このプロジェクトで作成するものは何ですか？

A) Webアプリケーション（ブラウザで動作するサービス）
B) モバイルアプリ（iOS / Android）
C) デスクトップアプリ
D) CLIツール / スクリプト
E) APIサービス / バックエンドのみ
F) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 2
このプロジェクトの主な目的・解決したい課題は何ですか？

A) 情報を整理・管理するツール（ノート、タスク管理など）
B) コミュニケーション・コラボレーションツール
C) データ分析・可視化ツール
D) EC・決済・予約などビジネス業務システム
E) ゲームやエンターテインメント
F) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 3
主なターゲットユーザーは誰ですか？

A) 個人ユーザー（自分自身が使うツール）
B) 特定チーム・社内向け
C) 一般消費者（BtoC）
D) 企業・ビジネス向け（BtoB）
E) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## Question 4
技術スタック（使用言語・フレームワーク）の希望はありますか？

A) 特に指定なし（最適なものを提案してほしい）
B) TypeScript / React / Next.js系
C) Python系（Django, FastAPI など）
D) Java / Kotlin / Spring系
E) Go
F) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 5
データの永続化（保存）についてどうしますか？

A) データベース必要（RDB: PostgreSQL, MySQL など）
B) データベース必要（NoSQL: MongoDB, DynamoDB など）
C) ローカルファイル・ブラウザストレージ
D) 外部サービスのストレージを利用（S3, Firebaseなど）
E) 特に保存は不要
F) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 6
ユーザー認証・ログインは必要ですか？

A) はい、独自の認証（メール/パスワード）
B) はい、ソーシャルログイン（Google、GitHub など）
C) はい、SSO / 企業認証
D) いいえ、認証不要
E) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question 7
プロジェクトの規模感を教えてください。

A) 小規模（個人ツール・プロトタイプ、数週間以内）
B) 中規模（チーム開発、1〜3ヶ月）
C) 大規模（複数チーム、3ヶ月以上）
D) Other (please describe after [Answer]: tag below)

[Answer]: B

---

## Question: Security Extensions
このプロジェクトにセキュリティ拡張ルールを適用しますか？

A) Yes — 本番グレードのアプリ向けにすべてのSECURITYルールをブロッキング制約として適用する（推奨）
B) No — SECURITYルールをスキップ（PoC・プロトタイプ・実験的プロジェクト向け）
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question: Property-Based Testing Extension
プロパティベーステスト（PBT）ルールを適用しますか？

A) Yes — すべてのPBTルールをブロッキング制約として適用（ビジネスロジック・データ変換・シリアライゼーション・ステートフルコンポーネントを持つプロジェクトに推奨）
B) Partial — 純粋関数とシリアライゼーションのラウンドトリップのみにPBTルールを適用
C) No — PBTルールをスキップ（シンプルなCRUD・UIのみのプロジェクト・薄い統合レイヤー向け）
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 8
「vitanota」はどのようなツールですか？

A) マークダウン対応のノートアプリ（Notion・Obsidianのようなもの）
B) タスク・プロジェクト管理ツール（Asanaのようなもの）
C) ノートとタスク両方を統合したツール（Notionのようなもの）
D) ドキュメント・Wiki管理ツール（Confluenceのようなもの）
E) Other (please describe after [Answer]: tag below)

[Answer]: E — ターゲットは学校の教員。教員の活動、感情の動き、タスクの動きを日々記録し、分析し教員の状態を可視化するもの。

---

## Question 9
チームコラボレーション機能は必要ですか？

A) はい、複数ユーザーが同じノート・タスクを共有・編集できる
B) はい、閲覧共有のみ（編集は個人）
C) いいえ、個人ごとに独立したワークスペース（同じ組織でも共有なし）
D) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 10
BtoBとして、どのような組織単位で使われますか？

A) 組織（会社）単位でテナント分離するマルチテナントSaaS
B) 1つの組織のみ対象（社内ツール）
C) 部署・チーム単位で管理できるマルチテナント
D) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## Question 11
記録の入力形式について教えてください。

A) リッチテキストエディタ（太字・見出し・箇条書きなど）
B) マークダウン記法
C) プレーンテキストのみ
D) コードブロック・シンタックスハイライトが必要
E) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## Question 12
検索・フィルタリング機能について必要なレベルを教えてください。

A) 基本的なキーワード検索（タイトル・本文）
B) 全文検索（高速な全文インデックス）
C) タグ・ラベルによるフィルタリング
D) AとCの組み合わせ（キーワード検索 + タグフィルタリング）
E) BとCの組み合わせ
F) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## Question 13
想定する同時利用ユーザー数（1テナントあたり）はどのくらいですか？

A) 小チーム（〜10名）
B) 中規模チーム（10〜100名）
C) 大規模（100名以上）
D) 未定・スケールアウトできればよい
E) Other (please describe after [Answer]: tag below)

[Answer]: D

---

## Question 14
MVPとして最初にリリースする機能はどれですか？（優先度が最も高いもの1つ）

A) ノート・日誌の作成・編集・閲覧
B) タスク管理（作成・期日・担当者）
C) ダッシュボード・状態可視化
D) チーム共有・コラボレーション
E) Other (please describe after [Answer]: tag below)

[Answer]: A
