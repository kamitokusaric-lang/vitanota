# staffroom (職員室ボード / H7-B)

> 投稿を「学校知」として返す循環の**出口**。先生の気づき・相談・感謝・続けたいことが職員室ボードに並び、リアクションで反応が返る。H7「学校知の循環」の出口側。

- **src**: `src/features/staffroom/`
- **対応要件**: H7-B (職員室ボード, 2026-06-15 本番出荷)
- **粒度**: overview (本書・現行) + [design.md](./design.md) (原設計記録 + as-built 差分)
- **OpenAPI**: staffroom 系 (board / student-support)

## 何ができるか

- ダッシュボード「職員室ボード」タブ: **読み取り専用**のフィード (起票は右レーン `TodayCaptureBox` に一本化)。
- 2 セクション = **生徒の様子** / **情報共有**。上部に共通の**期間ナビ** (右上で**週毎/月毎**を切替・既定=今週)。先(週/月)に戻る・次の(週/月)に進む、未来は出さない。生徒ノートの日付ナビと同じ体裁。値は常に {from,to} (週=月曜〜日曜 / 月=1日〜末日)。**生徒の様子も印・一言ともその期間に絞る** (その期間の活動だけ表示)。
- **生徒の様子** = クラス別の畳めるアコーディオン (外枠フラット)。見出しにダイジェスト集計 (生徒数・Good/気になる合計)、開くと生徒の印 + 付いたコメントを全部表示。
- **情報共有** = `journal_entries` の kind 直値の箱。並びは **相談 (help) → 感謝 (thanks) → 役に立つ (knowledge)**。役に立つ情報箱は、**投稿区分として復活した `knowledge`** (chimo 2026-06-30) と「なるほど」リアクション付き投稿の自動集計 (公開 note も対象) の両方が並ぶ。`keep`/`concern` は生徒ノート由来。
  - `knowledge` は `staffroomBoardKindSchema` の投稿可能 kind に復帰 (`BOARD_VIEW_KINDS` にも追加)。職員室ノートの投稿箱 (`TodayCaptureBox`) の「ナレッジ」チップで書ける。ふりかえり→AIリコメンド ([journal/retro-recommend.md](../journal/retro-recommend.md)) のナレッジもここへ。
- リアクションは右レーンのタイムラインで付ける (既存 journal 3 種を再利用)。`isMine` で見た目を変えない。

## データモデル / 可視性

- 職員室ボード = 既存 `journal_entries` を kind (keep/concern/thanks/help) で表現 (専用テーブルにしない・migration 0050 で enum 拡張)。`student_id` / `class_id` 軸は 0051。
- **コメント機能は不採用** (`staffroom_board_comments` は撤去)。
- teacher / **school_admin は同一権限**でボードを読める (相互関心層)。踏み絵 = ボードを集計化する admin ビュー (組織状態レンズ) を作らないこと。RLS は migration 直書き。

## 踏み絵

- §3 の「学校」= 教員集団 (相互関心層)。個票を admin の集計・温度カード・ランキング俯瞰に流す経路を作らない (行レベルの可視は監視ではない / 集計俯瞰が監視)。
- ふりかえり (昨日/今週) は v1 人/ルールベース。AI 生成は PHILOSOPHY §7 ゲート (backlog)。

## 詳細・関連

- 原設計 + as-built 差分: [design.md](./design.md)
- 循環の正本 (H7 仮説・踏み絵・計測): [../../proposal/h7-circulation.md](../../proposal/h7-circulation.md)
- 入口 (H7-A): [../baton-relay/overview.md](../baton-relay/overview.md)
