# system (管理者エクスポート・運営)

> system_admin (vitanota 運営) 向けのデータエクスポートとテナント管理。横断的・社内管理用途。

- **src**: `src/features/system/`
- **粒度**: overview 1 枚
- **OpenAPI**: **対象外** (`/api/system/*` は IGNORE: 社内管理 API)

## 何ができるか (system_admin)

- **ジャーナルエクスポート** (`journal-export`): **公開ノートのみ** CSV。`public_journal_entries` VIEW から SELECT し is_public=true を物理的に固定 (ハンドラコードを信用しない)
- **タスクエクスポート** (`task-export`): 全スコープ CSV (タスクに本人限定可視はない)
- **AI セッションエクスポート** (`ai-session-export`): 全テナント横断・**匿名** CSV。user_id/tenant_id は出力しない。`input_text` は PII を含みうるため system_admin のみ
- **AI 改善指標** (`ai-analytics`): 確定/破棄率・編集率などプロンプト改善指標 (個人指標は出さない)
- **テナント管理** (`tenants`): テナント一覧・作成 (デフォルトタグ/カテゴリ seed)・状態変更

## 踏み絵

- journal-export が公開のみを返すのは VIEW による物理防御 ([features/journal](../journal/overview.md) の多層防御と同じ)
- ai-session-export は匿名化必須 (誰の発話かを切り離した corpus として扱う)
- ai-analytics は個人評価指標を出さない ([PHILOSOPHY §4.0](../../PHILOSOPHY.md))。`ai_sessions` は本人 + system_admin のみ ([foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md))

## API

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/system/journal-export` | 公開ノート CSV (tenantId/from/to) |
| GET | `/api/system/task-export` | タスク CSV (tenantId/from/to) |
| GET | `/api/system/ai-session-export` | AI セッション CSV (from/to, 全テナント匿名) |
| GET | `/api/system/ai-analytics` | AI 改善指標 |
| GET/POST/PATCH | `/api/system/tenants` | テナント一覧/作成/状態変更 |

すべて system_admin 限定、`withSystemAdmin()` で全テナント横断。`/api/system/*` は OpenAPI 対象外。管理画面は `pages/admin/data-export.tsx`。CSV は UTF-8 BOM 付き (Excel 互換)。

## 横断依存

- エクスポート元: [features/journal](../journal/overview.md), [features/tasks](../tasks/overview.md), [features/ai-chat](../ai-chat/overview.md)
- 利用分布の可視化は [features/access-distribution](../access-distribution/overview.md)
