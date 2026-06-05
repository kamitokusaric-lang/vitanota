# 2026-05-07 教員向け説明会向け機能追加 — 実装プラン

> **対応要件**: [`inception/requirements/2026-05-07-meeting-features.md`](../requirements/2026-05-07-meeting-features.md)
> **想定工数**: 3.8〜4.3 日 (5/2 着手 / 5/7 当日)
> **作成日**: 2026-05-02

## タイムライン

| Day | 主作業 | 完了判定 |
|---|---|---|
| 5/2 (今日) | 設計フェーズ + ベースライン tag + 機能 C 着手 | アプリケーション設計完了 + git tag `pre-meeting-features-baseline` |
| 5/3 | 機能 A 実装 | A 全 step GREEN + ローカル動作 OK |
| 5/4 | 機能 B 前半 (schema + 教員 UI + 投稿 API) | B 前半 GREEN + ローカル動作 OK |
| 5/5 | 機能 B 後半 (system_admin UI + CRUD UI) | B 後半 GREEN + ローカル動作 OK |
| 5/6 (予備日) | 統合テスト + 本番デプロイ + リハ | 本番動作確認 + 招待発行リハ完了 |
| 5/7 (当日) | 説明会 | (作業なし) |

## ブランチ戦略 (memory: revert 可能性原則)

- **ベースブランチ**: `main` (現状本番稼働中)
- **作業ブランチ**: `feat/2026-05-07-meeting-features` (機能 A/B/C を 1 ブランチに統合)
- **ベースライン tag**: `pre-meeting-features-baseline` を作業前の main HEAD に付与 (本番ロールバック用)
- **マージ戦略**: 全機能完了後に main へ squash or merge (chimo 判断)、CI GREEN 確認後に本番デプロイ

## 機能 A: 25 名一括招待 + system_admin 招待管理画面

### Step A-1: GET /api/system/invitations (一覧取得 API)
- [ ] `pages/api/system/invitations/index.ts` を新規作成
- [ ] `GET` ハンドラ: query param `tenantId` を受け、当該テナントの全招待を返す
- [ ] レスポンス形式: `{ invitations: [{ id, email, role, invitedAt, expiresAt, usedAt, status, inviteUrl }] }`
- [ ] `status` は `'accepted' | 'pending' | 'expired'` の 3 値で計算 (DB row + NOW() 比較)
- [ ] 権限: system_admin のみ (`session.user.roles.includes('system_admin')` チェック)
- [ ] 未認可は 401 / 403 を既存パターンに合わせて返す

### Step A-2: POST /api/system/invitations (bulk 投入 API)
- [ ] 同ファイル `pages/api/system/invitations/index.ts` に `POST` ハンドラ追加
- [ ] body 形式: `{ tenantId: string, emails: string[], role: 'teacher' | 'school_admin' }`
- [ ] Zod schema で検証 (email 形式 / array length 1〜100)
- [ ] 既存 `pages/api/invitations/index.ts` のロジック (重複招待無効化 + 新規 token 発行) を内部関数化して再利用
- [ ] 1 件単位で commit (失敗しても他は成功させる)
- [ ] レスポンス: `{ results: [{ email, status: 'created' | 'failed', invitation?, error? }] }`
- [ ] 権限: system_admin のみ

### Step A-3: pages/admin/invitations.tsx (UI)
- [ ] 新規作成
- [ ] テナント選択ドロップダウン (`/api/system/tenants` から取得)
- [ ] 一括投入セクション: textarea (placeholder「メールアドレスを改行 or カンマ区切りで貼り付け」) + 投入ボタン
- [ ] 投入結果サマリ表示 (成功 N 件 / 失敗 M 件)
- [ ] 招待一覧テーブル: Email / ロール / 招待日 / 期限 / ステータス (色付きバッジ) / 招待 URL (コピーボタン) / 期限切れなら「再発行」ボタン
- [ ] 投入後と再発行後は一覧を再取得 (state 反映)
- [ ] `TenantGuard` + `RoleGuard` で system_admin 限定

### Step A-4: pages/admin/tenants.tsx にリンク追加
- [ ] 各テナント行に「招待管理」リンク追加 (`/admin/invitations?tenantId=xxx`)

### Step A-5: テスト
- [ ] `__tests__/unit/` に bulk API のロジック (重複処理) のユニットテスト
- [ ] `__tests__/integration/` に system_admin 権限 / cross-tenant 防御の integration テスト
- [ ] Playwright E2E: 「system_admin で招待管理画面 → 一括投入 → 一覧確認 → 別ブラウザで招待 URL 開く → 受諾後一覧でステータス更新確認」

