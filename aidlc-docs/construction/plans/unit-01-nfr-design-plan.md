# Unit-01 NFR設計プラン

## 実行チェックリスト

### PART 1: プランニング
- [x] Step 1: NFR要件成果物の分析
- [x] Step 2: NFR設計プラン作成（本ファイル）
- [x] Step 3: 質問生成（本ファイルに埋め込み）
- [x] Step 4: プランの保存
- [x] Step 5: ユーザーへの入力依頼
- [x] Step 6: 回答収集（Q1=A pino・Q2=B SDK+5分キャッシュ・Q3=B IAM認証）
- [x] Step 7: 回答の分析（矛盾・曖昧点なし）
- [x] Step 8: フォローアップ質問不要

### PART 2: 生成
- [x] Step 9: nfr-design-patterns.md の生成
- [x] Step 10: logical-components.md の生成
- [x] Step 11: 進捗更新（aidlc-state.md）
- [x] Step 12: audit.md 記録
- [x] Step 13: 完了メッセージの提示

---

## コンテキスト分析メモ

**NFR要件で確定済みの設計方針**:
- AWS App Runner + RDS Proxy + RDS PostgreSQL（東京）
- CloudWatch Logs（90日保持）・CloudWatch アラーム
- JWT セッション（24時間スライディング）・HttpOnly Cookie
- レート制限: ログインエンドポイント・IP ごと 10回/分・メモリベース
- シークレット管理: AWS Secrets Manager

**NFR設計で決定が必要な事項**:
1. 構造化ログの実装ライブラリ（CloudWatch への出力方式）
2. AWS Secrets Manager からの秘匿情報の読み込み方式
3. RDS Proxy の認証方式（IAM 認証 vs パスワード認証）

---

## 質問ファイル

### Question 1
構造化ログの実装ライブラリを確認します。Next.js API Routes および App Runner 上での JSON ログ出力に使用します。

A) **pino** — 高パフォーマンス・デフォルトで JSON 出力。Node.js エコシステムで最速クラス。`pino-http` で HTTP リクエストログを自動付与できる  
B) **winston** — 設定の柔軟性が高い。トランスポート（出力先）を複数設定可能。JSON フォーマットは設定が必要  
C) **console.log のみ（追加ライブラリなし）** — 追加依存なし。App Runner の stdout が CloudWatch に自動転送される。構造化には手動で JSON.stringify が必要  
D) Other（[Answer]: タグ後に記述）

[Answer]:

---

### Question 2
AWS Secrets Manager からシークレット（DB接続文字列・OAuth シークレット等）を読み込む方式を確認します。

A) **起動時に一括読み込み（環境変数に注入）** — App Runner の「シークレット」設定で Secrets Manager の値を環境変数として注入する。コールド起動時に一度読み込み、アプリは `process.env` から参照する。実装コストが最も低い  
B) **SDK で都度読み込み（リアルタイム取得）** — `@aws-sdk/client-secrets-manager` を使い、起動時またはリクエスト時に SDK で取得する。ローテーション後の新しい値をすぐ反映できる  
C) Other（[Answer]: タグ後に記述）

[Answer]:

---

### Question 3
RDS Proxy への認証方式を確認します。

A) **パスワード認証（Secrets Manager 経由）** — DB ユーザー名・パスワードを Secrets Manager に保存し、接続文字列（`DATABASE_URL`）として App Runner に渡す。実装がシンプルで Drizzle との統合が容易  
B) **IAM 認証** — IAM ロールを使って DB に接続する。パスワード不要でよりセキュアだが、Drizzle での設定が複雑になる（IAM トークンの定期更新が必要）  
C) Other（[Answer]: タグ後に記述）

[Answer]:

---
