# aidlc-docs/_archive — AIDLC 時代の足跡 (凍結)

ここは AIDLC ワークフローで生成された成果物の凍結置き場。**参照のみ・更新しない。**

- **現行仕様の入口**: [`../../docs/README.md`](../../docs/README.md)
- **世界観・設計憲法**: [`../../docs/PHILOSOPHY.md`](../../docs/PHILOSOPHY.md)
- **凍結日**: 2026-06-05 (仕様書を機能別 `docs/` へ再編した際に凍結)

## なぜ凍結したか

仕様が AIDLC フェーズ別 (inception / construction / operations) に散らばり、1 機能を把握するのに複数ツリーをハシゴ登りする必要があった。現行仕様は `src/features/` の境界に揃えた `docs/` へ移植済み。ここに残るのはプロセスの記録 (決定の経緯・進捗ログ) と、移植元の原本。

## 中身

- `inception/` — 要件・ユーザーストーリー・アプリケーション設計・各種プラン
- `construction/` — unit-01〜06 の詳細設計、build-and-test、LEGACY 3本、移植元原本 (user-onboarding-flow / auth-error-catalog 等)
- `operations/` — infrastructure-audit / claude-code-review-rollout / history / rollback
- `audit.md` — 全セッションの時系列ログ
- `aidlc-state.md` — AIDLC 進捗チェックリスト
- `docs-index.md` — 旧トピック別インデックス (後継は `../../docs/README.md`)

## LEGACY 3本の凍結理由

- `construction/auth-externalization.md` — Lambda Proxy 導入前の「ブラウザから Google /token 直接」前提。現行は Lambda Proxy ([`../../docs/features/auth/api.md`](../../docs/features/auth/api.md))
- `construction/migration-apprunner-to-ecs-express.md` — ECS 移行案。Lambda Proxy 導入で緊急性減・塩漬け
- `construction/weekly-summary-design.md` — AI 週次レポート。2026-04-27 に Anthropic 接続を全面撤回・凍結 (思想的背景は [PHILOSOPHY §7](../../docs/PHILOSOPHY.md))
