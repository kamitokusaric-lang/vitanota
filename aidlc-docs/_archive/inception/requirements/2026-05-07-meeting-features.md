# 2026-05-07 教員向け説明会 — 機能追加要件

> **作成日**: 2026-05-02
> **対象**: 2026-05-07 開催の 25 名教員向け vitanota 説明会
> **背景**: 校長導入意思表明 (2026-04-27) を受けた現場展開の第 1 ステップ。説明会で教員に実際に触ってもらう + フィードバックを回収するために必要な機能追加
> **位置付け**: `requirements.md` (v2.0 正本) を補完するインクリメンタル要件。Phase 1 MVP の本番稼働中アプリへの追加実装

## インテント分析

| 項目 | 内容 |
|---|---|
| リクエストタイプ | 既存基盤上の機能追加 (3 機能 + 1 確認) |
| スコープ推定 | system_admin / teacher 双方の UI 追加 + 新規 DB テーブル 2 個 + API 5 本 |
| 複雑度推定 | 中 (既存 RLS / 認証 / タスク基盤を流用、新規ユニットなし) |
| 期日 | 2026-05-07 (5 日後) |
| 想定工数 | 3.8〜4.3 日 / バッファ 0.7〜1.2 日 (5/6 予備日) |
| 要件深さ | **最小限〜標準** (chimo と相談済 / 既存基盤理解済 / 新規ユーザータイプなし) |

## 全体スコープ (3 機能 + 1 確認)

| # | 機能 | 利用者 | 必須度 | 工数 |
|---|---|---|---|---|
| A | 一括招待 + system_admin 招待管理画面 | system_admin (chimo) | 必須 | 1〜1.5 日 |
| B | フィードバック (運営宛 / トピック制 + CRUD UI) | 教員 → system_admin | 必須 | 2〜2.3 日 |
| C | タスク複製ボタン | 教員 / school_admin | 必須 | 0.5 日 |
| D | DB バックアップ (現状維持確認) | 運営 | 確認のみ | 0 日 |

---

## 機能 A: 一括招待 + system_admin 招待管理画面

### 目的
説明会当日、25 名分の招待 URL を chimo が壇上で配布できるようにする。校長 / 学校側に渡したリンクの受諾状況も chimo が把握する。

### 受け入れ条件
- **AC-A-01**: system_admin が `/admin/invitations` で特定テナントの招待一覧を閲覧できる
- **AC-A-02**: 一覧カラムは Email / ロール / 招待日 / 期限 / ステータス / 招待 URL
- **AC-A-03**: ステータスは「受諾済 (受諾日付き)」「未受諾」「期限切れ」の 3 種を視覚的に判別可 (色 / アイコン)
- **AC-A-04**: 招待 URL はワンクリックでクリップボードにコピー可
- **AC-A-05**: 「メールアドレスを改行 or カンマ区切りで貼り付け」→「全員 教員として一括招待」ボタン or 「全員 学校管理者として一括招待」ボタン (school_admin は確認ダイアログ) で複数招待を 1 操作で発行
- **AC-A-06**: 一括投入結果がそのまま下の一覧に反映 (再リロード不要)
- **AC-A-07**: 未受諾 (pending) / 期限切れ招待には「再発行」ボタン (bulk API へ 1 件投げ、既存重複ロジックで古いトークン無効化)。pending 行の再発行は誤操作防止のため確認ダイアログ必須。expired 行は確認なし (古い URL は既に無効)
- **AC-A-08**: `pages/admin/tenants.tsx` の各テナント行から招待管理画面へのリンクを追加
- **AC-A-09**: accepted (受諾済) 行には「最終アクセス日時」(`sessions.lastAccessedAt` の MAX) を表示。「招待した教員がその後 vitanota を使っているか」を運用判断するため。session が無い (まだログインしてない / 全 session expire 済) 場合は `—` 表示

### Out of scope
- メール自動送信 (5/7 後の課題、招待 URL 配布は chimo が手動)
- 招待ステータスの teacher / school_admin への可視化 (system_admin 専用画面)
- 既存の個別招待 API (`POST /api/invitations`) の廃止 (school_admin 経路として残置)

### NFR
- 既存の招待 API と同じ tenant 隔離・権限チェック (system_admin only) を適用
- bulk 投入時のトランザクション境界: 1 件単位で commit (一部失敗しても他は成功させる) + 結果サマリ表示
- 25 名分の bulk 投入が 5 秒以内に完了すること (現状 1 件 < 200ms × 25 = 余裕)

### 影響を受ける既存ファイル
- `pages/admin/tenants.tsx` (リンク追加のみ)
- `pages/api/invitations/index.ts` (変更なし、共存)

### 新規作成ファイル
- `pages/admin/invitations.tsx`
- `pages/api/system/invitations/index.ts` (`GET` 一覧 / `POST` bulk)

---

## 機能 B: フィードバック (運営宛 / トピック制)

