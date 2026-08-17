# 研修 (workshop) 設計書 —「正解がない課題にチームで向き合う」

> **位置づけ**: 実装済み (feature/workshop・未マージ) / 設計の**単一正本**。契約ボディは OpenAPI (`registry.ts` + `openapi.yaml`・tag `Workshop`) に、横断仕様は `docs/foundation/` にある。実装が本番反映されたら `docs/features/workshop/` へ graduate し、README 機能表に追加する。
>
> **対象機能**: chimo（講師）が用意する決め打ちの「研修の箱」の中で、参加する先生たちが — 研修前にチェックインの問いに答え、研修後に振り返りを投稿する。研修という一過性イベントの気づきを、日常の職員室ノートに副産物として残す。

**出典**: chimo との設計会話（2026-07-29、チーム振り返りは 2026-08-05） ／ **対象仮説**: Phase2 抱え込み5階層（[retrospective.md](retrospective.md) / 主に **C(規範)・D(対人不安)** 層）の実演 ／ **作成日**: 2026-07-29 ／ **ステータス**: 実装済み・本番反映前

---

## 1. 概要・問い

先生向けワークショップ「正解がない課題にチームで向き合う」を、vitanota の中で回す。テーマ（Cynefin の "複雑(Complex)" 領域＝「一人だと死角が残る、多くの目で見るほど早く学べる → チームでやる」）は、vitanota の「一人で抱え込まない・視点を持ち寄る」の実演そのもの。

**問い**: 研修という始まりと終わりのあるイベントを、日常の職員室（相互関心）に "宿題感" なく接続し、その気づきを副産物として残せるか。

## 2. 一文の仮説

> **入口（チェックイン）は箱の中に閉じ、出口（振り返り）は職員室に開く。** 入口で温度を作り、出口で気づきを日常に沈殿させる。この非対称が、研修を "進捗管理" でなく "相互関心の増幅装置" にする。

- **入口 = チェックイン**（研修前・任意）: 箱の中だけ・参加者に見える。日常には持ち出さない。
- **出口 = 振り返り**（研修後）: 全員可視・マイノート → 公開 → 職員室ノートへ流す。

## 3. 踏み絵ゲートの結果

| 踏み絵 | 通過条件（as-built） |
|---|---|
| 裏テーマ（教員同士の相互関心） | ◎ 教員相互の層。管理者の組織監視層とは混ぜない。 |
| 2層を重ねない | ◎ チェックインは journal に乗らない別テーブル。職員室・公開・AI に構造的に漏れない（統合テスト `workshop-rls` で固定）。 |
| 観測された瞬間に壊れる | ◎ 未回答者・未投稿者の一覧を作らない。UI に「答えたいなら／残しておきたいなら」の任意性を埋める。 |
| メンタルケア SaaS 化しない | ◎ 振り返りは既存の公開 note。感情スコア化・分析なし。mood 不可触。 |
| ゲーミフィケーション | ◎ 進捗バー・達成バッジ・ランキングなし。 |
| 副産物として残す | ◎ 振り返りが職員室ノートに積み上がり、転勤で入れ替わっても残る。 |
| 語彙 | ◎ 「置いておく／残す／向き合う／持ち寄る」を使い、分析/評価/最適化を避ける。 |

## 4. 確定した設計（chimo 2026-07-29）

軽く・使い捨て可能に：

1. **既存テーブルへのカラム追加はしない**（研修を続けるか未定）。新テーブルのみ。
2. **箱は決め打ち**（chimo が UI で作るのではない）→ 箱メタはコード定数 `WORKSHOP`（`src/features/workshop/constants.ts`）。作成 CRUD なし。
3. **参加者 = テナント内の先生全員**（participants テーブルなし）。
4. **ニセコ中だけに出す**（env allowlist・他テナントには 404 で存在を悟らせない）。
5. **研修資料は今回スコープ外**（後続スライス。`public/workshop/` に静的配置し別タブで開く想定）。
6. **振り返りは職員室ノートにも、箱の中にも見える**（二重露出）。チェックインも箱の中で参加者に見える。

### 4-1. チーム振り返り（chimo 2026-08-05 追加）

紙の配布物5「振り返り・発表シート」を画面化したもの。**個人の振り返り（既存）はそのまま残し、別軸として新設**する。

