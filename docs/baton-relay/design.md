# baton-relay（朝のバトンリレー / H7-A）設計書

> **位置づけ**: 未実装・staging。`src/features/baton-relay/` ⇄ `docs/baton-relay/` の build spec。
> **循環そのもの**（H7 仮説・循環図・踏み絵ゲート・一体の計測・進め方）は単一正本
> [`../proposal/h7-circulation.md`](../proposal/h7-circulation.md) にあり、ここには複写しない。
> この機能は循環の**入口**（生徒情報を書く・溜める側）を担う。
>
> **graduate**: 実装着手時に `docs/features/baton-relay/` へ昇格し `docs/README.md` の機能一覧表へ追加、
> データモデルは `foundation/data-model.md` / RLS は `foundation/rls-and-tenancy.md` へ正本化する。

- **対象仮説**: H7-A（→ [循環の正本](../proposal/h7-circulation.md)）
- **作成**: 2026-06-06

---

## 1. 問い・対象仮説

**問い**: 朝のバトンリレーで生徒の見守りは充実するか。

**対象仮説**: 担任・教科担当・その他の先生方が一緒に生徒を見守る仕組みが作れるか。背景には、いま生徒
対応が担任に集中していて抱え込みやすい構造があり、周囲の先生も支え合えるなら生徒情報に関わりたいと
思っている。

---

## 2. 機能仮説

1. 朝の出欠確認で、気になる生徒にチェックまたはコメント。
2. 次の先生も同じ画面で追記・チェック・コメントができる。
3. 各生徒欄から、職員室ボードに共有コメント・タスクを追加できる（**A→B**・§6 連携）。
4. 職員室ボードに共有されたコメントへのリアクションが、生徒欄にも反映される（**B→A**・§6 連携）。
5. クラス全体の目標を掲載／クラス全体へのコメントもできる。

> ふりかえり生成は出口（staffroom）側の責務。v1 は人/ルールベース、AI は §7 ゲート（循環の正本 §6）。

---

## 3. UI 仮説

- 「**今日の生徒一覧ページ**」にして入力しやすく（= 生徒欄＝結節点の主画面）。
- 入力しなくても、**印をつけるだけでいい**（負担最小化＝アンケートの壁「時間・入力」への回答）。
- コメント欄は 1 行、またはテンプレボタンで手間を減らす。
- **保存ボタンなしで自動保存**。
- 次の先生も上書きしていけるよう**行追加**でき、**誰が書いた変更か分かる**（引き継ぎ用・採点用ではない）。
- 最上部に**クラス目標**を掲げて確認しやすく。

> **“生徒欄” は教員ビューの中の欄であり、児童本人はアプリを使わない。** 教員の本音が児童に見える
> PHILOSOPHY §4.0 の逆向き事故は構造的に起きない。

---

## 4. データモデル（v1）

既存規約に揃える: `tenant_id NOT NULL → tenants (cascade)` / `(id, tenant_id)` UNIQUE + 複合 FK で
クロステナント参照を物理防止 / `pgEnum` / 次 migration は `0049_*`〜（`src/db/schema.ts` 準拠）。

| エンティティ | 役割 | 主なカラム（案） |
|---|---|---|
| `classes` | クラス（クラス目標を持つ最小単位） | `id, tenant_id, name, goal_text?, school_year, timestamps` |
| `students` | 生徒（軽量・最小 PII） | `id, tenant_id, class_id(複合 FK), display_name, grade_label, status(active/archived), enrolled_at, left_at?, timestamps` |
| `baton_notes` | 生徒欄の「印 / 一言」 | `id, tenant_id, student_id(複合 FK), author_user_id, note_date(date), period(pgEnum), content text?(任意), care_flag boolean, created_at` |

- **`care_flag` は非数値トグル**（「気にかけたい」の印）。**1〜5 のスコアにしない**（子どもの採点化＝
  PHILOSOPHY §4.0/§4.2 を踏むため）。
