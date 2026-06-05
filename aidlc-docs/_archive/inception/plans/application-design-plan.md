# アプリケーション設計プラン

## 実行チェックリスト

### PART 1: プランニング
- [x] Step 1: コンテキスト分析（要件・ユーザーストーリー）
- [x] Step 2: 設計プラン作成（本ファイル）
- [x] Step 3: 質問生成（本ファイルに埋め込み）
- [x] Step 4: プランの保存
- [ ] Step 5: ユーザーへの入力依頼
- [ ] Step 6: 回答収集（全8問回答済みになったら ✓）
- [ ] Step 7: 回答の分析（矛盾・曖昧点の確認）
- [ ] Step 8: フォローアップ質問（必要な場合）
- [x] Step 9: 承認プロンプトを audit.md に記録

### PART 2: 生成
- [x] Step 10: components.md の生成
- [x] Step 11: component-methods.md の生成
- [x] Step 12: services.md の生成
- [x] Step 13: component-dependency.md の生成
- [x] Step 14: application-design.md（統合ドキュメント）の生成
- [x] Step 15: 進捗更新（aidlc-state.md を更新）
- [x] Step 16: 承認プロンプトを audit.md に記録
- [x] Step 17: 完了メッセージの提示

---

## コンテキスト分析メモ

**システム概要**: 教員ウェルネス管理 BtoB マルチテナント SaaS

**MVP の主要機能領域**:
1. 認証・マルチテナント管理（FR-01・FR-02）
2. 日誌・感情記録（FR-03・FR-04）
3. 教員個人ダッシュボード・可視化（FR-06 の一部）
4. 管理者ダッシュボード（FR-08）
5. アラートシステム（FR-09）

**テックスタック（確定）**: Next.js (TypeScript)・PostgreSQL・Auth.js・Prisma・Recharts or Chart.js

**セキュリティ拡張**: 有効（SECURITY-01〜15）

---

## 質問ファイル

### Question 1
Next.js のルーティングアーキテクチャはどちらを採用しますか？

A) **App Router**（Next.js 13+）— React Server Components・Server Actions・ストリーミングに対応。モダンなアプローチだが学習コストあり
B) **Pages Router**（従来型）— 安定性が高く、Auth.js との実績が豊富。シンプルでわかりやすい

[Answer]: B
**判断理由**: Auth.js v4 との組み合わせ実績が豊富で安定している。学習コストを抑え、MVP を確実にリリースすることを優先。App Router の RSC・Server Actions の学習コストよりも、枯れた技術での開発速度を重視した。

---

### Question 2
バックエンドのロジックをどのように構成しますか？

A) **サービス層を設ける**（`/src/services/` に `JournalService`・`AlertService` 等のクラスを配置し、API Routes から呼び出す）— テスタビリティが高く、ビジネスロジックが分離される
B) **API Routes にロジックを直接記述する**（薄いサービス関数程度に留める）— シンプルで小規模プロジェクトに向く
C) Other（[Answer]: タグ後に記述）

[Answer]: A
**判断理由**: アラート判定・テナント隔離チェック・感情スコア集計など複雑なビジネスロジックが存在する。サービス層に分離することでユニットテスト（Vitest）が HTTP なしに書けるようになり、NFR-04 のカバレッジ 80% 以上を達成しやすくなる。ロジックの重複も防げる。

---

### Question 3
フロントエンドのデータフェッチ・状態管理はどのアプローチにしますか？

A) **Server Components + Server Actions 中心**（データフェッチをサーバー側で完結させ、クライアントの JS を最小化）
B) **Client Components + SWR / React Query**（クライアントからAPI呼び出し。インタラクティブなUIに向く）
C) **A と B の組み合わせ**（初期表示は Server Components、インタラクティブ部分は Client Components）
D) Other（[Answer]: タグ後に記述）

[Answer]: C
**判断理由**: グラフライブラリ（Recharts）は Client Component が必須のため、Server Components のみでは完結しない。Pages Router（Q1=B）の文脈では「ハイブリッド」は `getServerSideProps` で初期データをサーバー取得 + SWR でクライアント側の再取得・ポーリングの組み合わせとなる。初期表示速度とインタラクティブ性を両立する。
⚠️ **注記**: Q1=B（Pages Router）のため、Server Components（RSC）は使用不可。C の「サーバー側初期取得」は `getServerSideProps` で実現する。

---

### Question 4
感情スコアの集計・傾向データ（管理者ダッシュボードで使用）はどのように計算しますか？

