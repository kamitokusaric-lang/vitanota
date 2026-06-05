# Unit-02 NFR設計プラン

## 前提
- Unit-02 は Unit-01 のNFR設計パターン（withTenant ミドルウェア・RLS基盤・pino redact・RDS Proxy等）を継承する
- Unit-02 固有のNFRに対するパターン選定・論理コンポーネント設計のみを本プランで扱う

## 実行ステップ

- [x] Step 1: NFR要件の読み込み
- [x] Step 2: Unit-01 継承パターンの特定
- [x] Step 3: Unit-02 固有の設計論点を抽出・質問提示（Q1-Q8）
- [x] Step 4: 回答受領（Q1-Q8 全A、Unit-01遡及で CloudFront+WAF 追加）
- [x] Step 5: nfr-design-patterns.md 作成
- [x] Step 6: logical-components.md 作成
- [x] Step 7: 完了メッセージ提示し承認待ち

---

## Unit-01 から継承する設計パターン

| パターン | 継承元 |
|---|---|
| withTenant() HOF | Unit-01 nfr-design-patterns |
| RLS 2ポリシー構成（tenant_id + user_id 設定） | Unit-01 |
| pino + redact ログマスキング | Unit-01 |
| Zod API 層バリデーション | Unit-01 |
| RDS Proxy 接続プール | Unit-01 infra |

---

## Unit-02 固有の設計論点

### 論点 1: タイムラインキャッシュ実装パターン

NFR-U02-02 で SWR キャッシュ（s-maxage=30, swr=60）が確定。実装パターンを確認したい。

**Q1**: キャッシュヘッダーの設定パターンは？
- A. API Route ハンドラ内で直接 `res.setHeader('Cache-Control', ...)` を呼ぶ
- B. 共通ミドルウェア `withCache(options)` を作成してハンドラをラップ
- C. Next.js の `getServerSideProps` レベルで制御（API 層ではなくページ層）
- D. その他

[Answer]: 

---

### 論点 2: キャッシュ無効化パターン

エントリ作成・更新・削除後のタイムライン再フェッチ方法。

**Q2**: クライアント側のキャッシュ無効化戦略は？
- A. SWR ライブラリ（vercel/swr）の `mutate()` を使って明示的に invalidate
- B. React Query の `invalidateQueries`
- C. ネイティブ `fetch` + 手動 state 管理（setList）
- D. その他

[Answer]: 

---

### 論点 3: タグシードのトランザクション境界

NFR-U02-03 でテナント作成時にデフォルトタグ8件を INSERT。アトミック性をどう担保するか。

**Q3**: テナント作成とタグシードの実行方法は？
- A. Drizzle の `db.transaction(async (tx) => {...})` で単一トランザクション
- B. テナント INSERT 後に別クエリでタグ INSERT（非トランザクション・失敗時はクリーンアップ）
- C. PostgreSQL のストアドファンクションで一括処理
- D. その他

[Answer]: 

---

### 論点 4: RLS セッション変数の注入位置

Unit-01 で確立した withTenant() パターンで `SET LOCAL app.tenant_id`・`app.user_id` を注入しているが、Unit-02 の「公開エントリの他ユーザー参照」ケースで user_id の扱いは？

**Q4**: 他ユーザーの公開エントリを読む時のセッション変数設定は？
- A. 常に現在のユーザーの user_id を設定（RLS の public_read ポリシーが is_public=true で判定するため所有者チェックには影響しない）
- B. 一覧取得時は user_id を NULL に設定（所有者判定を無効化）
- C. リクエストごとに動的に切り替える
- D. その他

[Answer]: 

---

### 論点 5: IDOR防止レイヤー（SECURITY-08）

エントリ更新・削除時の所有者検証。

**Q5**: IDOR防止の実装パターンは？
- A. API 層で `WHERE id = ? AND user_id = ?` を明示し、影響行数0なら404返却（+ RLS二層防御）
- B. Drizzle ORM の RLS に全依存（API 層の明示チェックなし）
- C. 共通ミドルウェア `withOwnership(resource)` を作成
- D. その他

[Answer]: 

---

### 論点 6: Zodスキーマの配置

NFR-U02-05 の二層バリデーションでスキーマをクライアント・API 層で共有する。

**Q6**: Zodスキーマの配置場所は？
- A. `lib/schemas/journal.ts` に配置し、クライアント・API 両方から import
- B. `schemas/` 専用ディレクトリを新設
- C. API Route ファイル内にインライン定義（共有しない）
- D. その他

[Answer]: 

---

### 論点 7: タグフィルタのクライアント実装

NFR-U02-01 で 20件上限・超過時クライアントフィルタが確定。

**Q7**: クライアントサイドフィルタの実装パターンは？
- A. 全タグを React state で保持し、`useMemo` で `name.includes(query)` フィルタ
- B. `Fuse.js` 等のファジー検索ライブラリを導入
- C. `startsWith` による前方一致のみ（シンプル）
- D. その他

[Answer]: 

---

### 論点 8: エラー時のリトライ戦略

DB エラー・一時的な接続失敗時のハンドリング。

**Q8**: API 層のリトライ戦略は？
- A. リトライなし（RDS Proxy が接続プールを管理、一時エラーは 500 返却）
- B. Drizzle/pg レベルで 1回リトライ（指数バックオフなし）
- C. クライアント側で失敗時にユーザーに再試行ボタンを表示
- D. その他

[Answer]: 

---

## 想定成果物

1. `aidlc-docs/construction/unit-02/nfr-design/nfr-design-patterns.md`
2. `aidlc-docs/construction/unit-02/nfr-design/logical-components.md`