ワーク最後の **12分（62-74分）** でチームごとに1枚を埋め、そのまま **発表（74-94分・1チーム約3.5分）** に映す。要件は「埋めると勝手に綺麗なビジュアルになり、発表しやすく、読みやすい」こと。紙の配布物3 に「書くのは1人、話すのは全員」とあるとおり、入力は1台・話すのは全員で回す運用。

**個人の振り返りとの非対称（意図的）**:

| | 個人の振り返り | チーム振り返り |
|---|---|---|
| 単位 | 1人1本 | 1班1枚（共同編集） |
| 実体 | 公開 note（`journal_entries`） | 専用テーブル |
| 出口 | **職員室に開く** | **箱の中に閉じる** |
| 書込 RLS | 本人のみ | **テナント内なら誰でも上書き** |

- **箱に閉じる理由**: 設問②「誰の一言でチームが変わったか」は他者の名指しを含む。紙にその場で書いて口で言うのは温度があるが、公開ノートとして日常に残ると「誰が貢献したか」の記録に化ける（〈観測されてると思われた瞬間に壊れる〉）。
- **UPDATE を本人限定にしない理由**: チームで1枚を共同編集するため。本人が作った行しか触れない設計だと入力係が交代できない。書いた人は `updated_by` に残すが **UI には出さない**（入力係の可視化を避ける）。
- 班・設問文・班の色は定数（`constants.ts`）。**班テーブルは作らない**（参加者テーブルを作らないのと同じ方針）。班数が変わったら定数を直すだけ。
- 設問文は **紙の p5 と一字一句そろえる**（当日「紙と画面で言い方が違う」を作らない）。

## 5. データモデル（新テーブル3つのみ・既存 ALTER なし）

`migrations/0057_workshop.sql` + `migrations/0058_workshop_team_reflection.sql`。箱本体テーブル・参加者テーブル・班テーブルは作らない。各テーブルは定数 `WORKSHOP.id`（固定 UUID `872e7328-…`）を `workshop_id` に持つ。

| テーブル | 役割 | 主なカラム |
|---|---|---|
| `workshop_checkins` | チェックイン回答（1人1回答・上書き） | `id`, `tenant_id`, `workshop_id`, `user_id`(SET NULL), `answer`, `created_at`, `updated_at`。UNIQUE `(workshop_id, user_id)`。 |
| `workshop_reflections` | 振り返り（既存 note）を箱に紐付ける中間テーブル | `id`, `tenant_id`, `workshop_id`, `journal_entry_id`, `created_at`。複合 FK `(journal_entry_id, tenant_id)→journal_entries`。UNIQUE `(workshop_id, journal_entry_id)`。 |
| `workshop_team_reflections` (0058) | チーム振り返り（1班1枚・上書き） | `id`, `tenant_id`, `workshop_id`, `team_key`, `team_change`/`team_moment`/`team_motto`/`team_next`, `updated_by`(SET NULL), `created_at`, `updated_at`。UNIQUE `(tenant_id, workshop_id, team_key)`。 |

`workshop_team_reflections` の要点:

- **UNIQUE に `tenant_id` を含める。** `checkins` は `user_id` がテナント固有なので `(workshop_id, user_id)` で足りたが、`team_key` は定数なのでテナントを含めないと他テナントと衝突する（統合テストで固定）。
- **4問は空文字を許容する**（`NOT NULL DEFAULT ''`）。12分かけて少しずつ埋めるので途中保存を許す。「4問すべて空」の弾きは zod 側（`upsertTeamReflectionSchema`）。

振り返り本体は既存 `journal_entries`（`kind='note'`, `is_public=true`）。`journalEntryTags`（`schema.ts`）と同型の中間テーブルで紐付ける（journal を汚さない）。

## 6. 可視性・RLS

`app_role()` CASE パターン（`migrations/0056` 踏襲）。`ENABLE`+`FORCE`。

