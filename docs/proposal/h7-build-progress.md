# H7 朝バトン 実装 進捗 & 次の手順（次セッション用・手順を間違えないための記録）

> **更新**: 2026-06-09 / **正本リンク**: 循環 [`h7-circulation.md`](./h7-circulation.md)・入口 [`../baton-relay/design.md`](../baton-relay/design.md)・出口 [`../staffroom/design.md`](../staffroom/design.md)
>
> **最重要方針（chimo 2026-06-09）**: **出口（職員室ボード H7-B）まで閉じてから本番に出す。**
> S1（データ基盤）・S2（画面）を**単独で main にマージ／デプロイしない**。循環が一周する形（入口→出口→反応）になってから一括で出荷する。

---

## 1. いまの到達点（コミット済・**main 未マージ**）

| スライス | 内容 | ブランチ | commit |
|---|---|---|---|
| **S1 データ基盤** | classes/students/baton_notes/student_reactions + RLS + API 6本 + 結合テスト・migration **0049** | `feature/h7-baton-data-foundation` | `503b61a` |
| **S2 画面 + CSV** | 朝の生徒一覧（印2種・一言append・目標・透明性・モバイルファースト）+ ロスター CSV 取り込み | `feature/h7-baton-screen`（S1 の上に **stack**） | `46a0892` |
| **S3 出口データ基盤** | 職員室ボード = `journal_entries(kind IN keep/concern/thanks/help)`（補助列なし）+ student_id/class_id 軸 + コメントツリー `staffroom_board_comments` + RLS + API 7本（board/comments）+ リアクション既存再利用 + 計測ログ点3種 + OpenAPI 登録 + 結合テスト13・migration **0050/0051** | `feature/h7-staffroom-board`（S2 の上に **stack**） | 未コミット（2026-06-10 実装・全 DoD 緑） |

- **stack 関係**: S2 は S1 を含む。S3 は S2 を含む（`feature/h7-staffroom-board` は `feature/h7-baton-screen` から分岐）。**続きの seam スライス S4b+ は `feature/h7-staffroom-board` から stack する。**
- 次の migration 番号は **0052**（0049=S1 / 0050=kind enum 追加 / 0051=staffroom 本体。いずれも本番未適用）。
- **board モデル確定（chimo 2026-06-10・旧 board_type/kpt_label 案から変更）**:
  - 板カテゴリ = `journal_entry_kind` の直値 **`keep`(続けたい)/`concern`(気になる)/`thanks`(ありがとう)/`help`(たすけて)**。補助 enum 列は持たない。Try / 共有 / KPT 4分類は廃止。
  - `is_public` は**全 kind 共通の公開トグル・default true**（board も例外にしない）。旧案の「board は is_public=false 固定 + CHECK + 専用 RLS」は撤去。可視性は既存 journal RLS（公開=`public_read` で同僚可視 / 非公開=`owner_all` で本人のみ）。フィードは app 層で「公開 OR 自分」に絞る。
  - **日々ノートとの分離は後回し**（chimo: 今はやらない）。公開 board は当面 journal の公開タイムライン/集計にも流れる。kind 絞り込みでの分離は後続スライス。
  - ⚠️ **0050/0051 を分けた理由**: 本番 db-migrator は各ファイルを 1 tx で包む。`ALTER TYPE ADD VALUE` した値を同 tx で参照すると PG が "unsafe use of new value" で落ちるため、ADD VALUE を 0050 に隔離（0025 と同じ規律）。
  - 💡 **潰した罠**: 複合 FK の素の `ON DELETE SET NULL` は FK 全列（tenant_id 含む）を NULL にし NOT NULL 違反。PG15+ の列指定 `SET NULL (student_id)` で回避（本番/ローカルとも PG16）。結合テストが検出。

## 2. 既決事項（**次セッションで蒸し返さない**）

- **school_admin = teacher と同一権限**（相互関心層に管理職も参加）。§3 踏み絵は「**admin 向けの集計・温度カード・ランキング俯瞰を作らないこと**」で守る。行レベルの可視は監視ではない。→ 出荷時に `baton-relay/design.md §5` と `staffroom/design.md §4` の「school_admin は個票を見ない」記述を**この決定に合わせて修正**する（まだ未修正）。
- `baton_notes` は **append-only**（同著者・同生徒・同日に複数行可・一意制約なし）。
- **period は持たない**（`note_date` のみ）。
- 印 = `student_reactions`（**positive / concern** の2種・journal 同型トグル・`(tenant,student,user,type)` 一意）。**数値化・ランキングしない**（ガード2/3）。生徒リストは**ロスター順固定**（気になる数で並べ替えない）。
- 透明性文言 = 「**校内の先生に共有されます**」（「校長には見えません」とは書かない）。
- ロスター CSV インポートは**冪等**（クラス名統合・目標は最新値・生徒同名スキップ）。形式 = `クラス,クラス目標,生徒名,学年`。
- RLS は **migration 直書き**（calendar_events 先例）。`policies.ts` generator は使わない。

## 3. 残りの実装（出荷はこれを全部終えてから）