### 目的
説明会当日 + 説明会後の継続フェーズで、教員から chimo (運営) への声を構造化して回収する。回答疲れさせない 3 トピックに絞る。

### 受け入れ条件
- **AC-B-01**: 運営側 (chimo / system_admin) が定義した active なトピックから、教員ダッシュボード上で選択して投稿できる
- **AC-B-02**: 初期 3 トピック (seed で投入):
  1. **改善してほしい点**
  2. **あったら嬉しい機能**
  3. **その他なんでも感想や質問**
- **AC-B-03**: 投稿フォームには「トピック選択 → ヒント文表示 → 自由記述 textarea → 送信」のフローがある
- **AC-B-04**: 投稿画面に「運営にだけ届きます」を明示する文言を必ず表示
- **AC-B-05**: 教員 (teacher / school_admin) は他者の投稿を一切読めない (RLS で物理的に保証)
- **AC-B-06**: system_admin は `/admin/feedback` で全投稿を閲覧 (テナント別フィルタ + トピック別フィルタ)
- **AC-B-07**: 投稿一覧の表示項目: 投稿日時 / トピック / 投稿者 (email) / テナント / 本文
- **AC-B-08**: system_admin は `/admin/feedback/topics` でトピックの CRUD ができる:
  - 新規追加: title (必須) / description (ヒント文、任意) / sort_order (数値) / is_active (default true)
  - 編集: title / description / sort_order / is_active を変更可
  - **削除はハイブリッド**:
    - 投稿数 = 0 のトピックは **物理削除可** (DELETE) — 打ち間違いの作り直し対応
    - 投稿数 > 0 のトピックは **論理削除のみ** (`is_active=false`) — 過去投稿の topic_id 参照を保護
  - UI 上で削除ボタンは条件付き表示: 投稿数 = 0 なら「削除」、> 0 なら「無効化」
  - FK の `ON DELETE` 挙動は `RESTRICT` (DB レベルで投稿があるトピックの物理削除をブロック)
- **AC-B-09**: トピック一覧画面に各トピックの累計投稿数を表示 (運営判断材料)

### Out of scope
- 投稿への返信機能
- 新規投稿時の運営への通知 (Email / Slack 等)
- 投稿の編集 / 削除 (一度送信したら確定)
- 添付ファイル
- 匿名投稿モード (投稿者 email は system_admin に常に見える)
- トピックの drag-and-drop 並び替え (sort_order 数値入力のみ、トピック数が 3〜5 個想定で十分)

### NFR (セキュリティ重要)
- **RLS**: `feedback_submissions` テーブルの SELECT は `role = 'system_admin'` のみ許可。teacher / school_admin は INSERT のみ可、SELECT は自分の投稿すら不可 (シンプル化)
- **マルチテナント隔離**: 教員は自テナント (= ログインしている tenant) の投稿のみ可。`tenant_id` は session から強制注入、クライアントから渡された値は信用しない
- **監査ログ**: 投稿時に `event: 'feedback.submitted'` を構造化ログに記録 (本文は含めない、PII 配慮)
- **本文長制限**: 最大 5000 文字 (Zod スキーマで validate)
- **XSS 対策**: textarea 入力はサーバ側で trim、表示時は React 標準 escape を信頼 (HTML レンダリングしない)
- **CSRF**: NextAuth セッション cookie (SameSite=Lax) で十分

### 裏テーマ踏み絵 (合格判定の根拠)
- 投稿は **同校教員 / school_admin から完全不可視** (RLS で物理的に保証) — これしないと「同僚に見られてるかも」と思った瞬間に投稿が嘘データ化、機能が壊れる
- トピック設計が **教員自己評価を要求しない** 構造 — 改善要望 / 機能要望 / 自由感想の 3 種すべて vitanota 側へのフィードバック
- 「運営にだけ届きます」の明示で心理的安全を担保
- 投稿者 email を chimo が見る件は許容 (運営として返信や追加ヒアリングが必要な場合があるため)。完全匿名は将来検討

### 影響を受ける既存ファイル
- `migrations/` (新規 migration を 1 本追加)
- `src/db/schema.ts` (新テーブル 2 個追加)
- 教員ダッシュボード (`src/features/dashboard/components/`) のいずれかに「フィードバックを送る」エントリポイント追加

### 新規作成ファイル
- `migrations/00XX_feedback_topics_and_submissions.sql`
- `pages/admin/feedback.tsx` (system_admin: 投稿一覧 + フィルタ)
- `pages/admin/feedback/topics.tsx` (system_admin: トピック CRUD)
- `pages/feedback/new.tsx` (or ダッシュボードモーダル)
- `pages/api/feedback/topics.ts` (`GET` 教員用、is_active=true のトピック一覧)
- `pages/api/feedback/submissions.ts` (`POST` 教員用)
- `pages/api/system/feedback.ts` (`GET` system_admin 用、全投稿)
- `pages/api/system/feedback/topics.ts` (`GET` 一覧 / `POST` 新規)
- `pages/api/system/feedback/topics/[id].ts` (`PATCH` 編集 / `DELETE` は投稿数 = 0 の時のみ 200、> 0 なら 409 Conflict)
- seed SQL or スクリプト (本番 DB へ初期 3 トピック投入)

