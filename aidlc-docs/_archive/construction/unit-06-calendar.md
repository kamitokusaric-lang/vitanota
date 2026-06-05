# Unit-06: カレンダー表示機能

**作成日**: 2026-05-29
**ステータス**: Phase 0 (設計確定) — 実装は Phase 1 以降

---

## 1. 背景と仮説

### 背景

vitanota では H3 仮説 (今日 1 日の見通しを AI が提示) を検証してきたが、 当日単位の見通し提示の利用率は低く、 教員の日常的な行動には十分に合っていない可能性が見えた (memory `project_h3_reframing_20260520` の経緯)。

一方で教員の仕事は当日単位では完結せず、 授業・会議・行事・提出期限・生徒対応・校務分掌などが **週単位・月単位で重なりながら** 進行している。

### 新 H3 仮説

> 週単位・月単位で予定とタスクの偏りがカレンダー上で見えると、 先生は仕事の見通しを持ちやすくなる。

### 下位仮説

- 教員は「今日やること」 を提示されるより、 週の中でどの日が詰まっているかを見たい
- タスクが日付ごとに見えると、 期限や作業タイミングを調整しやすくなる
- 月単位で大きな予定・行事を見渡せると、 先の準備を意識しやすくなる
- AI が優先順位を決めるより、 教員自身が見て動かせる方が受け入れられやすい

---

## 2. 上位制約 (chimo 2026-05-29 明示)

1. **schema 変更ゼロ** — DB は絶対に触らない。 既存 `tasks` テーブル + `task_assignees` + `task_categories` をそのまま流用
2. **view が変わるだけ** — タスクのスコープ / 権限 / データモデルは既存タスクボードのものを完全踏襲。 calendar はタスクボードと同じデータを別 view で見せる入口
3. **「予定」 機能 (events) は MVP scope 外** — 要件 6.5 の「予定」 (時刻・種別・会議/行事) は schema 変更を伴うため、 Phase 7 以降の別議論
4. **morning_plan + 朝カードと並走** — 既存 H3 朝カード (Phase 1 H3-B) と morning_plan Lambda は撤去せず、 calendar は別 view として共存。 段階移行判断は実データ蓄積後

---

## 3. 既存資産との関係

### 流用

| 既存資産 | 用途 |
|---|---|
| `tasks` テーブル (`dueDate` / `status` / `categoryId`) | calendar の日付セル振り分け |
| `task_assignees` テーブル | scope='mine' フィルタ ([[project_journal_task_model_20260424]] 踏襲) |
| `task_categories` (system_default 9 体系 + テナントカスタム) | カテゴリ表示・色分け |
| `/api/tasks` (既存) | calendar データ取得 (期間絞り込みで再利用) |
| `src/features/tasks/components/ManualTaskCreateForm` | Phase 6 でカレンダー上の「+」 から流用 ([[project_task_form_components]]) |

### 共存 (撤去せず)

- `morning_plan` Lambda + `today_plan_v1` prompt
- 朝カード (`MorningCard*` / `morning_card_events`)
- 既存タスクボード (segmented control に「ボード」 が初期選択肢として残る)

---

## 4. Phase 分割

| Phase | scope | 想定工数 |
|---|---|---|
| **0** | 設計確定 + ブランチ + 本設計書 (schema 変更なし、 実コード 0) | 1h |
| **1** | 週表示 view + segmented control + tasks 表示 (dueDate ベース) + 1 日最大 4 件 + 件数表示 + スマホ縦リスト | 4-6h |
| **2** | 月表示 view + 日付クリック → その日の詳細モーダル | 2-3h |
| **3** | ドラッグ&ドロップ日付変更 (PC + タッチ対応) + 「来週に渡す」 ボタン (翌週月曜固定移動) | 3-5h |
| **4** | 混み具合表示 (ルールベース、 やわらかい文言: 余白あり / ふつう / 少し多め / 山場かも) | 1-2h |
| **5** | AI コメント (ルールベース、 週の偏り / 余白のある日 / 前倒し提案) | 1-2h |
| **6** | カレンダー上「+」 ボタンからのタスク追加 (既存 ManualTaskCreateForm 流用、 日付初期値) | 1h |
| ---- | **MVP scope 外、 別議論** | |
| **7+** | 「予定」 機能 (events、 時刻、 種別、 schema 変更を伴う) | TBD |

**合計 MVP (Phase 0-6)**: 13-20h、 PR 7 本想定

各 Phase ごとに別 plan モードで計画 → 別 feature ブランチ → PR → chimo 判断 → merge → 次 Phase。 main を常に安定状態に保つ。

---

## 5. 設計要点

### 入り口

- タスクボード上部に segmented control `[ ボード | 週 | 月 ]`
- 初期表示 = **週**
- 既存タスクボードを「ボード」 view として retain (撤去せず)
- view 状態は URL クエリ (`?view=week|month|board`) で保持 → ページリロード / 共有でも復元

### データ取得

- 既存 `/api/tasks` を期間絞り込みで再利用 (`?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=mine`)
- server side filter が既存 endpoint で対応済みなら流用、 未対応なら Phase 1 で追加
- SWR で week / month 単位の cache key 管理
- scope='mine' (assignees 経由の自分担当) を default、 全体表示は将来検討

### 表示単位

- tasks の `dueDate` 基準で日付セルに振り分け
- `dueDate IS NULL` のタスクは calendar に出ない (タスクボード経由で扱う)
- 日付セル内の並び順: `status` (未完了優先) → `priority` (将来) → `createdAt`

