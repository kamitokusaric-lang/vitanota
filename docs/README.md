# vitanota ドキュメント

> 現行仕様の唯一の入口。機能別に整理してある。
> AIDLC ワークフロー時代の足跡は `../aidlc-docs/_archive/` に凍結 (参照のみ・更新しない)。
> 世界観・設計憲法は [`PHILOSOPHY.md`](./PHILOSOPHY.md)。**新機能はまずここの踏み絵を通すこと。**

---

## はじめに読む

1. [世界観・設計憲法](./PHILOSOPHY.md) — なぜ vitanota が存在するか、裏テーマ、2層構造、踏み絵
2. [データモデル](./foundation/data-model.md) — 全テーブルの関係と所在
3. [認証とテナント境界 (RLS)](./foundation/rls-and-tenancy.md) — マルチテナント隔離の仕組み

---

## 機能一覧 (`src/features/` と 1 対 1)

| 機能 | src | 粒度 | OpenAPI | 入口 |
|---|---|---|---|---|
| journal (日誌・記録) | `src/features/journal/` | 分割 | Journal, Tag | [features/journal/overview.md](./features/journal/overview.md) |
| tasks (タスク管理) | `src/features/tasks/` | 分割 | Task | [features/tasks/overview.md](./features/tasks/overview.md) |
| auth (認証・テナント) | `src/features/auth/` | 分割 | 対象外 (IGNORE) | [features/auth/overview.md](./features/auth/overview.md) |
| ai-chat (AI 整理) | `src/features/ai-chat/` | overview+api | AI Chat | [features/ai-chat/overview.md](./features/ai-chat/overview.md) |
| feedback (意見収集) | `src/features/feedback/` | overview+api | Feedback | [features/feedback/overview.md](./features/feedback/overview.md) |
| dashboard (学校統計) | `src/features/dashboard/` | overview | 対象外 (IGNORE: school) | [features/dashboard/overview.md](./features/dashboard/overview.md) |
| access-distribution (利用分析) | `src/features/access-distribution/` | overview | 対象外 (IGNORE: system) | [features/access-distribution/overview.md](./features/access-distribution/overview.md) |
| system (管理者エクスポート) | `src/features/system/` | overview | 対象外 (IGNORE: system) | [features/system/overview.md](./features/system/overview.md) |
| calendar (カレンダー表示) | `src/features/calendar/` | overview | 専用なし (Task/Account 読取) | [features/calendar/overview.md](./features/calendar/overview.md) |
| profile (プロフィール設定) | `src/features/profile/` | overview | Account | [features/profile/overview.md](./features/profile/overview.md) |

**粒度の方針 (アダプティブ)**: 重い機能 (journal / tasks / auth) だけサブ分割し、薄い機能は `overview.md` 1 枚で済ませる。各 `overview.md` は**ハブに徹して薄く保つ** — 詳細はサブファイルか `foundation/` に逃がす。

---

## 横断仕様 (`foundation/`)

機能をまたぐ単一正本。各機能の `overview.md` からここを参照する。

| ファイル | 役割 |
|---|---|
| [requirements.md](./foundation/requirements.md) | FR-01〜09・NFR の正本 |
| [data-model.md](./foundation/data-model.md) | 全テーブル関係・スキーマ正本 (`src/db/schema.ts`) への地図 |
| [er-diagram.md](./foundation/er-diagram.md) | ER 図 (Mermaid) |
| [rls-and-tenancy.md](./foundation/rls-and-tenancy.md) | RLS ポリシー・マルチテナント境界の考え方 |
| [role-definitions.md](./foundation/role-definitions.md) | 4 ロールの RLS レベル定義 |
| [user-lifecycle.md](./foundation/user-lifecycle.md) | 退会・転勤・匿名化・法的要件 |
| [sequence-diagrams.md](./foundation/sequence-diagrams.md) | 主要シーケンス図 (認証・ログイン・ライフサイクル) |
| [infrastructure.md](./foundation/infrastructure.md) | Phase 1 As-Built / Phase 2 計画・デプロイ |
| [infrastructure-shared.md](./foundation/infrastructure-shared.md) | 共有 AWS リソース・テナント分離方式 |
| [local-development.md](./foundation/local-development.md) | ローカル開発環境 (docker-compose) |
| [security.md](./foundation/security.md) | セキュリティ要件レビュー (論点 A〜M) |
| [testing.md](./foundation/testing.md) | テスト戦略・CI ゲート・ビルド手順 |
| [backlog.md](./foundation/backlog.md) | MVP 後の継続 TODO 一元管理 |

---

## クイックリファレンス ("〜の仕様どこ？")

| 質問 | 見るファイル |
|---|---|
| なぜこの機能を作る/作らないのか | [PHILOSOPHY.md](./PHILOSOPHY.md) (踏み絵) |
| 日々ノート・タグ・リアクション | [features/journal/](./features/journal/overview.md) |
| タスク・複数アサイン・カテゴリ | [features/tasks/](./features/tasks/overview.md) |
| 認証・招待・ロール | [features/auth/](./features/auth/overview.md) |
| AI 整理・チャット抽出 | [features/ai-chat/](./features/ai-chat/overview.md) |
| 何を作るか (要件 FR) | [foundation/requirements.md](./foundation/requirements.md) |
| テーブル構造 | [foundation/data-model.md](./foundation/data-model.md) → `src/db/schema.ts` |
| RLS ポリシー | [foundation/rls-and-tenancy.md](./foundation/rls-and-tenancy.md) → `migrations/0009_rls_role_separation.sql` |
| 退会・転勤 | [foundation/user-lifecycle.md](./foundation/user-lifecycle.md) |
| デプロイ手順 / Phase 2 計画 | [foundation/infrastructure.md](./foundation/infrastructure.md) |
| ローカル起動 | [foundation/local-development.md](./foundation/local-development.md) |
| API 契約 (正本) | `src/openapi/registry.ts` + `openapi.yaml` |
| 本番稼働後の TODO | [foundation/backlog.md](./foundation/backlog.md) |

---

## 運用ルール (旧 docs-index の鉄則を継承)

- **新規ドキュメントを作成・移動・削除したら、本 README と該当 `overview.md` を必ず同時更新する。** 怠ると散在状態に戻る。
- `overview.md` は薄く保つ。本文を太らせたくなったらサブファイルか `foundation/` へ。
- API の正本は OpenAPI (`registry.ts` + `openapi.yaml`)。機能の `api.md` は registry を指す索引であり、**契約ボディを複写しない** (CLAUDE.md の OpenAPI DoD と整合)。
- `[LEGACY]` 文書は `../aidlc-docs/_archive/` にのみ存在する。`docs/` 配下は全て現行 (CURRENT) とみなす。