### Step A-6: ローカル動作確認
- [ ] `pnpm dev` で起動、bootstrap user で system_admin としてログイン
- [ ] テナント選択 → 一括投入 → URL 取得 → 受諾までの一連の流れを実機確認

---

## 機能 B 前半: スキーマ + 教員 UI + 投稿 API

### Step B-01: migration 作成
- [ ] `migrations/00XX_feedback_topics_and_submissions.sql` 新規 (XX は次の連番、要確認)
- [ ] `feedback_topics` テーブル: id (UUID PK) / title (varchar 100, NOT NULL) / description (text) / is_active (bool, default true) / sort_order (int, default 0) / created_at / updated_at
- [ ] `feedback_submissions` テーブル: id (UUID PK) / topic_id (UUID, FK → feedback_topics.id ON DELETE RESTRICT) / user_id (UUID, FK → users.id) / tenant_id (UUID, FK → tenants.id) / content (text, NOT NULL) / created_at
- [ ] index: feedback_submissions(topic_id) / feedback_submissions(tenant_id, created_at DESC)
- [ ] RLS 有効化 (FORCE)

### Step B-02: RLS ポリシー
- [ ] `feedback_topics`: 全ロール SELECT 可 (教員も active トピック取得が必要)、INSERT/UPDATE/DELETE は system_admin のみ
- [ ] `feedback_submissions`: SELECT は system_admin のみ。teacher / school_admin は INSERT のみ可 (自分の tenant_id 強制)
- [ ] `pnpm rls:generate` (DSL から生成) → `pnpm rls:check` (CI 用検証)

### Step B-03: src/db/schema.ts に Drizzle スキーマ追加
- [ ] `feedbackTopics` / `feedbackSubmissions` の export

### Step B-04: seed SQL 作成 (3 トピック)
- [ ] `migrations/seed-feedback-topics.sql` (idempotent な INSERT ... ON CONFLICT DO NOTHING)
- [ ] memory 「seed スクリプト安全方針」: DELETE 含めない / tenant ID ハードコードしない
- [ ] トピック 3 件: 改善してほしい点 / あったら嬉しい機能 / その他なんでも感想や質問

### Step B-05: ローカル DB に migration 適用 + 動作確認
- [ ] `pnpm db:migrate` (or 同等のローカル migration コマンド)
- [ ] seed SQL 実行 → Adminer で 3 行確認
- [ ] psql で teacher ロールに切り替えて `SELECT * FROM feedback_submissions` が拒否されることを確認

### Step B-06: GET /api/feedback/topics (教員用)
- [ ] 新規 `pages/api/feedback/topics.ts`
- [ ] is_active=true のトピックを sort_order ASC で返す
- [ ] レスポンス: `{ topics: [{ id, title, description, sortOrder }] }`
- [ ] 権限: 認証済み (teacher / school_admin / system_admin 全 OK)

### Step B-07: POST /api/feedback/submissions (教員用)
- [ ] 新規 `pages/api/feedback/submissions.ts`
- [ ] body 形式: `{ topicId: string, content: string }`
- [ ] tenant_id / user_id は session から強制注入 (クライアントから受け取らない)
- [ ] content は 1〜5000 文字 (Zod)
- [ ] 構造化ログ: `event: 'feedback.submitted'` (本文は含めない)

### Step B-08: 教員 UI
- [ ] ダッシュボードのいずれかのタブ or 共通ヘッダーに「フィードバックを送る」エントリポイント追加
- [ ] モーダル or `pages/feedback/new.tsx`:
  - トピック選択 (radio or select、ヒント文を選択時に表示)
  - 自由記述 textarea (5000 字制限の counter 表示)
  - 「運営にだけ届きます」明示
  - 送信ボタン → 送信後に「ありがとうございました」メッセージ表示

### Step B-09: テスト (B 前半分)
- [ ] unit: API ハンドラの validation / RLS context 設定
- [ ] integration: teacher が他者の投稿を SELECT できないことを実 DB で確認
- [ ] integration: クロステナント漏洩防御 (別テナント teacher が他テナントに POST 不可)

### Step B-10: ローカル動作確認
- [ ] teacher ロールで投稿 → 別 teacher で確認できないことを実機検証

---

## 機能 B 後半: system_admin UI + トピック CRUD UI

