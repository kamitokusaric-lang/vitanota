# staffroom（職員室ダッシュボード / H7-B）設計書

> **位置づけ**: 本番実装済（2026-06-15 出荷）。`src/features/staffroom/` の設計記録。
> **循環そのもの**（H7 仮説・循環図・踏み絵ゲート・一体の計測・進め方）は単一正本
> [`../../proposal/h7-circulation.md`](../../proposal/h7-circulation.md) にあり、ここには複写しない。
> この機能は循環の**出口**（学校知として返し、反応を生む側）を担う。
>
> **as-built 差分**（本書は原設計 2026-06-06。実装で変わった主な点）:
> 職員室ボード = `journal_entries` の kind `keep/concern/thanks/help` 直値（補助 enum 列なし）/
> **読み取り専用**（起票は右レーン `TodayCaptureBox` に一本化・`BoardComposer` 撤去）/
> **コメント機能は全撤去**（`staffroom_board_comments` 不採用）/ RLS は migration 直書き。
> 現行 UI の概要は [overview.md](./overview.md)。下記 §2 / §4 のコメントツリー記述は撤去済。

- **対象仮説**: H7-B（→ [循環の正本](../../proposal/h7-circulation.md)）
- **作成**: 2026-06-06

> **更新 (chimo 2026-06-12 / 入力一本化)**: 記録の**起票は右サイドの入口に一本化**した
> （ダッシュボードの `TodayCaptureBox` で雑に書き、種別 `keep/concern/thanks/help` を選ぶと
> 職員室ボードへ流れる）。**職員室ボードからは起票しない** — 読む・反応する出口に徹する
> （`BoardComposer` 撤去）。**コメント返信は初期不採用**とし、テーブル `staffroom_board_comments`・
> 関連 API・UI を撤去した（リアクションは右サイドと共通の 3 種を維持）。下記 §2.2 / §4 の
> コメントツリー記述はこの方針に置き換わる。

---

## 1. 問い・対象仮説

**問い**: 職員室ボードは、投稿を学校知として返す循環装置になれるか。

**対象仮説**: 投稿が「自分の思ったこと」中心になりやすく学校知として循環しづらい現状を、生徒の様子・
気づきが自然に共有され、ふりかえりとして返ることで、投稿・閲覧・反応・再投稿の循環に変えられるか。

> **§3 の境界（最重要・chimo 2026-06-10 で更新）**: school_admin は **teacher と同一権限で相互関心層に
> 参加する**（個票も同僚として読める）。守るべきは「個票を school_admin から隠すこと」ではなく、
> **個票を admin の組織状態レンズ（集計・温度カード・ランキング俯瞰）に流し込む経路を作らないこと**。
> 職員室ボードは既存 school_admin `/dashboard`（組織状態層）とは別物として保ち、ボードを集計化する
> admin ビューを作らない。これで PHILOSOPHY §3（行レベルの可視は監視ではない／集計俯瞰が監視）を守る。

---

## 2. 機能仮説

1. 各クラスごとの生徒情報の投稿が見られる。
2. その投稿にコメントとリアクションができる。
3. **Keep・Problem・Try・Thanks** ボードを置く。
4. **Help** ボードを置く。
5. **共有（なんでも書いていい）** ボードを置く。
6. 昨日のふりかえり・週次ふりかえりを置く（**v1 は人/ルールベース**。AI 生成は §7 ゲート）。

---

## 3. UI 仮説

- **マイダッシュボードと職員室ダッシュボードを分ける**（2 層を UI で立てる）。
- マイダッシュボード右カラムは「投稿一覧」ではなく「**職員室の今**」への入口にする。
- 入力テンプレートがあれば書き出しやすい。

---

## 4. データモデル・可視性（v1）

既存規約に揃える（`tenant_id` / 複合 FK / `pgEnum` / 次 migration `0049_*`〜）。

- **職員室ボード = 既存 `journal_entries`(is_public=true) の拡張**で実現する。生徒欄からの共有コメントは
  この公開エントリに `student_id` / `class_id` の軸を足したもの（§6 連携）。
- **コメントツリー**を新設し、**リアクションは既存 3 種**（参考になった / お疲れ様です / すてきです）を
  再利用する（`journal_reaction_type` enum）。ゼロから別システムを建てない。