- 「誰が書いた変更か分かる」は `baton_notes.author_user_id` + 行追加で実現（引き継ぎの可読性のため。
  貢献ランキング化しない）。
- スコア・ランキング・leaderboard は持たない。

---

## 5. 可視性・RLS（§3 を物理で守る）

RLS は `src/db/rls/policies.ts`（generated）に追加。`migrations/0049_*`〜で適用。

| ロール | classes / students / baton_notes |
|---|---|
| **teacher** | 自テナントを読み書き（**全教員可視＝確定**・相互関心層）。 |
| **school_admin** | **バトン個票を見ない（見えない）**。組織状態の俯瞰に該当する集計は v1 では作らない。 |
| **system_admin** | 既存パターン（健全性監視）。 |

- **透明性（PHILOSOPHY §5）**: 「あなたが書いたこれは誰に見えるか」を UI で常に明示する。
- 共通の踏み絵ガード（AI を `baton_notes.content` に触れさせない 等）は循環の正本 §3 を参照。

---

## 6. 連携（seam）— staffroom との接続契約

- **A→B（昇る）**: 各生徒欄からの「共有コメント・タスク」を、staffroom の職員室ボードへ流す。実体は
  既存 `journal_entries`(is_public) の拡張に `student_id` / `class_id` の軸を付与したもの（正本は
  staffroom 側）。→ [`../staffroom/design.md`](../staffroom/design.md)
- **B→A（還る）**: 職員室ボードで生まれたリアクションを、生徒欄ビューに反映表示する（baton-relay は
  staffroom のリアクションを**読み取って**生徒欄に映す。リアクションの正本データは staffroom）。
- リアクションは「**同僚のメモへの共感・労い**」であって子どもの評価ではない（UI コピーで担保）。

---

## 7. 児童データのライフサイクル・保持（確定）

児童は未成年であり、users（教員）とは別系統。**最小 PII** に留める。

> **保持期間 = 在学期間 + 卒業後 1 年の猶予。**

- **在学中**: `active`。進級は `grade_label` 更新で**一本のまま**持つ（卒業まで分断しない）。
- **在籍終了**（卒業・転校）: `archived`（`left_at` 記録）。
- **猶予 1 年経過後**: **終端処理**（匿名化 / purge）。

これで「**軽量・恒久 dossier 化しない**」と「**卒業まで一本で持つ**」が統合される。値の決め打ちは不要
（在学期間に紐づくため）。**残る判断は技術的実装のみ**: archive の粒度（生徒 / クラス / 年度単位）、
匿名化と purge の使い分け基準。将来 `foundation/student-data-lifecycle.md` 新設の可能性を follow-up
として記す（今は作らない）。

---

## 8. 実装フェーズの DoD（CLAUDE.md 準拠）

1. **feature ブランチを切る**（main 直 push 禁止・PR 必須）。
2. **新規 table は migration（`0049_*`〜）**で追加し、**AppRunner deploy より前に適用**。
3. **新規 `pages/api/**` は `src/openapi/registry.ts` 登録 + `pnpm gen:openapi`**、`openapi:check` /
   `openapi:coverage` をローカル緑で確認（CI ハードゲート）。
4. **commit / push / PR / deploy のタイミングは chimo が握る**。本番 deploy・migration は先生稼働
   時間帯を避ける。
5. **graduate**: `docs/features/baton-relay/` へ昇格し `docs/README.md` の表を更新。

---

## 関連

- 循環の正本（H7 仮説・踏み絵・計測）: [`../proposal/h7-circulation.md`](../proposal/h7-circulation.md)
- 出口（H7-B）: [`../staffroom/design.md`](../staffroom/design.md)
- 起点提案: [`../proposal/proposal_1.html`](../proposal/proposal_1.html)
- 設計憲法: [`../PHILOSOPHY.md`](../PHILOSOPHY.md)
- 既存 journal（ボードの土台）: [`../features/journal/overview.md`](../features/journal/overview.md)
