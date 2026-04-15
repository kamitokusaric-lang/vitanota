# vitanota シーケンス図

**最終更新**: 2026-04-15（Unit-02 Step 8 完了時点）
**スコープ**: Unit-01 認証基盤 + Unit-02 日誌コア
**関連**: `aidlc-docs/construction/er-diagram.md`

## 更新ルール

- 主要な業務フローや認証フローに変更があった場合は本ファイルも更新
- 新しいユースケースが追加されたら追記
- ER 図と同様、本ファイルが「動作の単一真実源」

---

## 1. 初回ログイン（Google OAuth・新規 OAuth 連携）

招待済みユーザーが初めて Google でログインするフロー。
**`accounts` への INSERT はこの時点のみ**（次回以降は再利用）。

```mermaid
sequenceDiagram
    autonumber
    participant U as 教員のブラウザ
    participant CF as CloudFront + WAF
    participant App as App Runner<br/>(Next.js)
    participant Google as Google OAuth
    participant DB as PostgreSQL

    U->>CF: GET /journal
    CF->>App: HTTPS + X-CloudFront-Secret
    App->>App: middleware: Cookie なし
    App-->>U: 302 → /auth/signin

    U->>App: 「Google でログイン」クリック
    App->>App: /api/auth/signin/google
    App-->>U: 302 → Google OAuth
    U->>Google: 認証情報入力
    Google->>U: 同意画面（初回のみ）
    U->>Google: 許可
    Google-->>U: 302 → /api/auth/callback/google?code=xxx
    U->>App: callback リクエスト
    App->>Google: code → access_token 交換

    App->>DB: SELECT id FROM users WHERE email = ?
    DB-->>App: 既存ユーザー (招待済み)
    Note over App: signIn callback<br/>BR-AUTH-01: 招待なし登録禁止<br/>→ ユーザー存在 OK

    App->>DB: SELECT id FROM accounts<br/>WHERE provider='google' AND provider_account_id=?
    DB-->>App: なし
    App->>DB: INSERT INTO accounts<br/>(user_id, provider, providerAccountId, tokens...)
    Note right of DB: 🆕 accounts 行は<br/>初回のみ INSERT

    App->>DB: INSERT INTO sessions<br/>(session_token, user_id, expires=NOW()+8h)
    DB-->>App: created
    Note right of DB: 🆕 sessions に新規行

    App-->>U: Set-Cookie: next-auth.session-token=<token><br/>302 → /journal
    U->>App: GET /journal (with Cookie)
    Note over App: 通常リクエストフローへ<br/>(2 番目の図を参照)
```

---

## 2. 再ログイン（既存 OAuth 連携あり）

ログアウト後の再ログイン。`accounts` は再利用、`sessions` のみ新規作成。

```mermaid
sequenceDiagram
    autonumber
    participant U as ブラウザ
    participant App as App Runner
    participant Google as Google OAuth
    participant DB as PostgreSQL

    U->>App: 「Google でログイン」クリック
    App-->>U: 302 → Google OAuth
    U->>Google: 認証
    Note over Google: 同意済みのため<br/>同意画面なしで即callback
    Google-->>U: 302 → callback
    U->>App: /api/auth/callback/google?code=xxx
    App->>Google: code 交換

    App->>DB: SELECT id FROM users WHERE email=?
    DB-->>App: 既存 user_id

    App->>DB: SELECT id FROM accounts<br/>WHERE provider='google' AND provider_account_id=?
    DB-->>App: ✅ 既存 account_id
    Note right of DB: ⛔ accounts は<br/>触らない (再利用)

    App->>DB: INSERT INTO sessions<br/>(session_token, user_id, expires=NOW()+8h)
    Note right of DB: 🆕 新しい sessionToken<br/>古いトークンとは別物

    App-->>U: Set-Cookie + 302 → /journal
```

---

## 3. 通常リクエスト（認証済み API 呼び出し）

ログイン後、保護された API を呼ぶ標準フロー。