---

## 機能 C: タスク複製ボタン

### 目的
説明会で「同じタスクを複数の教員に配賦できますか?」と質問された時に「複製でできます」と答えられるようにする。本実装 (M:N) は post-MVP に倒す。

### 受け入れ条件
- **AC-C-01**: タスク詳細 (TaskForm の編集モード) または TaskBoard カードに「複製」ボタンを追加
- **AC-C-02**: クリックで複製モーダル表示: title / description / category / due_date は元タスクのコピーで編集可、owner_user_id だけ空欄
- **AC-C-03**: owner_user_id を選択して保存すると新タスクが作成される
- **AC-C-04**: 元タスクのコメント・status は引き継がない (status は `todo` から開始、completed_at は null)
- **AC-C-05**: 複製後の `created_by` は複製操作者、`owner_user_id` は新規選択した人
- **AC-C-06**: 元タスクは残る (move ではなく copy)

### Out of scope
- 1 操作で複数 owner へ複製 (1 操作 = 1 複製)
- スキーマ変更 (M:N の `task_assignees` テーブルは post-MVP backlog 案件)
- 元タスクとの参照関係 (`copied_from_task_id` 等は持たない、独立タスクとして扱う)

### NFR
- 既存の task RLS / API 権限制御に従う (teacher は自テナント内の他教員へ複製可、school_admin も同様)
- 複製は元タスクと同じテナントに限定 (cross-tenant 防止は既存 RLS で物理保証)

### 影響を受ける既存ファイル
- `src/features/tasks/components/TaskBoard.tsx` (複製ボタン追加)
- `src/features/tasks/components/TaskForm.tsx` (複製モーダル追加 or 既存フォーム流用)

### 新規作成ファイル
- `pages/api/tasks/[id]/duplicate.ts` (`POST` のみ)

---

## 機能 D: DB バックアップ (確認のみ)

### 現状確認
- `infra/lib/data-core-stack.ts:55-176` の SnapshotManager Lambda が EventBridge cron (JST 03:00 daily) で実行中
- automated backup retention: **1 日** (PITR 5 分粒度で復旧可)
- manual snapshot retention: **7 日** (`vitanota-prod-manual-YYYYMMDD`)
- 実効復旧ウィンドウ: **過去 7 日 (1 日単位) + 過去 1 日 (5 分単位)**
- 説明会では「日次で 7 日分のバックアップを取得しています」と説明可能

### 対応
**実装変更なし** (chimo 確認済、現状維持で OK)。

---

## 全体 裏テーマ踏み絵チェック

| 機能 | 「観測されてる感」リスク | 判定 |
|---|---|---|
| A 招待管理 | system_admin 専用画面、教員間プレッシャー化なし | ✅ 合格 |
| B フィードバック | 教員 → 運営の一方向 + 同校間不可視 (RLS) + 自己評価系トピックなし | ✅ 合格 |
| C タスク複製 | 単純複製で進捗管理系・評価系には触れない | ✅ 合格 |

## デプロイ・公開タイミング

| Day | 予定作業 |
|---|---|
| 5/2 (今日) | 要件分析 → プランニング → 設計 → 機能 C 着手 |
| 5/3 | 機能 A 実装 |
| 5/4 | 機能 B 実装 (前半: schema + 教員 UI + 投稿 API) |
| 5/5 | 機能 B 実装 (後半: トピック CRUD UI + system_admin 閲覧 view) |
| 5/6 (予備日) | 統合テスト + 本番デプロイ + リハーサル + 招待発行リハ |
| 5/7 (当日) | 本番稼働済の状態で説明会 |

### 本番デプロイ手順 (機能 B のみ migration あり)
1. `cdk deploy vitanota-prod-app` (アプリコード更新)
2. `aws lambda invoke --function-name vitanota-prod-db-migrator --payload '{"command":"migrate"}'` (新 migration 適用)
3. seed: トピック 3 件を本番 DB に手動 SQL で投入

## post-MVP backlog 連携
- **タスク複数アサイン本実装 (M:N)** — 5/7 説明会後の教員フィードバックで「複製運用が辛い」「同じタスクを共同で管理したい」が確認できたら優先度上げ。詳細は `aidlc-docs/operations/post-mvp-backlog.md` の「機能拡張候補」セクション

## 参照
- [`inception/requirements/requirements.md`](requirements.md) — vitanota 全体要件 v2.0
- [`operations/post-mvp-backlog.md`](../../operations/post-mvp-backlog.md) — 既存バックログ
- [`audit.md`](../../audit.md) — 本セッションの完全な生記録 (2026-05-02 セクション)
- [`aidlc-state.md`](../../aidlc-state.md) — 本セッションの進捗チェックリスト