- `workshop_checkins`: SELECT = tenant-read（参加者に見える）／INSERT・UPDATE = 本人のみ（`user_id = app_user_id()`）。**職員室への非漏洩は「journal ではない別テーブル」で構造的に保証**（RLS でなくデータモデルで担保）。
- `workshop_reflections`: SELECT/INSERT = tenant-read（紐付いた note は is_public=true で既にテナント可視）。
- `workshop_team_reflections`: SELECT = tenant-read（箱の中で参加者に見える・発表で全班を映す）／INSERT・UPDATE = tenant 内なら誰でも（WITH CHECK は `updated_by = app_user_id()`）。**checkins と違い本人限定にしない**（§4-1 の理由）。職員室への非漏洩は checkins と同じく「journal ではない別テーブル」で構造的に保証。

統合テスト `__tests__/integration/workshop-rls.test.ts`（13 ケース・緑）でクロステナント遮断・参加者相互可視・upsert・本人のみ更新・**チェックインが journal_entries に行を作らないこと**・振り返りの公開 note 化・複合 FK、および チーム振り返りの **別 teacher による共同編集**・1班1枚・**journal に行を作らないこと**・班キーのテナント間非衝突 を固定。

## 7. 連携（seam）— journal との接続

- 振り返り投稿 = `workshopService.postReflection`：**1トランザクションで** 公開 note を INSERT → `workshop_reflections` に紐付け。作成 note は `public_journal_entries` VIEW → 職員室ノート/ボードに自動露出（追加配線なし・API 実測で確認）。
- 正本の境界: 振り返りの公開・可視性の仕様は journal/staffroom 側が正本。本文書は「箱がそこへ流し込む」接続だけを持つ。

## 8. API（教員向け `/api/workshop/*`・OpenAPI tag `Workshop`）