### Step B-11: GET /api/system/feedback (全投稿一覧)
- [ ] 新規 `pages/api/system/feedback/index.ts`
- [ ] query: `tenantId?` / `topicId?` でフィルタ可
- [ ] JOIN: feedback_submissions × feedback_topics × users × tenants
- [ ] レスポンス: 投稿日時 / トピック title / 投稿者 email / テナント name / 本文
- [ ] 権限: system_admin のみ

### Step B-12: GET /api/system/feedback/topics (CRUD UI 用一覧)
- [ ] 新規 `pages/api/system/feedback/topics/index.ts`
- [ ] 全トピック (is_active 含む) + 各トピックの投稿数 (subquery COUNT) を返す
- [ ] レスポンス: `{ topics: [{ id, title, description, sortOrder, isActive, submissionCount }] }`

### Step B-13: POST /api/system/feedback/topics
- [ ] 同ファイル `index.ts` の POST ハンドラ
- [ ] body: `{ title, description?, sortOrder, isActive }`
- [ ] Zod 検証

### Step B-14: PATCH /api/system/feedback/topics/[id]
- [ ] 新規 `pages/api/system/feedback/topics/[id].ts`
- [ ] 部分更新 (title / description / sortOrder / isActive)

### Step B-15: DELETE /api/system/feedback/topics/[id]
- [ ] 同ファイル `[id].ts` の DELETE ハンドラ
- [ ] サーバ側で投稿数チェック → 0 件なら DELETE 実行 (FK RESTRICT が DB レベル保護)、> 0 なら 409 Conflict
- [ ] 409 レスポンス: `{ error: 'TOPIC_HAS_SUBMISSIONS', submissionCount: N }`

### Step B-16: pages/admin/feedback.tsx (投稿一覧 view)
- [ ] テナント別フィルタ + トピック別フィルタ
- [ ] テーブル表示 (投稿日時 / トピック / 投稿者 / テナント / 本文)
- [ ] 上部に「トピック管理」へのリンク

### Step B-17: pages/admin/feedback/topics.tsx (CRUD UI)
- [ ] 一覧テーブル: title / description / sort_order / is_active トグル / 投稿数 / 操作 (編集 / 削除 or 無効化)
- [ ] 「新規追加」ボタン → モーダル (title / description / sortOrder / isActive)
- [ ] 編集 → 同モーダル (既存値プリフィル)
- [ ] 削除ボタン (投稿数 = 0 のみ表示) / 無効化ボタン (投稿数 > 0) の条件分岐
- [ ] 409 受け取ったら UI で「投稿があるため削除できません。無効化に切り替えてください」とフィードバック

### Step B-18: テスト (B 後半分)
- [ ] unit: トピック CRUD validation
- [ ] integration: DELETE が投稿数で挙動分岐すること、teacher / school_admin は CRUD 一切不可
- [ ] integration: PATCH で is_active=false にしたトピックが教員の `/api/feedback/topics` に出ないこと

### Step B-19: ローカル動作確認
- [ ] system_admin で全 CRUD 操作 + 教員 UI への反映を実機確認

---

## 機能 C: タスク複製ボタン

### Step C-1: POST /api/tasks/[id]/duplicate
- [ ] 新規 `pages/api/tasks/[id]/duplicate.ts`
- [ ] body: `{ ownerUserId: string }` (新規 owner)
- [ ] 元タスクを SELECT → title / description / category_id / due_date をコピー、status='todo' / completed_at=null / created_by=session user / owner_user_id=body の値
- [ ] 同テナント内のみ (RLS で物理保証、API でも明示チェック)
- [ ] レスポンス: `{ task: { ...新タスク } }`

### Step C-2: TaskBoard.tsx に複製ボタン追加
- [ ] タスクカード (or 詳細モーダル) に「複製」ボタン
- [ ] クリックで複製モーダル表示

### Step C-3: 複製モーダル
- [ ] TaskForm を流用 or 新規 modal: title / description / category / due_date は元タスクからプリフィル (編集可)、owner_user_id は空欄
- [ ] owner 選択は既存の `useAssignees` hook で teacher 一覧取得
- [ ] 「複製」ボタンで `POST /api/tasks/[id]/duplicate` 呼び出し
- [ ] 成功後 TaskBoard を再取得

### Step C-4: テスト
- [ ] unit: API ハンドラの cross-tenant 防御 / status='todo' リセット
- [ ] integration: 元タスクが残ること / 複製タスクの created_by が複製操作者であること

### Step C-5: ローカル動作確認
- [ ] teacher ロールで複製操作 → 別 teacher が新タスクを所有することを実機確認

---

## 統合フェーズ: ビルド & 本番デプロイ (5/6)

