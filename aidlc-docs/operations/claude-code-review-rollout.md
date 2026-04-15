# Claude Code Review 段階導入手順書

**作成日**: 2026-04-15
**目的**: GitHub Actions に Claude Code Review を段階導入する手順を記録
**関連**: 論点 L（サプライチェーン対策）と並行して運用フェーズで導入

## 前提

- Anthropic 公式 `anthropics/claude-code-action` を使用
- 本プロジェクトのセキュリティ観点（SP-U02-04 8層防御・R1 ピンニング対策・論点 A-H 等）を PR レビューで自動検証する
- 段階導入により誤検知・コスト暴走を回避

---

## 前提作業（1回のみ）

### A. Anthropic API キー取得
1. https://console.anthropic.com/ にログイン
2. Settings → API Keys → **Create Key**
3. キー名: `vitanota-github-actions`
4. Workspace を選択 or 新規作成
5. 生成された `sk-ant-...` をコピー（**この画面を閉じると再表示不可**）

### B. コスト制御の設定
1. Console → Settings → **Usage limits**
2. **Monthly spend limit**: `$30/month` から開始、運用後に調整
3. **Spend alerts**: 50%・80%・100% で通知
4. Slack/Email 通知先を設定

### C. GitHub Secret 登録
1. GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `ANTHROPIC_API_KEY`
4. Secret: コピーしたキー
5. **Add secret**

---

## Phase 1: 最小構成でレビュー開始（Week 1-2）

### Step 1: 最小ワークフロー作成

`.github/workflows/claude-review.yml`:

```yaml
name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize]
    paths:
      - 'src/**'
      - 'pages/**'
      - 'migrations/**'
      - '__tests__/**'
      - 'package.json'
      - 'pnpm-lock.yaml'

concurrency:
  group: claude-review-${{ github.ref }}
  cancel-in-progress: true

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: review
          direct_prompt: |
            vitanota プロジェクトの PR を簡潔にレビューしてください。
            以下の重大リスクのみ指摘し、それ以外はスキップしてください:
            - Zod バリデーションの欠如
            - withTenantUser の使用忘れ（DB アクセス時）
            - SET LOCAL のトランザクション外使用
            - is_public=false データが /api/public/* に流れる設計
            - 明らかなセキュリティ脆弱性
            軽微な指摘・スタイル改善は書かないでください。
```

### Step 2: ブランチ保護設定（推奨）
- **Settings** → **Branches** → `main` ルール編集
- **Required approvals**: 1 のまま維持
- **claude-review は最初は required check にしない**（誤検知で PR が詰まることを回避）

### Step 3: 動作確認 PR
1. feature ブランチ作成
2. 意図的に穴のある変更（Zod 欠如 API Route 等）
3. PR 作成
4. Actions タブで `claude-review` が走ることを確認
5. Claude のコメントが PR に付くことを確認

### Step 4: 1週間の評価
- **Anthropic Console Usage** で日次トークン消費を確認
- 指摘の有用性を「誤検知/見落とし/妥当」で集計
- 実行時間が 2〜5分の想定範囲内か確認

---

## Phase 2: 観点を本プロジェクト固有に拡張（Week 3-4）

### Step 5: direct_prompt 拡張

Phase 1 が安定したら `.github/workflows/claude-review.yml` を編集:

```yaml
          direct_prompt: |
            vitanota（教員向け BtoB SaaS・Next.js + Drizzle + PostgreSQL）の PR レビュー。

            **Must-check（blocker 指摘）**:
            1. SP-U02-04 8層防御の遵守
               - /api/public/* に PrivateJournalRepository の結果が流入していないか
               - publicTimelineRepository 以外で public_journal_entries 以外を SELECT していないか
               - journal_entry_tags の複合 FK が tenant_id なしで使われていないか
            2. withTenantUser の境界
               - DB アクセスが全て withTenantUser 内で行われているか
               - SET LOCAL がトランザクション外で呼ばれていないか（R1 ピンニング対策）
            3. Zod バリデーション
               - pages/api/*.ts で req.body を直接使っていないか
               - スキーマは lib/schemas/ から import しているか
            4. 認証・認可
               - requireAuth の呼び忘れはないか
               - school_admin 権限チェックの欠如
            5. RLS ポリシー変更の整合性
               - PERMISSIVE/RESTRICTIVE の誤設定
               - fail-safe（current_setting missing_ok）の維持

            **Should-check（suggestion）**:
            - pino redact 対象の機密情報がログ出力に含まれる
            - Cache-Control の public/private 混同
            - SWR mutate の忘れ
            - 型ブランド（PublicJournalEntry）の誤用

            **Skip**:
            - 命名規則・インデント・コメントスタイル
            - README・md ファイルの指摘

            aidlc-docs/inception/requirements/security-review.md と
            aidlc-docs/construction/unit-02/nfr-design/nfr-design-patterns.md を参照。
          max_turns: 10
```

### Step 6: セキュリティ特化ジョブ分離（任意）

DB/インフラ変更時の厳格チェック:

```yaml
  security-review:
    runs-on: ubuntu-latest
    if: |
      contains(github.event.pull_request.changed_files, 'migrations/') ||
      contains(github.event.pull_request.changed_files, 'src/db/schema.ts')
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: review
          direct_prompt: |
            DB スキーマ・マイグレーション・RLS の変更です。以下を厳格に確認:
            - SP-U02-04 Layer 4-5-8 の維持（VIEW・RLS・複合 FK）
            - 後方互換性（R7 ローリングデプロイ競合防止）
            - NOT NULL / FK / UNIQUE 制約の妥当性
            - security_barrier の維持
            - マイグレーションの逆方向適用可能性
```

### Step 7: 2週間評価
- 有用性スコア（👍/👎）を付与
- 誤検知の多いルールを除外
- 見落としの多い観点を追加
- コストが想定内か確認

---

## Phase 3: 対話モード追加（Week 5+）

### Step 8: 対話ジョブ追加

`.github/workflows/claude-mention.yml`:

```yaml
name: Claude PR Assistant

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude'))
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          mode: tag
```

### Step 9: チーム共有（README or CONTRIBUTING.md）

```markdown
## Claude に質問する
PR のコメントで `@claude` を付けて質問すると、Claude がコードを調査して返答します。

例:
- `@claude このエンドポイントの RLS 挙動を説明して`
- `@claude SP-U02-04 Layer 8 を満たしているか確認して`
- `@claude このテストが不足しているケースを指摘して`
```

---

## リスクと対策

| リスク | 対策 |
|---|---|
| コスト暴走 | Anthropic Console Usage limits（月額上限） |
| 誤検知で PR 停滞 | Phase 1 では required check にしない |
| シークレット漏洩 | 公式 action は環境変数経由・ワークフロー権限最小化 |
| PR 作成者の混乱 | README にレビュー内容の種別（blocker/suggestion）を明示 |
| レート制限 | `concurrency` で同一 PR の過剰実行抑制 |

---

## コスト目安

- 中規模 PR（差分 500 行）: $0.10〜$0.50 / 回
- 大規模 PR: $1〜$2 / 回
- 月 50 PR × $0.30 = **月 $15 程度**（Phase 2 規模）

---

## 運用スケジュール

| 週 | アクション |
|---|---|
| Week 1 | 前提作業 A-C + Phase 1 ワークフロー設定 |
| Week 1-2 | Phase 1 運用・評価 |
| Week 3 | Phase 2 プロンプト拡張 |
| Week 3-4 | Phase 2 運用・評価 |
| Week 5+ | Phase 3 対話モード追加 |

---

## 参照

- 公式: https://github.com/anthropics/claude-code-action
- 関連論点: `aidlc-docs/inception/requirements/security-review.md` 論点 L（サプライチェーン対策）
- 運用レビュー: Phase 1 完了時・Phase 2 完了時・毎月末のコスト/有用性レビュー