すべて先頭で `isWorkshopEnabledForTenant` を確認し、無効テナントは **404**（観測者原則）。`withTenantUser` で RLS を通す。

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/workshop` | 箱メタ + 自分のチェックイン + みんなのチェックイン + 振り返り一覧 |
| POST | `/api/workshop/checkin` | チェックイン回答を upsert |
| POST | `/api/workshop/reflection` | 公開 note 作成 + 箱に紐付け（レスポンスは `EntryResponse` を再利用） |
| POST | `/api/workshop/team-reflection` | チーム振り返りを upsert（1班1枚・チームの誰でも上書き可） |

契約ボディは `src/openapi/workshopSchemas.ts` + `registry.ts`。

## 9. 動線（ダッシュボード6つ目のタブ「研修」・ニセコのみ）

`pages/dashboard/index.tsx`：
- `getServerSideProps` で `workshopEnabled = isWorkshopEnabledForTenant(tenantId)` を props に。
- `workshopEnabled` のとき `mainTabs` に `{ id:'workshop', label:'研修', icon:<Puzzle/> }` を push（サイドバーは `mainTabs.map` で自動反映）。`MOBILE_TABS` にも条件付きで「研修」を足す。`TAB_DESCRIPTIONS['workshop']` を追加。
- UI は `src/features/workshop/components/WorkshopPanel.tsx`。上から**時間順**に並べる: チェックイン（研修前）→ 研修資料 → **チーム振り返り（62-74分）** → 個人の振り返り（研修後）。投稿主と他者で見た目を変えない。

### 9-1. チーム振り返りの見せ方（今回の本体）

「埋めると勝手に綺麗になる」を成立させるための実装ルール。ここが雑だと機能ごと意味を失う。

- **`TeamReflectionPoster`** — 1コンポーネントをカード（一覧・プレビュー）と全画面（発表）で使い回し、`size: 'card' | 'stage'` でタイポグラフィのスケールだけ切り替える。
  - ③ 合言葉が主役（特大）、①② が本文、④ がアクセント帯で締め。
  - **空欄は見出しごと描画しない**（穴の空いた紙に見せない）。
  - **合言葉のサイズを文字数で3段階に自動調整**（`mottoSizeClass`）。長く書かれても崩れない。
  - **合言葉が未記入なら班名を主役に昇格**させ、主役の穴を空けない。
  - 班ごとの淡いトーンは定数 `WORKSHOP_TEAMS[].tone`。既存パレット（accent/blue/green/pink）の範囲。発表中に「今どの班か」を示すためで、優劣の色分けではない。**Tailwind JIT のためクラス名は組み立てず完全な文字列で持つ**。
- **ライブプレビュー** — 入力欄の下でポスターが**保存前のドラフトを反映して**育つ。
- **発表モード `TeamReflectionStage`** — 全画面で班を `←→` でめくる（`Esc` で閉じる）。`MaterialPager` の全画面オーバーレイと同じ作法（portal / 背景スクロール停止）。**書かれた班だけ**を対象にする。
- **未記入の班は並べない**（進捗管理の見た目にしない）。**「最後に書いた人」は出さない**（入力係を可視化しない）。
- 選んだ班は `localStorage`（`vitanota.workshop.teamKey`）に保存。12分の作業中のリロード対策。
- 保存ずみ内容の読み込みは**班を選び直したときだけ**（`loadedTeamRef`）。SWR の再検証で入力中の文字を消さないため。

## 10. ライフサイクル・保持

- 研修が終わっても箱は消さない。チェックインは箱に紐づき保持（職員室に流れない）。振り返り note は既存どおり職員室に残る。
- `user_id` 退会・転勤は `SET NULL`（既存匿名化規約）。

## 11. フィーチャーフラグと本番反映

`src/features/workshop/featureFlag.ts`：master `ENABLE_WORKSHOP`（既定 false）+ 専用 `WORKSHOP_ALLOWLIST_TENANT_IDS`（空なら全テナント）。

**CDK 配線ずみ（2026-08-07）**:

- `infra/lib/app-stack.ts`: AppRunner の env に `ENABLE_WORKSHOP` / `WORKSHOP_ALLOWLIST_TENANT_IDS` を追加。
- `infra/bin/vitanota.ts`: `workshopEnable` は **prod default `'true'`** に固定（`aiChatEnableExtraction` と同型。context 渡し忘れで研修当日に機能が消える事故を防ぐ）。OFF に戻すときは `-c workshopEnable=false`。
- `infra/cdk.json`: **allowlist が空だと「全テナント ON」になり研修が他校にも出てしまう**ため、ニセコ中の tenant_id (`c5e917a0-…`) を context に固定した（渡し忘れ防御）。

**本番反映時の注意**: env は AppRunner に流すため **cdk deploy が必要**（deploy.yml の image 更新だけでは入らない）。`cdk synth` で `ENABLE_WORKSHOP=true` / allowlist=ニセコ id、かつ既存の AI 系フラグが `true` のままであることを確認してから deploy する。

## 12. 研修資料（実装済み・スライド pager）

- PDF（`public/workshop/ワークショップ資料.pdf`・24ページ・16:9）を `pdftoppm` で1ページずつ PNG 化し `public/workshop/pages/page-01.png…` に配置。
- Panel は `MaterialPager`（`WorkshopPanel.tsx`）で **1ページずつめくって表示**（前へ/次へ・`n / 24`）。iframe/PDF 埋め込みは `X-Frame-Options: DENY` で不可だったため画像 pager に切替。
- 差し替え: PDF を再変換（`pdftoppm -png -scale-to-x 1600 …`）し `WORKSHOP_MATERIAL.pageCount`（`constants.ts`）を更新。資料は静的アセットなので API を通さずクライアントが直接読む。
- **判断ずみ（chimo 2026-08-07）**: `public/workshop/` の静的資料は **認証・テナントゲートがかからない**（URL を知れば誰でも取得可）。研修 UI は 404 で絞るが、スライド画像/PDF は公開配信。**この公開配信を許容する**と決定。機微な資料に差し替えるときは、この判断を再確認すること。

## 13. 残

- ~~本番 env の CDK 追加~~（2026-08-07 実装ずみ・§11 参照）。残るのは **本番 migration 0057・0058 の適用**と **cdk deploy 実行**。
- 反映順: ① PR merge 前に migration 適用 → ② merge（AppRunner deploy 完走待ち）→ ③ `cdk deploy` で env 投入 → ④ ニセコのアカウントで研修タブを確認。
- 紙の配布物5「振り返り・発表シート」は画面に移ったので印刷不要になる（PDF の再生成は別作業）。

## 関連

- 世界観・踏み絵: [PHILOSOPHY.md](../PHILOSOPHY.md)
- 対象仮説（抱え込み5階層）: [retrospective.md](retrospective.md)
- OpenAPI 登録: `src/openapi/registry.ts`（tag `Workshop`）, `src/openapi/workshopSchemas.ts`
- RLS/データモデル横断: `docs/foundation/`（rls-and-tenancy / data-model）
