# RLS ロール定義

## 概要

PostgreSQL のセッション変数 `app.role` / `app.tenant_id` / `app.user_id` を使って、
RLS ポリシーで行レベルのアクセス制御を行う。4 ロール体制。

## ロール一覧

| ロール | `app.role` 値 | 用途 | `app.tenant_id` | `app.user_id` | アプリ関数 |
|---|---|---|---|---|---|
| teacher | `'teacher'` | テナント内の教員操作 | 必須 (uuid) | 必須 (uuid) | `withTenantUser` |
| school_admin | `'school_admin'` | テナント内の管理者操作 | 必須 (uuid) | 必須 (uuid) | `withTenantUser` |
| system_admin | `'system_admin'` | 全テナント管理 | 設定しない (NULL) | 必須 (uuid) | `withSystemAdmin` |
| bootstrap | `'bootstrap'` | セッション解決専用 | 設定しない (NULL) | 必須 (uuid) | `withSessionBootstrap` |

## 各ロールの詳細

### teacher

- テナント内の自分のエントリを CRUD
- テナント内の公開エントリを閲覧
- テナント内のタグを閲覧
- 他テナントのデータには一切アクセス不可

### school_admin

- テナント内の全エントリにアクセス可能
- テナント内のタグを CRUD
- 教員の招待管理
- 他テナントのデータには一切アクセス不可

### system_admin

- 全テナントの全データにアクセス可能
- テナントの作成・停止・再開
- `app.tenant_id` は設定しない（テナントに属さない）
- CASE 式で最初に判定されるため `app_tenant_id()` は呼ばれない

### bootstrap

- セッション解決時にのみ使用
- `user_tenant_roles` テーブルの SELECT のみ許可
- 自分の `user_id` の行のみ読める
- 他テーブルへのアクセスは全て拒否
- `callbacks.session` から `withSessionBootstrap` 経由でのみ呼ばれる

#### bootstrap が必要な理由

ログイン直後のセッション解決時に「自分がどのテナントに属し、何のロールを持つか」を
`user_tenant_roles` から取得する必要がある。しかし:

- teacher / school_admin は `app.tenant_id` が必須（まだ不明なので使えない）
- system_admin は全テーブル・全行にアクセス可能（権限過剰）
- app.role 未設定は全行拒否（デフォルト拒否）

bootstrap はこの鶏卵問題を解決する最小権限のロール。

## セッション変数の状態遷移

```
ブラウザリクエスト
  → Next.js ルーティング
  → getServerSideProps / API ハンドラ
  → getServerSession (cookie → sessions テーブル)
  → callbacks.session
    → withSessionBootstrap(user.id, fn)
      app.role = 'bootstrap', app.user_id = user.id
      → user_tenant_roles から自分の行を SELECT
    → tenantId / roles 解決
  → withTenantUser(tenantId, userId, role, fn) or withSystemAdmin(userId, fn)
    app.role / app.tenant_id / app.user_id 設定
    → RLS ポリシー評価 (CASE 式)
  → トランザクション終了 → 変数自動リセット (is_local=true)
```

## RLS ポリシーの CASE 式構造（全テーブル共通）

```sql
CASE
  WHEN app_role() = 'system_admin'  THEN true           -- 全行許可
  WHEN app_role() = 'school_admin'  THEN <テナント条件>  -- テナント内
  WHEN app_role() = 'teacher'       THEN <テナント+所有者条件>
  WHEN app_role() IS NULL           THEN false           -- 未設定 = バグ → 拒否
  ELSE false                                             -- 未知のロール → 拒否
END
```

bootstrap は `user_tenant_roles` テーブルにのみ存在する別ポリシーで定義:

```sql
CASE
  WHEN app_role() = 'bootstrap' THEN user_id = app_user_id()
  ELSE false
END
```

## 不変条件 (invariants)

1. `app.role` が未設定 (NULL) なら、どのテーブルも 0 行返す
2. `app.tenant_id` が NULL なのは `system_admin` と `bootstrap` のときだけ
3. `app.tenant_id` が NULL のまま teacher / school_admin で DB アクセスすると `app_tenant_id()` が例外を投げる
4. teacher は自テナント内の自分の `user_id` の行のみ書き込み可。公開行は読み取り可
5. school_admin は自テナント内の全行に読み書き可
6. system_admin は全行に読み書き可
7. bootstrap は `user_tenant_roles` の自分の行の SELECT のみ可。他テーブルは全拒否
8. 前のトランザクションの変数は `set_config(..., true)` (is_local) で自動リセットされ、漏洩しない

## SQL ヘルパー関数

| 関数 | 戻り値 | NULL 時の挙動 |
|---|---|---|
| `app_role()` | text or NULL | NULL を返す（CASE の `IS NULL` で拒否） |
| `app_tenant_id()` | uuid | 例外 `app.tenant_id is not set` |
| `app_user_id()` | uuid | 例外 `app.user_id is not set` |

## DB 接続ロールの分離

| ロール | 用途 | 権限 |
|---|---|---|
| `vitanota` | マイグレーション (DDL) | SUPERUSER |
| `vitanota_app` | アプリ接続 (DML) | NOSUPERUSER NOBYPASSRLS |

アプリは `vitanota_app` で接続するため、RLS が確実に適用される。
`vitanota` (superuser) でアプリが接続することは禁止。

## ビューの security_invoker

`public_journal_entries` ビューは `security_invoker = true` に設定。
これにより、ビューオーナー (`vitanota`) ではなく呼び出し元 (`vitanota_app`) の
権限で RLS が評価される。

## 関連ファイル

- `migrations/0007_force_rls.sql` — FORCE ROW LEVEL SECURITY
- `migrations/0008_app_role_nosuper.sql` — vitanota_app ロール作成
- `migrations/0009_rls_role_separation.sql` — ヘルパー関数 + CASE ポリシー + security_invoker
- `src/shared/lib/db.ts` — withTenantUser / withSystemAdmin / withSessionBootstrap
- `src/features/auth/lib/auth-options.ts` — callbacks.session (bootstrap 使用)
- `src/features/journal/lib/apiHelpers.ts` — pickDbRole()