```mermaid
sequenceDiagram
    autonumber
    participant U as ブラウザ
    participant CF as CloudFront
    participant App as App Runner
    participant DB as PostgreSQL

    U->>CF: GET /api/private/journal/entries/mine<br/>Cookie: next-auth.session-token=abc-123
    CF->>App: HTTPS + X-CloudFront-Secret

    App->>App: middleware: X-CloudFront-Secret 検証
    App->>App: getServerSession() 呼び出し

    App->>DB: SELECT s.*, u.* FROM sessions s<br/>JOIN users u ON s.user_id=u.id<br/>WHERE s.session_token='abc-123'<br/>AND s.expires > NOW()
    DB-->>App: session + user 行

    Note over App: session callback で<br/>テナント情報を解決

    App->>DB: SELECT tenant_id, role<br/>FROM user_tenant_roles<br/>WHERE user_id=?
    DB-->>App: roles + tenantId

    App->>DB: SELECT status FROM tenants WHERE id=?
    DB-->>App: status='active'

    Note over App: session.user に<br/>userId/tenantId/roles/tenantStatus 設定

    alt 5分以上経過
      App->>DB: UPDATE sessions<br/>SET expires=NOW()+8h<br/>WHERE session_token='abc-123'
      Note right of DB: 寿命延長<br/>(updateAge=300)
    end

    App->>App: requireAuth():<br/>tenantStatus='suspended' なら 423<br/>tenantId なし なら 403

    Note over App: withTenantUser で<br/>RLS セッション変数注入

    App->>DB: BEGIN
    App->>DB: SET LOCAL app.tenant_id = ?
    App->>DB: SET LOCAL app.user_id = ?
    App->>DB: SELECT * FROM journal_entries<br/>WHERE user_id=? AND tenant_id=?<br/>(RLS 適用)
    DB-->>App: entries
    App->>DB: COMMIT

    App-->>U: 200 OK + JSON { entries: [...] }
```

---

## 4. ログアウト

```mermaid
sequenceDiagram
    autonumber
    participant U as ブラウザ
    participant App as App Runner
    participant DB as PostgreSQL
    participant Logs as CloudWatch Logs

    U->>App: POST /api/auth/signout
    App->>App: signOut callback

    App->>DB: DELETE FROM sessions<br/>WHERE session_token='abc-123'
    DB-->>App: deleted
    Note right of DB: ⛔ accounts/users は残る<br/>sessions の 1 行のみ削除

    App->>App: events.signOut hook
    App->>Logs: logEvent(SessionRevoked,<br/>{ sessionId, userId, reason: 'user_logout' })

    App-->>U: Set-Cookie: ...=; expires=過去<br/>302 → /auth/signin

    Note over U: 以降のリクエストは<br/>Cookie はあっても DB に行がない<br/>→ getServerSession() = null<br/>→ 401
```

---

## 5. セッション自動失効（8時間経過）

```mermaid
sequenceDiagram
    autonumber
    participant U as ブラウザ
    participant App as App Runner
    participant DB as PostgreSQL

    Note over U,DB: ログイン: T<br/>expires = T+8h<br/>updateAge ごとに延長

    Note over U,DB: 操作なしで 8 時間以上経過

    U->>App: GET /journal<br/>Cookie: next-auth.session-token=abc-123
    App->>App: getServerSession()

    App->>DB: SELECT s.*, u.* FROM sessions s<br/>JOIN users u ON s.user_id=u.id<br/>WHERE s.session_token='abc-123'<br/>AND s.expires > NOW()
    DB-->>App: 0 行 (expires < NOW())

    Note over App: getServerSession() = null

    App-->>U: 302 → /auth/signin

    Note over DB: 期限切れ session 行は<br/>日次クリーンアップバッチで<br/>DELETE WHERE expires < NOW() - 7d
```

---

## 6. 強制ログアウト（管理者操作・将来 Unit-04 admin 機能）

退職者の即時アクセス遮断・トークン流出時の対応。
**今は手動 SQL のみ、Unit-04 で管理画面 API を提供予定**。

```mermaid
sequenceDiagram
    autonumber
    participant Admin as school_admin
    participant API as 管理画面 API<br/>(Unit-04 で実装)
    participant DB as PostgreSQL
    participant U as 対象ユーザーのブラウザ

    Admin->>API: DELETE /api/admin/sessions<br/>{ userId: 'user-退職' }
    API->>DB: DELETE FROM sessions<br/>WHERE user_id='user-退職'
    DB-->>API: 削除完了 (3 件)
    API-->>Admin: 200 OK + 削除件数

    Note over U: ユーザーは 8 時間以内に<br/>次のリクエストを送る

    U->>API: GET /journal (Cookie あり)
    API->>DB: SELECT FROM sessions WHERE session_token=?
    DB-->>API: 0 行
    API-->>U: 302 → /auth/signin

    Note over Admin,U: ✅ 失効まで遅延ゼロ<br/>(JWT 戦略では 30 日かかる)
```