### ③ H7-B 出口＝循環の本体
- ✅ **S3 データ基盤 完了**（`feature/h7-staffroom-board`・migration 0050/0051・全 DoD 緑）:
  - board 種別 = **既存 `journal_entry_kind` 拡張**で確定（chimo 2026-06-10）。kind='board' + `staffroom_board_type`(kpt/help/share) + `staffroom_kpt_label`(keep/problem/try/thanks) の dedicated enum 2列。
  - コメントツリー `staffroom_board_comments`（parent_comment_id 自己複合 FK・task_comments 雛形）。
  - リアクションは既存 `journal_knowledge_reactions`（3種）を board 行へ流用（新 migration 不要・既存 route 再利用）。
  - 計測ログ点: `staffroom_board_posted` / `staffroom_board_comment_posted` / `staffroom_board_reacted`（info のみ・観測感を作らない）。**閲覧率・役立ち率の計測は S4 UI で追加**。
- 🟡 **S4 ボード UI（実装済・chimo ブラウザ確認待ち・未コミット）**: `/staffroom` ページ + dashboard 導線 + 単一フィード + カテゴリバッジ（chimo 2026-06-10 確定）。
  - `src/features/staffroom/{components,hooks,types}`: StaffroomBoard（絞りチップ すべて/続けたい/気になる/ありがとう/たすけて）/ BoardComposer（4カテゴリ + 本文 + **公開/自分だけトグル（default 公開）**）/ BoardCard（カテゴリバッジ・投稿者・本文・非公開マーク・ReactionBar・コメント開閉、isMine で見た目を変えない）/ CommentThread（parent_comment_id ツリー + 返信）/ ReactionBar（既存 journal 3 種を再利用）。
  - board list API にリアクションを `attachReactions` 再利用で載せた（`boardResponseSchema.reactions` 追加・openapi 再生成）。リアクションのトグルは既存 `/api/private/journal/entries/{id}/reactions` を board 行に流用。
  - 入口は `requireRole='teacher'`（`hasRequiredRole` で teacher / school_admin 両方通る = 相互関心層）。
  - **計測の判断**: §5 の「閲覧率」は週次ふりかえり指標（S4b 領域）。ボード閲覧そのものは §5 の定義指標でなく、観測感を作るのを避けるため board-view ログは入れない。「書く / リアクション」は S3 API で計測済み。
  - **S4 で出していない**（次スライス S4b）: ふりかえり画面（人/ルールの昨日/今週まとめ・役立ち率ボタン）/ 投稿の本文インライン編集 UI（PATCH API はある）。
- 🔜 **A→B / B→A seam の UI 動線**（生徒欄 ↔ 職員室）。受け取り口（`journal_entries.student_id/class_id`）は S3 済み。
- 🔜 **A→B seam**: 生徒欄の「共有コメント/タスク」を職員室ボードへ昇格（正本データは staffroom 側・`journal_entries.student_id/class_id` は受け取り口として S3 で用意済み）。
- 🔜 **B→A seam**: 職員室のリアクションを生徒欄ビューに反映（baton-relay が staffroom を読み取る）。

### ② H7-A 画面の小さな残り
- クラス全体へのコメント（design §2-5 後半。目標は実装済み）。
- 「書く＝参加実人数」等の計測ログ点（S2 では未instrument）。

### ④ 横断・基盤
- グローバルモバイルシェル刷新（hamburger/bottom-tab・重い山）。**H7 出荷の必須ではない**ので、出口を固める判断とは分離可（chimo 判断）。
- students 終端バッチ（在籍終了 + 猶予1年後の匿名化/purge・未成年 PII・法的）。

### ⑤ chimo 判断待ちの論点（h7-circulation §7）
- 養護教諭・SC の健康文脈を全教員可視バトンに乗せるか／別扱いか。
- AI ふりかえりの §7 再決定（人/ルールで回した後 AI 生成へ graduate するか）。

## 4. 出荷手順（③が揃ってから・順番厳守）

1. **H7-B も含めて全スライス完成・各 DoD 緑**（feature branch・OpenAPI 登録+gen+check+coverage・local migrate=ハルヒ実行・test/lint/type-check/integration 緑）。
2. **PR を順に**: `feature/h7-baton-data-foundation`(S1) → `feature/h7-baton-screen`(S2) → H7-B、の stack 順に main へ。複数 PR の連続マージは AppRunner deploy 衝突に注意（シリアル運用 or `gh run rerun --failed`）。
3. **migration を deploy より前に順次適用**: 0049（S1）→ 0050+（H7-B）。**先生稼働時間帯を避ける**。本番適用は `cdk deploy app` → `aws lambda invoke`（db-migrator）の2段階。
4. **docs graduate**: `docs/baton-relay/`→`docs/features/baton-relay/`、`docs/staffroom/`→`docs/features/staffroom/` 昇格・`docs/README.md` 機能一覧表に追加・data-model/RLS を `foundation/` へ正本化・design.md の school_admin 記述を §2 の決定に修正。
5. commit/push/PR/deploy のタイミングは **chimo が握る**。

## 5. 動作確認メモ（ローカル）

- DB は S1 で dev/test 両方 migrate 済み。`pnpm db:local:up` → `pnpm db:local:migrate`。
- `pnpm dev` → `/baton-relay`（dashboard の「☀️ 朝のバトン」リンク経由）。CSV 取り込みは画面下の「CSV でまとめて取り込む」。
- 検証: `pnpm type-check` / `pnpm lint` / `pnpm build` / `pnpm test` / `DATABASE_URL=postgresql://vitanota:vitanota_local@localhost:5432/vitanota_test pnpm test:integration`。
