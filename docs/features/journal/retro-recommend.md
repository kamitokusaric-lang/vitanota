# journal — ふりかえり → AIリコメンド

> マイノート (非公開 note) の「今日のふりかえり」を AI が読み、職員室ノートへの投稿を
> 区分 (相談 / 感謝 / ナレッジ / つぶやき) つきでそっと促す。
> 設計の元記録: [`docs/proposal/retrospective.md`](../../proposal/retrospective.md)。実装: 2026-06-30〜07-01。

## 位置づけ

校務サイクル②「AI が気づき＋リコメンドを返す」。抱え込み (認知の層) を「**気づきは能動的／行動は促す**」でほぐす。ふりかえりに書いた困りごと・良い工夫を、書いた本人が一人で抱えないよう、公開の下書きまで用意して背中を押す。

> **設計判断 (2026-07-01)**: 元設計 §1 は「行動は受け身に徹する」だったが、実装時に chimo 判断で「**職員室ノートにも投稿しませんか?**」と**明示的に投稿を促す**方向へ振った (提示 UI に固定 CTA)。気づき (awareness) は AI 生成、投稿の誘い文はアプリ側固定。

## フロー

```
ふりかえり保存 (DiaryNoteBox, kind=note / is_public=false)
   │  保存成功後に fire-and-forget (保存を邪魔しない)
   ▼
POST /api/journal/recommend { entryId }   … 計算 or キャッシュ返却 (idempotent)
   │  ルール(routeCategory)で区分を絞る → PII マスク → AI(Lambda / ローカル mock)
   ▼
journal_recommendations に永続化 (entry 1:1・status=proposed)
   ▼
マイノート詳細 (MyNotesByKind のふりかえりカード) で提示
   ・気づき + 「職員室ノートにも投稿しませんか?」
   ・出す文面プレビュー (相談/感謝/ナレッジ=AIドラフト、つぶやき=原文)
   ・今日はやめておく / 修正してつぶやく / このままつぶやく
   ▼
出す = コピー作成 (元のふりかえりは残す・いずれも is_public=true)
   相談/感謝/ナレッジ → POST /api/staffroom/board (help/thanks/knowledge)
   つぶやき         → POST /api/private/journal/entries (note, is_public=true)
   → PATCH /api/journal/recommend で status=published (+ 計測)
```

## 判定 (ルール + AI 併用)

- **区分は「ルール」が決める** (`src/features/journal/recommend/recommendRouter.ts` の `routeCategory`)。本番でも同じコードが動く (mock/実 Bedrock 共通)。
  - 「気になった・困ったこと」欄に中身があれば**最優先で相談** (よかったことが並んでいても)。keep は当たり前、拾うべきは困りごと。
  - 感謝の語 → 感謝 / 再現できる工夫 → ナレッジ / それ以外のポジ → つぶやき / 手がかり無し → null (ゼロ件許容)。
- **AI は `awareness` (気づき) と `draft` (公開用文面) を生成**し、`surface` (出す価値あるか) を判断する。**区分・宛先は選ばせない**。宛先は `categoryToDestination()` で category から導出 (`recommendSchema.ts`)。
- **mood は AI 入力の信号として渡す (読むだけ)**。推定・上書き・スコア化はしない。出力に mood を持たせない (踏み絵)。
- 出力スキーマは `retroRecommendResultSchema` (`.strict()`)。ローカルは `mockRetroRecommend` (文字列組み立ての当て込み・文章品質は実 Bedrock が担う)。

## データ

- **`journal_recommendations`** (migration 0055): entry と 1:1 (`journal_entry_id` UNIQUE・cascade)。`output_json` (§6 出力)・`status` (proposed/published/dismissed)・プロンプト改善用メタ (`input_masked` / `model_id` / `prompt_version` / `final_category` / `body_changed`)。
- RLS は `ai_sessions` (0036/0039) と同水準: 本人 + system_admin のみ、school_admin は自分の分だけ (他人不可)。
- モデル: [foundation/data-model.md](../../foundation/data-model.md) / スキーマ正本 `src/db/schema.ts`。

## 分析・プロンプト改善 (system_admin)

- 集計ダッシュボード `/admin/retro-recommend` (`GET /api/system/retro-analytics`) — 気づき提示率・転換率・見送り率・編集率・区分別。
- 匿名 CSV エクスポート (`GET /api/system/retro-recommend-export`) — reason/awareness/draft を prompt 改善用に。詳細は [features/system](../system/overview.md)。

## 踏み絵

- **公開側にだけ立つ**。マイノート (ふりかえり) には AI は割り込まず、そっとリコメンドを控えめに出すだけ。私的な正直さを壊さない。
- 公開は**移動でなくコピー**。デフォルト非公開を崩さない。
- **見送り (今日はやめておく) を一級市民に**。同じ重さで常に提示。
- `reason` は本人に見せず集計のみ。個票を管理者の俯瞰に流さない ([PHILOSOPHY §4](../../PHILOSOPHY.md))。
- mood は読むだけ ([overview の踏み絵](./overview.md) の更新版と整合)。感情代弁・励まし・評価を出さない。

## 機能フラグ

`ENABLE_RETRO_RECOMMEND` (master) + `AI_CHAT_ALLOWLIST_TENANT_IDS` (AI チャットと共有)。`isRetroRecommendEnabledForTenant()` で判定、allowlist 外は 404。詳細は [features/ai-chat](../ai-chat/overview.md)。

## 主なファイル

- ルール/スキーマ: `src/features/journal/recommend/{recommendRouter,recommendSchema}.ts`
- API: `pages/api/journal/recommend.ts`
- UI: `src/features/journal/components/{RetroRecommendation,TodayReflectionCard}.tsx`、`src/features/dashboard/components/MyNotesByKind.tsx`
- Lambda: `scripts/ai-chat-extract/{handler,bedrockInvoker,schemas}.ts` (`retrospective_recommend` 分岐)
- 分析: `pages/admin/retro-recommend.tsx`、`pages/api/system/retro-{analytics,recommend-export}.ts`