**SQL ベースの即時失効パターン**（管理者向け Runbook）:

```sql
-- 特定ユーザーの全セッション失効
DELETE FROM sessions WHERE user_id = '...';

-- テナント停止時の全ユーザーセッション失効
DELETE FROM sessions
  WHERE user_id IN (
    SELECT user_id FROM user_tenant_roles WHERE tenant_id = '...'
  );

-- 流出した特定セッショントークンの失効
DELETE FROM sessions WHERE session_token = '...';
```

---

## 7. エントリ作成（US-T-010）

教員が日誌を投稿し、共有タイムラインへ反映されるまで。

```mermaid
sequenceDiagram
    autonumber
    participant U as 教員のブラウザ
    participant App as App Runner
    participant DB as PostgreSQL
    participant CF as CloudFront

    U->>U: /journal/new で本文・タグ入力
    Note over U: React Hook Form +<br/>zodResolver(createEntrySchema)<br/>クライアント側バリデーション

    U->>App: POST /api/private/journal/entries<br/>{ content, tagIds, isPublic }<br/>Cookie: next-auth.session-token=...

    App->>App: requireAuth() → ctx { userId, tenantId, roles }
    App->>App: createEntrySchema.safeParse(body)<br/>(サーバー側二層検証)

    App->>App: journalEntryService.createEntry()
    App->>DB: BEGIN
    App->>DB: SET LOCAL app.tenant_id = ?
    App->>DB: SET LOCAL app.user_id = ?

    Note over App: タグ ID のテナント整合性検証
    App->>DB: SELECT id FROM tags<br/>WHERE id = ANY(tagIds) AND tenant_id=?
    DB-->>App: 有効な tag_id 一覧
    Note over App: 不正タグなら<br/>InvalidTagReferenceError → 400

    App->>DB: INSERT INTO journal_entries<br/>(tenant_id, user_id, content, is_public)<br/>RETURNING *
    DB-->>App: entry

    App->>DB: INSERT INTO journal_entry_tags<br/>(tenant_id, entry_id, tag_id) × N
    Note right of DB: SP-U02-04 Layer 8<br/>複合 FK でクロステナント<br/>参照は物理拒否

    App->>DB: COMMIT
    Note right of DB: トランザクション終了で<br/>SET LOCAL も自動リセット<br/>(R1 ピンニング対策)

    App->>App: logEvent(JournalEntryCreated, {...})
    App-->>U: 201 + { entry }

    U->>U: SWR mutate('/api/public/journal/entries')<br/>+ mutate('/api/private/journal/entries/mine')
    U->>App: GET /api/public/journal/entries (再フェッチ)

    alt CloudFront キャッシュ生きてる (max 90秒)
      CF-->>U: キャッシュから返却 (古い)
      Note over U: ユーザーは SWR の<br/>楽観的更新で新エントリを<br/>即時表示 (R4 受容)
    else CloudFront キャッシュ切れ
      CF->>App: オリジン取得
      App->>DB: 共有タイムライン取得
      DB-->>App: 新エントリ含む
      App-->>CF: 200 + entries
      CF-->>U: 新しいデータ
    end
```

---

## 8. 共有タイムライン取得（US-T-014）

`/api/public/journal/entries` のキャッシュ込み読み取りフロー。

```mermaid
sequenceDiagram
    autonumber
    participant U as 教員のブラウザ
    participant CF as CloudFront
    participant App as App Runner
    participant DB as PostgreSQL

    U->>CF: GET /api/public/journal/entries?page=1&perPage=20<br/>Cookie: next-auth.session-token=...

    alt キャッシュヒット (s-maxage=30 以内)
      CF-->>U: 200 (キャッシュから即返却)
      Note over CF: テナント内全教員で<br/>同じキャッシュを共有
    else stale-while-revalidate (30〜90秒)
      CF-->>U: stale 応答 (即返却)
      CF->>App: バックグラウンド再検証
      App->>DB: ...
      DB-->>App: ...
      App-->>CF: 新しいレスポンス → キャッシュ更新
    else キャッシュミス
      CF->>App: オリジン取得 + X-CloudFront-Secret
      App->>App: middleware: 署名ヘッダー検証
      App->>App: requireAuth() → ctx
      App->>App: timelineQuerySchema.parse(query)

      App->>DB: BEGIN
      App->>DB: SET LOCAL app.tenant_id = ?
      App->>DB: SET LOCAL app.user_id = ?

      App->>DB: SELECT * FROM public_journal_entries<br/>ORDER BY created_at DESC<br/>LIMIT 20 OFFSET 0
      Note right of DB: SP-U02-04 Layer 4<br/>VIEW 経由 (is_public 列なし)<br/>RLS の public_read 適用
      DB-->>App: entries[]
      App->>DB: COMMIT

      App->>App: logEvent(JournalEntryListRead, { endpoint: 'public' })
      App-->>CF: 200 + Cache-Control: s-maxage=30, swr=60
      CF-->>U: 200 + entries
    end
```

