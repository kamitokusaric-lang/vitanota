# Unit-01 NFR要件プラン

## 実行チェックリスト

### PART 1: プランニング
- [x] Step 1: 機能設計成果物の分析
- [x] Step 2: NFR要件プラン作成（本ファイル）
- [x] Step 3: 質問生成（本ファイルに埋め込み）
- [x] Step 4: プランの保存
- [x] Step 5: ユーザーへの入力依頼
- [x] Step 6: 回答収集
- [x] Step 7: 回答の分析（矛盾・曖昧点の確認）
- [x] Step 8: フォローアップ質問（Q3・Q4=AWS統一、Q5=A確定）

### PART 2: 生成
- [x] Step 9: nfr-requirements.md の生成
- [x] Step 10: tech-stack-decisions.md の生成
- [x] Step 11: 進捗更新（aidlc-state.md）
- [x] Step 12: audit.md 記録
- [x] Step 13: 完了メッセージの提示

---

## コンテキスト分析メモ

**既に確定している NFR（インセプションフェーズ）**:
- NFR-02: レスポンスタイム 3秒以内（P95）
- NFR-03: テナントあたり最大 200ユーザー・月次 10,000 セッション
- NFR-04: 可用性 99.5%（月次 3.6時間まで停止許容）
- NFR-05: GDPR 準拠・個人情報保護法対応
- SECURITY-01〜15: セキュリティベースライン全適用
- テックスタック: Next.js Pages Router・Drizzle ORM・PostgreSQL・Auth.js v4・Vercel

**Unit-01 で新たに決定が必要な NFR**:
1. PostgreSQL ホスティングサービス（Drizzle 設定・RLS 設定に直結）
2. サーバーレス環境での DB 接続プール方式
3. 構造化ログの出力先（SECURITY-03 準拠）
4. エラーモニタリングの採用有無
5. 認証フローのテスト戦略

---

## 質問ファイル

### Question 1
【確定】AWS に統一する方針により以下を決定。

- **PostgreSQL ホスティング**: AWS RDS PostgreSQL（東京リージョン ap-northeast-1・プライベート VPC 内）
- **Next.js デプロイ**: AWS App Runner（東京リージョン・VPC コネクター経由で RDS に接続）
- **アラートバッチ**: AWS EventBridge Scheduler + Lambda（Vercel Cron の代替）

[Answer]: AWS統一（RDS PostgreSQL + App Runner、東京リージョン）

---

### Question 2
【確定】接続プール方式。

App Runner は VPC コネクターで RDS のプライベート VPC に接続するため、RDS Proxy（AWS マネージド接続プーラー）を使用する。

- **接続プール**: AWS RDS Proxy（東京リージョン・IAM 認証）
- **Drizzle 接続先**: RDS Proxy エンドポイント（直接 RDS エンドポイントではない）

[Answer]: RDS Proxy（AWS マネージド）

---

### Question 3
SECURITY-03 では構造化ログを「一元化されたログサービス」に送ることが必須です。MVP でどこにログを出力しますか？

A) **Vercel ログ（console.log）** — 追加コストなし。Vercel ダッシュボードでリアルタイム閲覧可能。ただしログ保持期間は 1 時間（無料プラン）〜 7日（Pro）  
B) **外部ログサービス（Axiom・Datadog・Logtail 等）** — 長期保持・検索・アラート設定が可能。SECURITY-14 の「90日保管」を確実に満たす  
C) Other（[Answer]: タグ後に記述）

[Answer]:

---

### Question 4
本番環境でのエラー・例外モニタリングについて確認します。

A) **Sentry（無料プラン）** — JavaScript エラー・API エラーをキャッチし、スタックトレースとユーザーコンテキストを記録。Next.js 公式連携あり  
B) **Vercel エラーログのみ** — 追加ツールなし。Vercel ダッシュボードのエラーログで対応  
C) Other（[Answer]: タグ後に記述）

[Answer]:

---

### Question 5
Unit-01 の認証フロー・テナント管理のテスト戦略を確認します。

A) **ユニットテスト + E2E テスト** — TenantService・RoleService は Vitest でユニットテスト。ログインフロー・招待フローは Playwright で E2E テスト  
B) **ユニットテストのみ** — サービス層の関数を Vitest でテスト。Auth.js の OAuth フローは実 Google 認証が必要なため E2E は後回し  
C) Other（[Answer]: タグ後に記述）

[Answer]:

---
