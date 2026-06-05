# データモデル (横断)

> **正本**: `src/db/schema.ts` (Drizzle スキーマ — 列定義レベルの真実はここ) と `migrations/*.sql` (実際に適用された DDL)。
> 本ファイルは「どのテーブルがどの機能に属し、どこを見ればよいか」の地図に徹する。列の最新仕様は必ず `schema.ts` を見る。
> ER 図 (Mermaid・テーブル関係) は [er-diagram.md](./er-diagram.md)。

---

## テナント基盤 (auth)

| テーブル | 役割 | 機能 |
|---|---|---|
| `tenants` | テナント (学校) | auth |
| `users` | ユーザー (Google アカウント紐づき) | auth |
| `user_tenant_roles` | ユーザー × テナント × ロール (M:N) | auth |
| `user_tenant_profiles` | テナント内ニックネーム等 | profile |
| `invitations` | 招待リンク・トークン | auth |

すべての業務テーブルは `tenant_id` を持ち、RLS でテナント隔離される (→ [rls-and-tenancy.md](./rls-and-tenancy.md))。

---

## 日誌・記録 (journal)

| テーブル | 役割 |
|---|---|
| `journal_entries` | 日誌エントリ本体 (content / mood / kind / is_public) |
| `emotion_tags` | 感情タグ (system_admin 管理・category: positive/negative/neutral) |
| `knowledge_tags` | ナレッジタグ (teacher 作成可) |
| `journal_entry_tags` | エントリ × emotion_tag (M:N) |
| `journal_entry_knowledge_tags` | エントリ × knowledge_tag (M:N) |
| `journal_knowledge_reactions` | リアクション (knowledge/appreciation/endorsement の 3 種) |
| `public_journal_entries` (VIEW) | 公開タイムライン用 VIEW (is_public 列を露出しない) |

詳細は [features/journal/](../features/journal/overview.md)。クロステナント参照は複合 FK `(entry_id, tenant_id)` で物理的に防ぐ。

---

## タスク管理 (tasks)

| テーブル | 役割 |
|---|---|
| `tasks` | タスク本体 (title / status / due_date / category_id) |
| `task_assignees` | タスク × ユーザー (複数アサイン M:N) |
| `task_comments` | タスクコメント |
| `task_categories` | カテゴリマスタ (system_default 9 個 + テナント拡張) |
| `task_tags` | タスクタグ (teacher 作成可) |
| `task_tag_assignments` | タスク × tag (M:N) |

詳細は [features/tasks/](../features/tasks/overview.md)。`status` enum: backlog / todo / in_progress / review / done。`due_date` は DATE 型 (timezone free)、`completed_at` は timestamptz。

---

## その他の機能テーブル

| 機能 | 主なテーブル | 備考 |
|---|---|---|
| ai-chat | `ai_sessions` | 本人 + system_admin のみ可視・school_admin 不可視 (踏み絵)。→ [features/ai-chat](../features/ai-chat/overview.md) |
| feedback | フィードバック submissions / topics / replies / 既読状態 | → [features/feedback](../features/feedback/overview.md) |
| profile | `user_tenant_profiles` / `user_filter_preferences` / `user_onboarding_states` | → [features/profile](../features/profile/overview.md) |
| その他 | announcements ほか | |

列定義の最新は `src/db/schema.ts`、ER 図は [er-diagram.md](./er-diagram.md)。

---

## 設計上の不変則

- すべての業務テーブルに `tenant_id` を持たせ、複合 FK でクロステナント参照を物理的に不可能にする。
- 情緒データ (mood・感情タグ・日誌本文) と業務データ (タスク・業務タグ) はテーブルレベルで分かれている。集計してよいのは後者だけ (→ [PHILOSOPHY §4.1](../PHILOSOPHY.md))。
- 退会時のユーザーは `users.user_id` を SET NULL で匿名化し、投稿本体は残す (→ user-lifecycle.md 移植予定)。
