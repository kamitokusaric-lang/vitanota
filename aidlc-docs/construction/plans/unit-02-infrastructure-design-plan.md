# Unit-02 インフラ設計プラン

## 前提
- Unit-01 のインフラ基盤（App Runner・RDS・RDS Proxy・CloudFront・WAF・Secrets Manager・CloudWatch Logs）を全継承
- Unit-02 で**新規追加する外部サービスはゼロ**（nfr-design の logical-components.md で確認済み）
- したがって本ステージは「既存インフラへの追加設定」の定義が中心

## 実行ステップ

- [x] Step 1: 機能設計・NFR設計の読み込み
- [x] Step 2: Unit-02 で追加が必要なインフラ設定要素の特定
- [x] Step 3: 質問への回答受領（Q1=Lambda方式・Q2=A・Q3=A・Q4=A）
- [x] Step 4: infrastructure-design.md 作成
- [x] Step 5: deployment-architecture.md 作成
- [x] Step 6: 完了メッセージ提示し承認待ち

---

## Unit-02 で追加が必要なインフラ設定要素

1. **DB マイグレーション**（3テーブル追加：journal_entries・tags（`is_emotion` フラグ統合）・journal_entry_tags）
2. **RLS ポリシー適用**（journal_entries 2ポリシー・tags 1ポリシー）
3. **CloudFront キャッシュポリシー**（共有タイムライン専用）
4. **CloudFront パスパターンルーティング**（`/api/journal/entries` のみキャッシュ有効）
5. **CloudWatch Logs メトリクスフィルター**（新規イベント：journal_entry_created/updated/deleted・tag_created/deleted）
6. **WAF ルール調整**（日誌本文エンドポイントは初期 Count モード → R12 対策）
7. **環境変数/Secrets の追加**（あれば）

---

## 質問

### Q1: DB マイグレーションの実行タイミング

機能設計で3テーブルを追加するが、App Runner デプロイとの関係は？

- A. デプロイパイプラインの App Runner 更新**前**に GitHub Actions で自動実行（Drizzle Kit）
- B. 初回のみ手動実行、以降のリリースで自動化
- C. App Runner コンテナ起動時に自動実行（起動スクリプト）
- D. その他

[Answer]: **専用 Lambda 方式（Unit-01 に `vitanota-db-migrator` Lambda を遡及追加）**
- Phase 1（初期運用）: 開発者が手動で `aws lambda invoke --payload '{"command":"migrate"}'` を実行
- Phase 2（自動化）: GitHub Actions deploy.yml から同じ invoke を呼び出し、手動→自動の移行コストゼロ
- 踏み台 EC2 は作らない。アドホック SQL 調査は将来の `query` コマンド拡張または必要時に CloudShell VPC で対応
- Lambda は dev/prod の2関数、VPC プライベートサブネット配置、Node.js 20 ランタイム、Drizzle Kit + マイグレーション SQL をパッケージに同梱

---

### Q2: システムデフォルトタグのシード方法

NFR-U02-03 で「テナント作成時にアプリケーションコードからシード」と確定済みだが、**既存テナント**への適用は？

- A. 既存テナントは対象外（Unit-02 投入時点で既存テナントはない想定）
- B. 一度限りのマイグレーションスクリプトで既存テナントにもシード
- C. 起動時ヘルスチェックで検出し自動シード
- D. その他

[Answer]: 

---

### Q3: CloudFront キャッシュ対象パスパターン

PP-U02-02 で共有タイムラインのみキャッシュ対象。CloudFront でどう制御する？

- A. デフォルトキャッシュポリシー `CachingDisabled`、`/api/journal/entries` のみ `CacheOptimizedWithCacheControl` をパスパターンで適用
- B. 全 `/api/*` を一律 `CacheOptimizedWithCacheControl`（オリジンの Cache-Control ヘッダーに従う）
- C. アプリ側の Cache-Control のみに任せ、CloudFront は全て `Managed-CachingDisabled`
- D. その他

[Answer]: 

---

### Q4: WAF 初期モード

R12 対策で日誌エントリ投稿エンドポイントの WAF ルールを Count モードで始めるか。

- A. Unit-02 投入時、日誌 POST エンドポイントのみ WAF を Count モードで運用。1週間後にレビューし Block に切替
- B. 最初から Block モードで投入、誤検知が発生したら対応
- C. 全エンドポイントを Count モードで1週間運用してから全体 Block
- D. その他

[Answer]: 

---

## 想定成果物

1. `aidlc-docs/construction/unit-02/infrastructure-design/infrastructure-design.md`
2. `aidlc-docs/construction/unit-02/infrastructure-design/deployment-architecture.md`
