# auth — ロールと RLS

> 親: [overview.md](./overview.md)。テナント境界の全体像は [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md)。
> RLS ポリシーの正本は `migrations/0009_rls_role_separation.sql`。実装: `src/features/auth/lib/role-helpers.ts`, `src/shared/lib/db.ts`。

## 4 ロール

| ロール | `app.role` | `app.tenant_id` | 主な権限 |
|---|---|---|---|
| **teacher** | teacher | 必須 | 自分の entries CRUD・公開 entries 閲覧・テナント内タグ閲覧 |
| **school_admin** | school_admin | 必須 | テナント内の組織俯瞰・タグ/カテゴリ管理・教員招待。teacher 機能も使える |
| **system_admin** | system_admin | NULL | 全テナント管理・任意テナントへの招待・横断機能 (`/api/system/*`) |
| **bootstrap** | bootstrap | NULL | ログイン直後の「自分がどのテナント・ロールか」解決専用。`user_tenant_roles` の自行のみ SELECT 可 |

### 階層
```
system_admin (全テナント横断)
school_admin (テナント内管理) ─ teacher 機能も内包
teacher      (自分の記録・相互関心の層)
```

### bootstrap の必要性 (鶏卵問題)
ログイン直後、まだ `app.tenant_id` が未確定なので teacher/school_admin では自分の所属を読めない。system_admin を使うと権限過剰。そこで「自分の行だけ読める」最小権限の bootstrap ロールで所属を解決する (`withSessionBootstrap` 経由でのみ呼ばれる)。

## 権限境界の実装層

| 層 | 実装 |
|---|---|
| API | `session.user.roles.includes(...)` → 403 |
| フロント | `RoleGuard` + `hasRequiredRole()` |
| DB (RLS) | `migrations/0009` の CASE 式で `app_role()` / `app_tenant_id()` 判定 |
| 接続ヘルパー | `withTenantUser` / `withSystemAdmin` / `withSessionBootstrap` (`src/shared/lib/db.ts`) |

## system_admin の所属有無

- 単独 (テナント未所属) の system_admin は通常 API で 403。横断操作は `/api/system/*` で別途提供。
- 兼務 (system_admin 兼 school_admin/teacher) なら通常 API も叩ける。

## 踏み絵

`school_admin` の特権は「組織状態の俯瞰」に限定される。個々の教員の mood・感情データは RLS で school_admin から不可視。`ai_sessions` は本人 + system_admin のみ。これは [PHILOSOPHY §3 (2層構造)](../../PHILOSOPHY.md) を DB で物理的に守る部分。
