# baton-relay (朝のバトンリレー / H7-A)

> 朝、担任以外の先生も同じ画面で生徒を見守る「入口」。生徒欄に印と一言を残し、職員室ボード (出口) へつながる。H7「学校知の循環」の入口側。

- **src**: `src/features/baton-relay/`
- **対応要件**: H7-A (朝のバトンリレー, 2026-06-15 本番出荷)
- **粒度**: overview (本書・現行) + [design.md](./design.md) (原設計記録 + as-built 差分)
- **OpenAPI**: baton-relay 系 (classes / students / notes / reactions / import)

## 何ができるか

- ダッシュボード「生徒ノート」タブ: クラスごとカードタブ (クラス名の昇順) で切替、各タブに朝バトン記入画面 (`BatonRelayBoard`) を埋め込み。タブ末尾の **「＋」タブ** でクラス追加フォームをタブ内に開き、追加すると新クラスのタブへ切替。
- 生徒欄の印 = **Good (positive) / 気になる (concern)** のトグル。押した人を hover/focus の tooltip で表示。**数値化・ランキングしない**、リストはロスター順固定。
- 一言を **append** (同著者・同日に複数可・誰が書いた行か分かる)。クラス目標を最上部に表示・編集。
- ロスター入力: **改行区切りで生徒をまとめて追加** (件数確認 → 登録・冪等で同名スキップ)。生徒追加フォームは記入画面の最下部、クラス追加はタブ末尾の「＋」タブ (`/baton-relay` 独立ページのみ最下部にクラス追加も残す)。生徒行の 3 点リーダーでクラス変更。
- 透明性: 「校内の先生に共有されます」を明示。**児童本人はアプリを使わない** (PHILOSOPHY §4.0 の逆向き事故が構造的に起きない)。

## データモデル / 可視性

- `classes` / `students` / `baton_notes` / `student_reactions` (migration 0049)。職員室ボード seam 用に `journal_entries` へ `student_id` / `class_id` (0051)。
- teacher / **school_admin は同一権限**で自テナント読み書き (相互関心層に管理職も参加)。踏み絵 = admin 向けの集計・ランキング俯瞰を作らないこと。RLS は migration 直書き。

## 踏み絵

- 印は非数値トグル (子どもの採点化を避ける)。スコア / ランキング / leaderboard を持たない。
- 児童 PII は最小・保持は在学期間 + 卒業後 1 年。終端処理 (匿名化 / purge) は backlog。

## 詳細・関連

- 原設計 + as-built 差分: [design.md](./design.md)
- 循環の正本 (H7 仮説・踏み絵・計測): [../../proposal/h7-circulation.md](../../proposal/h7-circulation.md)
- 出口 (H7-B): [../staffroom/overview.md](../staffroom/overview.md)