- **KPT+Thanks / Help / 共有ボード**は投稿の種別軸（例: 既存 `journal_entry_kind` の拡張、または board
  種別 enum）で表現する。実装時に「既存 kind 拡張」か「専用テーブル」かを確定する。
- **ふりかえり**: v1 は人/ルールベースの「昨日のまとめ・今週のまとめ」。AI 生成は §7 ゲート
  （→ [`../../foundation/backlog.md`](../../foundation/backlog.md)）。

### 可視性・RLS（§3 を物理で守る）

RLS は `src/db/rls/policies.ts`（generated）に追加。`migrations/0049_*`〜で適用。

| ロール | 職員室ボード個票・コメント・リアクション |
|---|---|
| **teacher** | 自テナントを読み書き（全教員可視・相互関心層）。 |
| **school_admin** | **teacher と同一権限でボード個票を読み書きできる**（相互関心層に管理職も参加）。踏み絵は「ボードを集計化する admin ビュー（組織状態の俯瞰）を作らないこと」で守る。 |
| **system_admin** | 既存パターン（健全性監視）。 |

- **壁の置き場所（更新）**: ① マイ / 職員室（個人 ⇄ 教員集団）を UI で分ける。② school_admin は教員集団の
  一員としてボードを読めるが、**ボードを集計化する admin ビュー（組織状態レンズ）は作らない**。
  壁は「school_admin を RLS でボードから締め出す」ではなく「個票を集計俯瞰に流す経路を作らない」側に置く。
- 共通の踏み絵ガード（集計・温度カード・ランキング俯瞰を作らない / リアクションは同僚への共感 /
  循環実感スコアはアプリ内スコア化しない 等）は循環の正本 §3 を参照。

---

## 5. ふりかえりと §7 ゲート

「返す」段階のふりかえりは循環のエンジン。だが AI 生成は PHILOSOPHY §7 で 2026-04-27 に凍結した
「先週のvitanotaレポート」の隣接領域。

- **v1**: 人/ルールベース（集計・列挙ベースの「昨日／今週のまとめ」）に留める。
- **graduate（AI 生成）の条件**（明示的な §7 再決定）: 学校知を返す・教員無記名・fact+提案のみ
  （§4.3）・mood/生徒感情は要約しない・生徒個人を特定しない。
- 退避先: [`../../foundation/backlog.md`](../../foundation/backlog.md) の「§7 ゲート: H7 学校知循環の AI 週次
  ふりかえり」。

---

## 6. 連携（seam）— baton-relay との接続契約

- **A→B（昇る）**: baton-relay の各生徒欄からの「共有コメント・タスク」を職員室ボードに受け取る。実体は
  `journal_entries`(is_public) 拡張に `student_id` / `class_id` を付与したもの（**正本は staffroom 側**）。
  → [`../baton-relay/design.md`](../baton-relay/design.md)
- **B→A（還る）**: 職員室ボードで生まれた**リアクションの正本は staffroom が持ち**、baton-relay が
  読み取って生徒欄ビューに反映表示する。
- リアクションは「**同僚のメモへの共感・労い**」であって子どもの評価ではない（UI コピーで担保）。

---

## 7. 実装フェーズの DoD（CLAUDE.md 準拠）

1. **feature ブランチを切る**（main 直 push 禁止・PR 必須）。
2. **新規 table / カラムは migration（`0049_*`〜）**で追加し、**AppRunner deploy より前に適用**。
3. **新規 `pages/api/**` は `src/openapi/registry.ts` 登録 + `pnpm gen:openapi`**、`openapi:check` /
   `openapi:coverage` をローカル緑で確認（CI ハードゲート）。
4. **commit / push / PR / deploy のタイミングは chimo が握る**。本番 deploy・migration は先生稼働
   時間帯を避ける。
5. **graduate**: `docs/features/staffroom/` へ昇格し `docs/README.md` の表を更新。

---

## 関連

- 循環の正本（H7 仮説・踏み絵・計測）: [`../../proposal/h7-circulation.md`](../../proposal/h7-circulation.md)
- 入口（H7-A）: [`../baton-relay/design.md`](../baton-relay/design.md)
- 既存 journal（ボードの土台・リアクション 3 種）: [`../journal/overview.md`](../journal/overview.md)
- 既存ダッシュボード（組織状態層・§3 の対岸）: [`../dashboard/overview.md`](../dashboard/overview.md)
- 設計憲法: [`../../PHILOSOPHY.md`](../../PHILOSOPHY.md)