A) **クエリ時にリアルタイム集計**（`SELECT AVG(score) ...` を毎回実行）— データは常に最新だが、負荷が高くなる可能性
B) **定期バッチで事前計算・DB に保存**（集計テーブルを別途持つ）— クエリが速いが、実装が複雑になる
C) **キャッシュ（Redis 等）に一時保存**（一定期間キャッシュし、期限切れ後に再計算）
D) Other（[Answer]: タグ後に記述）

[Answer]: A
**判断理由**: MVP フェーズのテナント数・データ量は少なく、リアルタイム集計で十分。Redis 等の追加インフラを避けてシンプルさを保つ。NFR-02 のスケーラビリティ要件では「テナントあたり 10〜100 名・年間最大 365 件」と定義しており、PostgreSQL のインデックスで十分対応可能。負荷が高くなった段階でバッチ処理へ移行する。

---

### Question 5
アラートの自動検知はどのタイミングで実行しますか？

A) **スケジュールジョブ（定期バッチ）**— 例：毎日深夜に全テナントを一括チェック。シンプルで確実
B) **イベント駆動**— 日誌エントリ保存・感情スコア記録のたびにリアルタイムでチェック。即時性は高いがロジックが複雑
C) **A と B の組み合わせ**— スケジュールジョブを基本とし、一部のアラート（記録途絶）はバッチ専用
D) Other（[Answer]: タグ後に記述）

[Answer]: A
**判断理由**: 毎日深夜の定期バッチで全テナントを一括チェックする方式。「X日間記録が途絶えた」というアラート条件はリアルタイム検知に向かず、バッチが最適。実装がシンプルで確実。Vercel Cron Jobs または pg_cron で実現できる。MVP では1日1回で十分。

---

### Question 6
ディレクトリ構造（コンポーネント組織化）はどちらを好みますか？

A) **機能別（Feature-based）**— `features/journal/`・`features/admin-dashboard/` のように機能単位でまとめる。関連ファイルが近くに集まる
B) **レイヤー別（Layer-based）**— `components/`・`pages/`・`services/`・`hooks/` のようにレイヤーごとに分ける。Next.js の慣例に近い
C) **A と B のハイブリッド**— トップレベルはレイヤー別、その中の大きな機能は機能別サブディレクトリ
D) Other（[Answer]: タグ後に記述）

[Answer]: A
**判断理由**: 4ユニット（認証・日誌・教員ダッシュボード・管理者+アラート）の機能間の独立性が高く、関連ファイルを1つのディレクトリに集約できる。フェーズ2の機能追加（AI レポート・タスク管理）も `features/ai-report/` を追加するだけで既存コードへの影響を最小化できる。

---

### Question 7
管理者ダッシュボードの全教員ステータス更新は、どのタイミングでページに反映しますか？

A) **ページロード時のみ**（管理者がリロードしたときに最新データを取得）— シンプル
B) **ポーリング**（例：30秒ごとに自動再取得）— リアルタイム性と実装コストのバランスが良い
C) **WebSocket / Server-Sent Events**（リアルタイムプッシュ）— 最もリアルタイムだが実装コストが高い
D) Other（[Answer]: タグ後に記述）

[Answer]: B
**判断理由**: 管理者ダッシュボードは「開きっぱなしで常に最新状態を把握したい」というユースケースがある。30秒ポーリングで実用上の遅延は問題なく、WebSocket と比較して実装コストが低い。SWR の `refreshInterval` で簡潔に実装できる。Q3=C（ハイブリッド）のクライアント側更新の手段として採用。

---

### Question 8
Prisma のスキーマ管理とマルチテナント RLS の実装方針はどうしますか？

A) **Prisma + PostgreSQL RLS**（Prisma でスキーマ管理・マイグレーション。RLS ポリシーはカスタム SQL マイグレーションで管理）— 型安全でモダン
B) **Prisma + アプリ層のみでテナント隔離**（`WHERE tenant_id = ?` をサービス層で必ず付与する規約）— 実装はシンプルだが DB 層でのブロックがない
C) **Prisma + RLS + Prisma の `$extends` でミドルウェア的に tenant_id を自動付与**— セキュリティと利便性のバランスが最も高い
D) Other（[Answer]: タグ後に記述）

[Answer]: Drizzle ORM（D - Other）
**判断理由**: RLS との相性が良く、`withTenant()` ラッパー1つでテナント隔離をDB層で強制できる。SQL に近い記法で RLS ポリシーの設計・デバッグがしやすい。Prisma の `$executeRaw` + `$extends` の複雑な回避策が不要になる。TypeScript 型安全性も Prisma と同等。バンドルサイズも小さい。
**実装方針**: Drizzle ORM + PostgreSQL RLS（`withTenant()` ラッパーでセッション変数 `app.tenant_id` を自動セット）+ Drizzle Kit でマイグレーション管理。

---
