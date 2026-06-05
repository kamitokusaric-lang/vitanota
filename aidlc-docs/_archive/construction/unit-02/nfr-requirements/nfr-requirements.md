# Unit-02 NFR要件

## 継承 NFR（Unit-01 確定済み）

Unit-02 は Unit-01 のインフラ・設定をそのまま利用する。以下は確定済みのため再決定不要。

| NFR | 確定内容 |
|---|---|
| パフォーマンス | API レスポンス 500ms 以内（P95）、ページロード 3秒以内（P95） |
| セキュリティ | Security Baseline 全ルール適用（SECURITY-01〜15） |
| スケーラビリティ | RLS によるテナント隔離・RDS Proxy 接続プール |
| ログ | pino + redact（SP-01）・CloudWatch Logs 90日保持 |
| 認証 | Auth.js v4 JWT・withTenant() パターン |
| テスト | ビジネスロジック 80% カバレッジ（Vitest） |

---

## Unit-02 固有 NFR

### NFR-U02-01: タグ一覧表示パフォーマンス

**要件**: エントリ作成・編集フォームのタグ一覧は最大 **20件** をボタン表示する。

**詳細**:
- テナント内タグが 20件超の場合、テキスト入力によるフィルタリングで絞り込み表示
- フィルタはクライアントサイドで実行（全タグをメモリ上で保持・絞り込み）
- フォームマウント時に `GET /api/journal/tags` で全タグを一括取得し、クライアント側で 20件表示に制限
- タグ上限を超えた状態でのフォーム表示を 100ms 以内に完了すること（クライアント処理）

**実装指針**:
```
全タグ取得（APIコール）→ sort_order → name 順にソート → 先頭20件表示
↓ テキスト入力時
全タグに対してクライアントサイドフィルタ → マッチ件数に関わらず全件表示
```

---

### NFR-U02-02: タイムラインキャッシュ戦略

**要件**: 共有教員タイムライン（`GET /api/journal/entries`）に **stale-while-revalidate** キャッシュを適用する。

**詳細**:
- キャッシュ戦略: `Cache-Control: s-maxage=30, stale-while-revalidate=60`
  - 30秒以内: キャッシュから即時返却
  - 30〜90秒: キャッシュから返却しつつバックグラウンドで再検証
  - 90秒超: 新規フェッチ
- マイ記録（`GET /api/journal/entries/mine`）は **キャッシュなし**（自分の非公開エントリを含むため常に最新）
- エントリ作成・更新・削除後はクライアント側でキャッシュを invalidate してタイムラインを再フェッチ

**実装方法**: Next.js API Route の `res.setHeader('Cache-Control', ...)` で設定

---

### NFR-U02-03: システムデフォルトタグのシード

**要件**: テナント作成時（`POST /api/system/tenants`）に、デフォルトタグ 8件を自動 INSERT する。

**シードデータ**（Unit-01 の BP-03 テナント作成フローに追加）:

| name | is_emotion | sort_order |
|---|---|---|
| うれしい | true | 1 |
| つかれた | true | 2 |
| やってみた | true | 3 |
| 行き詰まり | true | 4 |
| 相談したい | true | 5 |
| 授業準備 | false | 6 |
| 保護者対応 | false | 7 |
| 行事準備 | false | 8 |

**実装指針**:
- `pages/api/system/tenants.ts` の POST ハンドラ内でテナント INSERT 後にタグ一括 INSERT
- トランザクション内で実行（テナント作成とタグシードをアトミックに）
- `is_system_default=true`・`created_by=NULL` で INSERT

---

### NFR-U02-04: RLS ポリシー設計

Unit-02 で追加する RLS ポリシー要件：

**journal_entries の 2ポリシー構成**:

```sql
-- ポリシー1: 共有タイムライン（is_public=true はテナント内全員が SELECT 可）
CREATE POLICY journal_entry_public_read ON journal_entries
  FOR SELECT
  USING (
    is_public = true
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  );

-- ポリシー2: 所有者アクセス（全操作可、非公開エントリも含む）
CREATE POLICY journal_entry_owner_all ON journal_entries
  USING (
    user_id = current_setting('app.user_id', true)::uuid
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  );
```

**tags の RLS**:
```sql
-- テナント内全ユーザーが参照可、削除は API 層で school_admin を検証
CREATE POLICY tags_tenant_read ON tags
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### NFR-U02-05: バリデーション層設計

**要件**: 文字数制限（200文字）・タグID配列長・必須項目などの入力バリデーションは **クライアント + API層の二層** で実施する。DB CHECK 制約は使用しない。

**詳細**:
- **Zodスキーマをクライアント・API層で共有**（`lib/schemas/journal.ts` に単一定義）
- クライアント: React Hook Form + `zodResolver` でリアルタイムバリデーション
- API層: Next.js API Route の先頭で `schema.parse(req.body)` により検証、失敗時は 400 を返す
- DB層: CHECK 制約は追加しない（UI由来の制限値をマイグレーションに固定化するリスクを回避）
- content 200文字制限はアプリケーション層でのみ強制。将来の仕様変更時は Zodスキーマ1箇所の修正で済む

**非採用案の理由**:
- 三層（クライアント + API + DB CHECK）: 200 という UI 由来の値を DB 制約にハードコードすると、仕様変更時に ALTER TABLE が必要となり過剰

---

### NFR-U02-06: セキュリティ固有要件

Unit-02 の機能に対する Security Baseline の適用：

| ルール | Unit-02 での適用内容 |
|---|---|
| SECURITY-05（入力検証） | content 200文字・tagIds max10・Zod バリデーション |
| SECURITY-08（IDOR防止） | エントリ更新・削除時に `user_id = currentUser` を API 層で検証 |
| SECURITY-11（多層防御） | API 層（所有者検証）+ DB 層（RLS）の二重防御 |
| NFR-01-EX-1（情報分類） | `is_public=false` エントリ本文は要保護情報 — ログ出力・他ユーザーへの返却禁止 |

---

### NFR-U02-07: テナント隔離テスト要件

NFR-04-T-4 に基づく Unit-02 固有の必須テスト：

- テナント A の教員がテナント B のエントリ（公開・非公開両方）にアクセスできないこと
- テナント A の教員がテナント B のタグを参照・作成・削除できないこと
- URL の `[id]` を他テナントのエントリ ID に書き換えても 404 または 403 が返ること
