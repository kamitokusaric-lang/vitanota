# profile (プロフィール設定)

> テナント内ニックネームと、個人の表示設定 (フィルタ・オンボーディング状態) を扱う薄い機能。

- **src**: `src/features/profile/`
- **粒度**: overview 1 枚 (薄い機能)
- **OpenAPI**: あり (tag: `Account`)。フィルタ設定は `Task` tag

## 何ができるか

- テナント内ニックネーム (最大 50 字) の取得・更新 (ヘッダーのユーザー名クリック → モーダル)
- オンボーディング/ヒント表示状態の保存 (コーチマーク・未読ヒントの再表示制御)
- タスクボード/カレンダーのフィルタ設定保存

## 仕組み

- `user_tenant_profiles` (userId + tenantId + nickname)。テナント内ニックネーム重複は DB UNIQUE で保証 → 409 Conflict (`NicknameConflictError`)
- `user_onboarding_states` (context 別、例 `ai_capture` / `feedback_unread_hint`): dismissedAt / completedStep / version を UPSERT
- `user_filter_preferences` (context='tasks'): フィルタ設定を UPSERT
- RLS: いずれも本人のみ書込可 (school_admin が誤って PUT しても 0 行更新で無害)

## API

| メソッド | パス | 用途 | tag |
|---|---|---|---|
| GET/PATCH | `/api/me/profile` | ニックネーム取得/更新 | Account |
| GET/PUT | `/api/users/me/onboarding-states/{context}` | 表示状態取得/保存 | Account |
| GET/PUT | `/api/users/me/filter-preferences/tasks` | フィルタ設定取得/保存 | Task |

契約の正本は OpenAPI registry (`schemas.ts` の profile/onboarding スキーマ)。実装: `lib/profileService.ts`, `components/MyProfileModal.tsx`, `src/schemas/userOnboardingStates.ts` / `userFilterPreferences.ts`。

## 横断依存

- フィルタ設定は [features/tasks](../tasks/overview.md) / [features/calendar](../calendar/overview.md) が利用
- onboarding 状態は [features/ai-chat](../ai-chat/overview.md) / [features/feedback](../feedback/overview.md) が利用
