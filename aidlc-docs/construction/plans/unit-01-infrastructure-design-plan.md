# Unit-01 インフラ設計プラン

## 実行チェックリスト

### PART 1: プランニング
- [x] Step 1: 機能設計・NFR設計成果物の分析
- [x] Step 2: インフラ設計プラン作成（本ファイル）
- [x] Step 3: 質問生成（本ファイルに埋め込み）
- [x] Step 4: プランの保存
- [x] Step 5: ユーザーへの入力依頼
- [x] Step 6: 回答収集（Q1=A dev+prod / Q2=A GitHub Actions / Q3=A t4g.micro / Q4=A 0.25vCPU/0.5GB / Q5=A メール）
- [x] Step 7: 回答の分析（Q4 メモリリスクを設計に注記として記録）
- [x] Step 8: フォローアップ質問不要

### PART 2: 生成
- [x] Step 9: infrastructure-design.md の生成（Mermaid 構成図含む）
- [x] Step 10: deployment-architecture.md の生成
- [x] Step 11: shared-infrastructure.md の生成
- [x] Step 12: 進捗更新（aidlc-state.md）
- [x] Step 13: audit.md 記録
- [x] Step 14: 完了メッセージの提示

---

## コンテキスト分析メモ

**既に確定しているインフラ（NFR要件・NFR設計で確定）**:
- コンピューティング: AWS App Runner（東京）
- データベース: AWS RDS PostgreSQL 16（東京・Multi-AZ）
- 接続プール: AWS RDS Proxy（IAM 認証）
- ログ: Amazon CloudWatch Logs（90日保持）
- 監視: Amazon CloudWatch アラーム + SNS
- シークレット: AWS Secrets Manager
- バッチ: AWS EventBridge Scheduler + Lambda（Unit-04）

**インフラ設計で決定が必要な事項**:
1. デプロイ環境の数と構成（dev/prod か dev/staging/prod か）
2. CI/CD パイプラインのサービス選定
3. RDS インスタンスタイプ（コストとパフォーマンスのバランス）
4. App Runner インスタンス構成（vCPU・メモリ）
5. CloudWatch アラーム通知先

---

## 質問ファイル

### Question 1
デプロイ環境の構成を確認します。

A) **2環境（dev + prod）** — 開発環境と本番環境のみ。MVP 初期のシンプルな構成。コスト最小
B) **3環境（dev + staging + prod）** — 開発・ステージング（本番同等）・本番の3環境。本番リリース前に staging で最終確認できる
C) Other（[Answer]: タグ後に記述）

[Answer]:A

---

### Question 2
CI/CD パイプラインのサービスを確認します。コードのビルド・テスト・デプロイを自動化します。

A) **GitHub Actions** — GitHub リポジトリと統合。無料枠あり。Next.js・AWS ECR・App Runner への公式 Action が揃っている
B) **AWS CodePipeline + CodeBuild** — AWS ネイティブ。App Runner との統合が容易だが設定が複雑
C) Other（[Answer]: タグ後に記述）

[Answer]:A

---

### Question 3
本番環境の RDS インスタンスタイプを確認します。対象規模は教員 10〜50 名 / テナント。

A) **db.t4g.micro**（2 vCPU・1 GB RAM） — 最小構成。月額約 $15〜20。MVP 初期・小規模校向け。CPU クレジット制のため短時間のバーストに対応
B) **db.t4g.small**（2 vCPU・2 GB RAM） — 余裕のある構成。月額約 $30〜40。複数テナント同時利用でも安定
C) Other（[Answer]: タグ後に記述）

[Answer]:A

---

### Question 4
App Runner のインスタンス構成を確認します。

A) **0.25 vCPU / 0.5 GB** — 最小構成。月額約 $5〜10（リクエストベース課金）。MVP 初期・低トラフィック向け
B) **0.5 vCPU / 1 GB** — 標準構成。月額約 $10〜20。複数同時リクエストでも余裕あり
C) Other（[Answer]: タグ後に記述）

[Answer]:A

---

### Question 5
CloudWatch アラーム発報時の通知先を確認します。

A) **メール（AWS SNS + Email）** — 設定シンプル。障害・エラー急増時にメールで通知
B) **Slack（AWS SNS + Chatbot）** — Slack チャンネルに通知。AWS Chatbot を経由するため追加設定が必要
C) Other（[Answer]: タグ後に記述）

[Answer]:A

---
