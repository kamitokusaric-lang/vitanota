# feedback (意見収集)

> 教員が使い勝手・要望・バグを運営に届け、運営が返信する。圧を出さず、観測の感覚を生まないように設計する。

- **src**: `src/features/feedback/`
- **対応要件**: 2026-05-07 説明会向け機能 (フィードバック)
- **粒度**: overview + api
- **OpenAPI**: あり (tag: `Feedback`)。管理者向けは `/api/system/feedback/*` で IGNORE 対象

## 何ができるか

- 右下の FAB からフィードバック送信 (トピック選択 + 自由記述)
- トピック一覧取得 (使い勝手・バグ等、active のみ)
- 自分のスレッド一覧と運営からの返信確認 (`my-threads`)
- 返信の既読化 (`mark-read`) — accordion 展開で一括既読
- 運営 (system_admin) がトピック管理・投稿への返信 (`/api/system/feedback/*`)

## 挙動のポイント

- 未読返信があると FAB に dot、モーダルに「返信が届きました」バナー
- 返信者は一律「運営より」固定表記 (個人名を出さない)
- 件数バッジで圧を出さない設計 (押し付け感の排除)

## onboarding state との関係

`useOnboardingState` (`/api/users/me/onboarding-states/{context}`) で未読ヒントの表示状態を管理。context 例: `feedback_unread_hint`, `ai_capture`。version で文言変更を追跡し、同一バージョンは再表示しない (未読返信が来たら再表示)。

## 横断依存

- API → [api.md](./api.md)
- onboarding state / プロフィール設定 → [features/profile](../profile/overview.md)
- 管理者返信は system_admin のみ → [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md)
