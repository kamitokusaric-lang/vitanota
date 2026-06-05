# auth (認証・テナント)

> Google アカウントで入り、招待されたテナント (学校) のメンバーとして、適切なロールで vitanota を使えるようにする土台。

- **src**: `src/features/auth/`
- **対応要件**: FR-01 (認証), FR-07 (ユーザー招待・管理)
- **粒度**: 分割 (重い・横断機能)
- **OpenAPI**: **対象外** (`/api/auth/*`・`/api/invitations/*` は `check-openapi-coverage.ts` の IGNORE。理由は [api.md](./api.md))

## 何ができるか

- Google OAuth でのサインイン (VPC 制約のため Lambda Proxy 経由 — 理由は [api.md](./api.md))
- 招待リンクによるオンボーディング (system_admin/school_admin が発行 → 受諾でロール付与)
- 4 ロール (system_admin / school_admin / teacher / bootstrap) による権限分離
- マルチテナント隔離 (RLS + 複合 FK + API WHERE の多層防御)
- 認証エラーの一元的なユーザー向けメッセージ化

## 仕様の所在

- [onboarding.md](./onboarding.md) — 招待フロー Step 0〜5、トークン検証、セッション発行
- [roles-and-rls.md](./roles-and-rls.md) — 4 ロールの定義・階層・権限境界・RLS
- [error-catalog.md](./error-catalog.md) — 認証エラー 25 種のカテゴリと代表例
- [api.md](./api.md) — エンドポイント一覧 (OpenAPI 対象外の理由)

## 横断依存

- テナント境界・RLS の全体像 → [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md)
- 認証シーケンス図 → [foundation/sequence-diagrams.md](../../foundation/sequence-diagrams.md)
- インフラ (Lambda Proxy) → [foundation/infrastructure.md](../../foundation/infrastructure.md)
- **2層構造の物理防御**: school_admin が個々の感情を覗けない境界は RLS が守る ([PHILOSOPHY §3](../../PHILOSOPHY.md))