### Step Z-1: 全体ビルド & テスト
- [ ] `pnpm install` (新規 dependency 追加なし想定)
- [ ] `pnpm lint` GREEN
- [ ] `pnpm typecheck` (or `pnpm tsc --noEmit`) GREEN
- [ ] `pnpm test` (unit + integration) GREEN
- [ ] `pnpm build` (Next.js production build) GREEN

### Step Z-2: ベースライン tag 確認 + main マージ
- [ ] `git tag pre-meeting-features-baseline <main HEAD before merge>` (まだなら付ける)
- [ ] `feat/2026-05-07-meeting-features` を main にマージ (PR 経由 or 直接)
- [ ] CI GREEN 確認

### Step Z-3: 本番アプリデプロイ
- [ ] `cdk deploy vitanota-prod-app`
- [ ] AppRunner が新 Docker image を pull → health check GREEN

### Step Z-4: 本番 DB migration 適用 (memory: 本番 DB migration フロー必須)
- [ ] `aws lambda invoke --function-name vitanota-prod-db-migrator --payload '{"command":"migrate"}' /tmp/migrate.json`
- [ ] レスポンスで feedback_topics / feedback_submissions テーブル作成成功確認
- [ ] 本番 RDS に psql で接続して `\dt` で確認

### Step Z-5: seed トピック投入
- [ ] 本番 DB に手動 SQL で 3 トピック INSERT
- [ ] (もし db-migrator に seed 機能を統合するならその方式に合わせる、要 chimo 判断)

### Step Z-6: 本番動作確認
- [ ] system_admin (chimo) でログイン → `/admin/invitations` / `/admin/feedback` / `/admin/feedback/topics` 全画面動作確認
- [ ] テスト用 teacher アカウントでフィードバック投稿 → system_admin で確認
- [ ] テスト用 teacher でタスク複製動作確認

### Step Z-7: 招待発行リハ
- [ ] 説明会用 25 名分の email を chimo から受領
- [ ] `/admin/invitations` で実際にテスト bulk 投入 (1〜2 件で動作確認)
- [ ] 招待 URL を 1 件取得 → 別ブラウザで実際に受諾フロー確認

### Step Z-8: 説明会前最終確認
- [ ] 招待 URL CSV (or 一覧コピー) を chimo に渡す
- [ ] 説明会で使うシナリオ (招待 → 受諾 → ダッシュボード触る → タスク作成 → 複製 → フィードバック投稿) を chimo がリハ

---

## ロールバック手順

### コードのロールバック (本番 deploy 後に問題発覚)
1. `git checkout pre-meeting-features-baseline`
2. `cdk deploy vitanota-prod-app` (旧 image を再 push)
3. AppRunner が旧 image に戻る (~3 分)

### スキーマのロールバック (新規テーブルのみ)
- `feedback_topics` / `feedback_submissions` は新規追加のみで既存テーブル変更なし
- 残置しても害なし (アプリが参照しないだけ)
- 完全削除したい場合: `DROP TABLE feedback_submissions; DROP TABLE feedback_topics;` (CASCADE 不要、FK 順で削除)

### 部分的なロールバック
- 機能 A だけ revert: `pages/admin/invitations.tsx` + `pages/api/system/invitations/` を削除、tenants.tsx のリンク削除
- 機能 B だけ revert: schema 残置 + UI / API ファイル削除
- 機能 C だけ revert: `pages/api/tasks/[id]/duplicate.ts` 削除 + TaskBoard の複製ボタン削除

---

## 進捗追跡

| 機能 | ステータス | 完了日 |
|---|---|---|
| アプリケーション設計 | ⏳ pending | - |
| 機能 A (招待) | ⏳ pending | - |
| 機能 B 前半 (schema + 教員 UI) | ⏳ pending | - |
| 機能 B 後半 (system_admin UI + CRUD) | ⏳ pending | - |
| 機能 C (タスク複製) | ⏳ pending | - |
| 統合 + 本番デプロイ | ⏳ pending | - |

## 参照
- 要件: [`inception/requirements/2026-05-07-meeting-features.md`](../requirements/2026-05-07-meeting-features.md)
- 既存招待 API: `pages/api/invitations/index.ts`
- 既存タスク schema: `migrations/0014_unit05_task_core.sql`
- 既存 RLS 設計: `migrations/0009_rls_role_separation.sql`
- 本番 DB migration フロー: `aidlc-docs/operations/post-mvp-backlog.md` 関連リファレンス節
- ベースライン tag: `pre-meeting-features-baseline` (本プラン実行前 main HEAD)