---

## 9. テナント作成 + デフォルトタグシード（US-S-001 + NFR-U02-03）

system_admin が新規学校テナントを作成し、8 件のデフォルトタグが自動シードされるフロー。

```mermaid
sequenceDiagram
    autonumber
    participant Admin as system_admin
    participant App as App Runner
    participant DB as PostgreSQL

    Admin->>App: POST /api/system/tenants<br/>{ name, slug }
    App->>App: requireAuth() + roles.includes('system_admin')
    App->>App: createTenantSchema.parse(body)

    App->>DB: SELECT id FROM tenants WHERE slug=?
    DB-->>App: なし (重複なし)

    App->>DB: BEGIN

    App->>DB: INSERT INTO tenants (name, slug)<br/>RETURNING *
    DB-->>App: newTenant

    Note over App: 新テナントの ID で<br/>RLS セッション変数を設定<br/>(tags テーブルの RLS 対応)
    App->>DB: SET LOCAL app.tenant_id = newTenant.id
    App->>DB: SET LOCAL app.user_id = adminUserId

    App->>DB: INSERT INTO tags VALUES<br/>(うれしい, is_emotion=true), (つかれた, ...)<br/>...計 8 件 (system_default=true)
    DB-->>App: 8 rows
    Note right of DB: tagRepo.seedSystemDefaults<br/>NFR-U02-03

    App->>DB: COMMIT
    Note right of DB: アトミック<br/>シード失敗時はテナントも<br/>ロールバック

    App->>App: logger.info({ event: 'tenant.created',<br/>tenantId, seededTagCount: 8 })

    App-->>Admin: 201 + { tenant, seededTagCount: 8 }
```

---

## 10. クロステナント参照拒否（SP-U02-04 Layer 8 物理防御）

アプリのバグ・生 SQL のいずれでも、テナント A のエントリにテナント B のタグを紐づけられない様子。

```mermaid
sequenceDiagram
    autonumber
    participant App as App Runner
    participant DB as PostgreSQL

    Note over App,DB: 前提:<br/>tenantA のエントリ entry-A<br/>tenantB のタグ tag-B

    App->>DB: BEGIN
    App->>DB: SET LOCAL app.tenant_id = tenantA
    App->>DB: SET LOCAL app.user_id = userA

    App->>DB: INSERT INTO journal_entry_tags<br/>(tenant_id, entry_id, tag_id)<br/>VALUES (tenantA, entry-A, tag-B)
    Note over DB: SP-U02-04 Layer 8 評価:<br/>FK (tag_id, tenant_id)<br/>→ tags(id, tenant_id)<br/>tag-B は tenant_id=tenantB<br/>なので一致行なし

    DB-->>App: ❌ FK violation:<br/>journal_entry_tags_tag_fk
    App->>DB: ROLLBACK

    Note over App,DB: 物理的に拒否される<br/>RLS や WHERE 句に頼らない<br/>最終防衛線
```

---

## 関連ドキュメント

- **ER 図**: `aidlc-docs/construction/er-diagram.md`
- **API 仕様**: `aidlc-docs/construction/unit-02/code/api-contracts.md` / `openapi.yaml`
- **NFR パターン**: `aidlc-docs/construction/unit-02/nfr-design/nfr-design-patterns.md`
- **セキュリティレビュー**: `aidlc-docs/inception/requirements/security-review.md`
- **運用リスク**: `aidlc-docs/construction/unit-02/nfr-design/operational-risks.md`

---

## 変更履歴

- **2026-04-15 初版**: Unit-01 + Unit-02 Step 8 完了時点のシーケンス図を整備
  - 認証: 初回ログイン / 再ログイン / 通常リクエスト / ログアウト / 自動失効 / 強制ログアウト
  - 業務: エントリ作成 / 共有タイムライン取得 / テナント作成 + シード / クロステナント参照拒否
