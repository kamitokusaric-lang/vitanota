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

- **stack 関係**: S2 は S1 を含む（`git merge-base --is-ancestor` 確認済み）。**続きは `feature/h7-baton-screen` から H7-B ブランチを stack する。**
- 次の migration 番号は **0050**（0049 は S1・本番未適用）。

## 2. 既決事項（**次セッションで蒸し返さない**）

- **school_admin = teacher と同一権限**（相互関心層に管理職も参加）。§3 踏み絵は「**admin 向けの集計・温度カード・ランキング俯瞰を作らないこと**」で守る。行レベルの可視は監視ではない。→ 出荷時に `baton-relay/design.md §5` と `staffroom/design.md §4` の「school_admin は個票を見ない」記述を**この決定に合わせて修正**する（まだ未修正）。
- `baton_notes` は **append-only**（同著者・同生徒・同日に複数行可・一意制約なし）。
- **period は持たない**（`note_date` のみ）。
- 印 = `student_reactions`（**positive / concern** の2種・journal 同型トグル・`(tenant,student,user,type)` 一意）。**数値化・ランキングしない**（ガード2/3）。生徒リストは**ロスター順固定**（気になる数で並べ替えない）。
- 透明性文言 = 「**校内の先生に共有されます**」（「校長には見えません」とは書かない）。
- ロスター CSV インポートは**冪等**（クラス名統合・目標は最新値・生徒同名スキップ）。形式 = `クラス,クラス目標,生徒名,学年`。
- RLS は **migration 直書き**（calendar_events 先例）。`policies.ts` generator は使わない。

## 3. 残りの実装（出荷はこれを全部終えてから）

### ③ H7-B 出口＝循環の本体（次の主戦場）
- **職員室ボード**: `journal_entries`(is_public) 拡張に `student_id`/`class_id` 軸 + **board 種別** + **コメントツリー新設**（journal にコメント無し・`tasks` の comment を雛形）+ ふりかえり（**v1 は人/ルール**・AI は §7 ゲートで出さない）。
  - 🔴 **着手前に決める設計**: board 種別を「既存 `journal_entry_kind` 拡張」か「専用テーブル」か（h7-circulation/staffroom で未確定）。
- **A→B seam**: 生徒欄の「共有コメント/タスク」を職員室ボードへ昇格（正本データは staffroom 側）。
- **B→A seam**: 職員室のリアクションを生徒欄ビューに反映（baton-relay が staffroom を読み取る）。
- **循環の計測**（h7-circulation §5）: 各段階1指標のログ点を**実装時に最初から仕込む**（書く=参加実人数 / 閲覧率 / 役立ち率 / リアクション付与率 / 循環実感スコアは裏アンケート）。

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