### 新規 component 配置

```
src/features/calendar/
├── components/
│   ├── CalendarWeekView.tsx       # 週 (月-日 7 列)
│   ├── CalendarMonthView.tsx      # 月 (5-6 行 × 7 列、 概要中心)
│   ├── CalendarViewSwitcher.tsx   # segmented control
│   ├── CalendarDayCell.tsx        # 1 日のセル
│   ├── CalendarMobileList.tsx     # スマホ縦リスト
│   └── CalendarTaskItem.tsx       # タスク 1 件の表示
├── hooks/
│   └── useCalendarTasks.ts        # 週/月単位の取得 SWR
└── lib/
    ├── dateRange.ts               # 週/月の from-to 計算 (JST)
    ├── crowdLevel.ts              # Phase 4: 混み具合判定
    └── aiCommentRules.ts          # Phase 5: 簡易 AI コメント
```

### 表示件数制御 (Phase 1)

- 1 日あたり最大 4 件表示
- 5 件以上は `+N 件` で表示 (クリックで詳細は Phase 2 月表示の日付クリック動線に統合)

### 混み具合判定 (Phase 4)

ルールベース、 やわらかい文言:

| タスク件数 | 表示 |
|---|---|
| 0-2 件 | 余白あり |
| 3-5 件 | ふつう |
| 6-8 件 | 少し多め |
| 9 件以上 | 山場かも |

**避ける**: 「危険」「過多」「詰まりすぎ」 などの強い表現。

将来「予定」 機能 (Phase 7+) が入ったら、 予定数で 1 段階上げる調整を加える。

### 「来週に渡す」 操作 (Phase 3)

- 表示文言: 「来週に渡す」 (memory `feedback_design_vocab` 整合)
- 動作: 対象タスクの `dueDate` を翌週月曜に変更
- 「未完了を責める」 文言は使わない (memory `feedback_observed_moment_broken` 踏み絵)

### AI コメント (Phase 5)

- ルールベース or 簡易 AI コメント (MVP では既存 Bedrock 連携を呼ばない)
- 週の偏り、 余白のある日、 前倒し提案を **柔らかく**
- 「水曜日は危険です」 「優先度 1 位はこれです」 等は禁止 (memory `feedback_ai_output_guards`)
- ✅ OK 例: 「水曜日に少しタスクが集まっています。」「木曜日は少し余白がありそうです。」

---

## 6. 踏み絵チェック

| 踏み絵 | 該当 memory | Phase 0 評価 |
|---|---|---|
| 「忙しい日 = 悪」 と感じさせない | `feedback_design_vocab` | ✅ 「山場かも」 等の柔らかい語彙設計済 |
| 警告色を多用しない | 要件 7.4 / `feedback_design_vocab` | ✅ Phase 4 で色設計時に再確認 |
| AI が決定権を持たない | `feedback_observed_moment_broken` / `feedback_ai_output_guards` | ✅ AI コメントは提案・補助、 確定強要なし |
| mood に触らない | `feedback_mood_ai_untouchable` | ✅ calendar は予定・タスク・期限のみ、 mood は出さない |
| school_admin への「誰がサボってる」 系集計を出さない | `feedback_observed_moment_broken` | ✅ scope='mine' default、 全体表示は MVP scope 外 |
| 観測感を作らない | `feedback_observed_moment_broken` | ✅ AI 利用は限定 (Phase 5 ルールベース)、 「AI が学習しています」 等の文言は出さない |
| 既存 morning_plan / 朝カードと干渉しない | 並走方針 | ✅ calendar は別 view、 朝カードはダッシュボード上に残置 |

---

## 7. 非機能要件 (要件文書 7 章のまとめ)

### 7.1 表示速度
- 期間 (週/月) を絞った API 取得で初期表示を高速化
- 必要に応じてローディング表示

### 7.2 スマホ対応
- 縦長レイアウト優先 (Phase 1 で `CalendarMobileList.tsx`)
- 横スクロールに頼らない
- タッチ操作対応 (Phase 3 でドラッグ&ドロップタッチ)

### 7.3 視認性
- 予定とタスクの区別 (Phase 7+ で予定が入ったら色 / 形で識別)
- カテゴリ色・ステータス色・予定種別色を競合させない
- 既存 task_categories の色を流用

### 7.4 心理的負担への配慮
- 警告色多用禁止
- 「山場かも」 等のやわらかい表現
- 余白のある日も表示
- 未完了を責めない
- 「タスクが多い日 = 悪い状態」 として扱わない

---

## 8. 関連ドキュメント・memory

### 設計ドキュメント
- 要件文書 (chimo 2026-05-29 提示) — チャットログ参照
- [`construction/unit-05/`](unit-05/) — AI 連携第一弾 (chat extraction)
- [`operations/post-mvp-backlog.md`](../operations/post-mvp-backlog.md) — H3 リフレーミング項目に関連

### memory
- `project_h3_reframing_20260520` — H3-A 見通し仮説 / H3-B 来訪価値仮説の経緯
- `project_h3_morning_arrival_value` — 朝カード設計 (並走対象)
- `project_morning_plan_h3` — morning_plan Lambda の現状
- `project_journal_task_model_20260424` — scope='mine' / delegated 仕様
- `project_task_form_components` — ManualTaskCreateForm 流用元
- `feedback_observed_moment_broken` — 最上位踏み絵
- `feedback_design_vocab` — 柔らかい語彙設計
- `feedback_ai_output_guards` — AI 出力の hard guard
- `feedback_mood_ai_untouchable` — mood 不可侵
