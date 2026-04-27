# vitanota ドキュメントインデックス

全ドキュメントをトピック別に横断的に索引する。**物理的にはフェーズ別 (inception/construction/operations) に格納**されているが、検索性のため本ファイルで整理する。

**重要**: 新規ドキュメントを作成・削除する場合は本ファイルを必ず同時更新すること。更新を怠ると散在状態に戻る。

## 凡例

- **[CURRENT]** — 最新・正本。参照してよい
- **[LEGACY]** — 旧設計。注記付きで残存。実装と乖離している可能性があるため単独では信用しない
- **[HISTORY]** — 過去のスナップショット/セッション記録。当時の状況理解用
- **[PROCESS]** — AIDLC ワークフロー進行管理用。仕様ではない

---

## 🔐 Auth / OAuth

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`construction/user-onboarding-flow.md`](construction/user-onboarding-flow.md) | **正本**: 招待フロー仕様（Step 0〜5）・役割権限・セキュリティ制御 |
| [LEGACY] | [`construction/auth-externalization.md`](construction/auth-externalization.md) | 旧認証外部化設計。Lambda Proxy 前の「ブラウザから Google /token 直接」前提。冒頭注記で誘導中 |
| [HISTORY] | [`operations/session-handoff-20260420.md`](operations/session-handoff-20260420.md) | Lambda Proxy 実装時のスナップショット |
| [CURRENT] | [`construction/security/role-definitions.md`](construction/security/role-definitions.md) | 4 ロール (system_admin / school_admin / teacher / bootstrap) の定義 |
| [CURRENT] | [`construction/auth-error-catalog.md`](construction/auth-error-catalog.md) | **正本**: 認証エラーコード 25 種の仕様書 (発生源・領域・実発生原因・ユーザー表示メッセージ) |

## 🗄️ DB / スキーマ / RLS

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`construction/er-diagram.md`](construction/er-diagram.md) | **正本**: 全テーブル関係図 |
| [CURRENT] | [`construction/unit-02/code/database-schema.md`](construction/unit-02/code/database-schema.md) | スキーマ詳細 (列定義レベル) |
| [CURRENT] | `migrations/*.sql` | 実装。特に `0009_rls_role_separation.sql` が RLS ポリシーの正本 |

## 👤 ユーザーライフサイクル

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`construction/user-lifecycle-spec.md`](construction/user-lifecycle-spec.md) | 退会・転勤・匿名化の仕様 (論点 M) |
| [CURRENT] | [`construction/user-onboarding-flow.md`](construction/user-onboarding-flow.md) | 招待・承諾の仕様（再掲） |
| [CURRENT] | [`construction/unit-02/nfr-design/operational-risks.md`](construction/unit-02/nfr-design/operational-risks.md) | R13-R15: 退会 API 未実装等 |

## 📋 要件 / ユーザーストーリー

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`inception/requirements/requirements.md`](inception/requirements/requirements.md) | **正本**: FR-01〜09・NFR-01〜06・MVP 定義 |
| [CURRENT] | [`inception/requirements/requirement-verification-questions.md`](inception/requirements/requirement-verification-questions.md) | 要件確認 Q&A (Q1〜14) |
| [CURRENT] | [`inception/requirements/cost-estimate.md`](inception/requirements/cost-estimate.md) | 開発費・月次コスト試算 |
| [CURRENT] | [`inception/requirements/security-review.md`](inception/requirements/security-review.md) | セキュリティ要件レビュー |
| [CURRENT] | [`inception/user-stories/personas.md`](inception/user-stories/personas.md) | 3 ペルソナ (教員 / 校長 / システム管理者) |
| [CURRENT] | [`inception/user-stories/stories.md`](inception/user-stories/stories.md) | 24 ストーリー + MoSCoW |

## 🏛️ アプリケーション設計（俯瞰）

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`inception/application-design/application-design.md`](inception/application-design/application-design.md) | **正本**: 統合設計ドキュメント |
| [CURRENT] | [`inception/application-design/components.md`](inception/application-design/components.md) | 26 コンポーネント定義 |
| [CURRENT] | [`inception/application-design/services.md`](inception/application-design/services.md) | 8 サービスの責務 |
| [CURRENT] | [`inception/application-design/component-methods.md`](inception/application-design/component-methods.md) | メソッドシグネチャ・API Route |
| [CURRENT] | [`inception/application-design/component-dependency.md`](inception/application-design/component-dependency.md) | 依存関係マトリクス・ディレクトリ構造 |
| [CURRENT] | [`inception/application-design/unit-of-work.md`](inception/application-design/unit-of-work.md) | Unit 分割の仕方 |
| [CURRENT] | [`inception/application-design/unit-of-work-dependency.md`](inception/application-design/unit-of-work-dependency.md) | Unit 間依存 |
| [CURRENT] | [`inception/application-design/unit-of-work-story-map.md`](inception/application-design/unit-of-work-story-map.md) | Unit ↔ Story マッピング |
| [CURRENT] | [`construction/sequence-diagrams.md`](construction/sequence-diagrams.md) | 主要シーケンス図 |

## 🧩 Unit 別設計（実装詳細）

各 Unit は以下 5 種のサブドキュメントを持つ:
- `functional-design/business-rules.md` — ビジネスルール
- `functional-design/business-logic-model.md` — ロジックモデル
- `functional-design/domain-entities.md` — ドメインエンティティ
- `functional-design/frontend-components.md` — フロントエンド構成
- `infrastructure-design/infrastructure-design.md` — インフラ設計
- `infrastructure-design/deployment-architecture.md` — デプロイアーキテクチャ
- `nfr-requirements/nfr-requirements.md` — NFR 要件
- `nfr-requirements/tech-stack-decisions.md` — 技術選定
- `nfr-design/nfr-design-patterns.md` — NFR 実装パターン
- `nfr-design/logical-components.md` — 論理コンポーネント分解
- `code/code-summary.md` — 実装サマリー

| Unit | スコープ | ディレクトリ |
|---|---|---|
| Unit-01 | 認証・テナント基盤 | [`construction/unit-01/`](construction/unit-01/) |
| Unit-02 | 日誌・感情記録コア (sessions 含む) | [`construction/unit-02/`](construction/unit-02/) |
| Unit-03 | 教員ダッシュボード・タグ | [`construction/unit-03/`](construction/unit-03/) |
| Unit-04 | 管理者ダッシュボード・アラート | [`construction/unit-04/`](construction/unit-04/) |

**Unit-02 に関しては特筆すべきファイル**:
- [`unit-02/code/api-contracts.md`](construction/unit-02/code/api-contracts.md) — API 契約
- [`unit-02/code/database-schema.md`](construction/unit-02/code/database-schema.md) — 詳細スキーマ
- [`unit-02/nfr-design/operational-risks.md`](construction/unit-02/nfr-design/operational-risks.md) — 運用リスク台帳 (R1〜R15)
- [`unit-02/nfr-design/integration-test-plan.md`](construction/unit-02/nfr-design/integration-test-plan.md) — 統合テスト計画

## 🌐 インフラ / デプロイ

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`construction/shared-infrastructure.md`](construction/shared-infrastructure.md) | 共有インフラ設計 (VPC / RDS / AppRunner / CloudFront) |
| [CURRENT] | [`construction/deployment-phases.md`](construction/deployment-phases.md) | Phase 1 As-Built + Phase 2 移行計画 |
| [CURRENT] | [`construction/local-development.md`](construction/local-development.md) | ローカル開発環境 (docker-compose) |
| [LEGACY] | [`construction/migration-apprunner-to-ecs-express.md`](construction/migration-apprunner-to-ecs-express.md) | ECS 移行計画。Lambda Proxy 導入で緊急性減・塩漬け中 |
| [CURRENT] | [`operations/infrastructure-audit-20260419.md`](operations/infrastructure-audit-20260419.md) | インフラ監査結果 (Phase A/B/C クリーンアップ) |

## 🧪 テスト / ビルド

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`construction/build-and-test/build-instructions.md`](construction/build-and-test/build-instructions.md) | ビルド手順 |
| [CURRENT] | [`construction/build-and-test/unit-test-instructions.md`](construction/build-and-test/unit-test-instructions.md) | ユニットテスト |
| [CURRENT] | [`construction/build-and-test/integration-test-instructions.md`](construction/build-and-test/integration-test-instructions.md) | 統合テスト |
| [CURRENT] | [`construction/build-and-test/build-and-test-summary.md`](construction/build-and-test/build-and-test-summary.md) | 全体サマリー |
| [CURRENT] | `unit-XX/nfr-design/integration-test-plan.md` | Unit 別テスト計画 |

## 🤖 AI 機能

| 状態 | ファイル | 役割 |
|---|---|---|
| [LEGACY] | [`construction/weekly-summary-design.md`](construction/weekly-summary-design.md) | 週次レポート機能設計。**2026-04-27 に Anthropic 接続を全面撤回・凍結**。実装コード・CFN リソース・Secret は削除済み。DB スキーマのみ残置。AI 再開時の参照用 |

## 🛠️ 運用 / ロールアウト

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`operations/post-mvp-backlog.md`](operations/post-mvp-backlog.md) | **正本**: MVP 後の継続タスク一元管理 |
| [CURRENT] | [`operations/claude-code-review-rollout.md`](operations/claude-code-review-rollout.md) | Claude Code Review 段階導入計画 |
| [CURRENT] | [`operations/infrastructure-audit-20260419.md`](operations/infrastructure-audit-20260419.md) | インフラ監査（再掲） |
| [HISTORY] | [`operations/session-handoff-20260420.md`](operations/session-handoff-20260420.md) | Auth 実装時の引き継ぎスナップショット |

## 🔒 セキュリティ

| 状態 | ファイル | 役割 |
|---|---|---|
| [CURRENT] | [`construction/security/role-definitions.md`](construction/security/role-definitions.md) | ロール定義 |
| [CURRENT] | [`inception/requirements/security-review.md`](inception/requirements/security-review.md) | セキュリティ要件レビュー |

---

## AIDLC プロセス・ワークフロー管理

AIDLC ワークフローの進行に伴う内部成果物。**仕様参照には使わない**。

| 状態 | ファイル | 役割 |
|---|---|---|
| [PROCESS] | [`aidlc-state.md`](aidlc-state.md) | 現在のステージ・進捗チェックリスト |
| [PROCESS] | [`audit.md`](audit.md) | 全ユーザー入力・AI 応答・決定の時系列ログ |
| [PROCESS] | [`inception/plans/`](inception/plans/) | インセプション各ステージのプラン (execution-plan.md 等) |
| [PROCESS] | [`construction/plans/`](construction/plans/) | Unit 別の functional/nfr/infra/code 生成プラン (20 ファイル) |
| [PROCESS] | `construction/unit-XX-*-questions.md` | 質問・回答の記録 |

---

## 履歴 / 一時ファイル

| 状態 | ファイル | 役割 |
|---|---|---|
| [HISTORY] | [`operations/session-handoff-20260420.md`](operations/session-handoff-20260420.md) | Auth 修正セッションのスナップショット |

---

## 🔎 クイックリファレンス ("〜の仕様どこ？")

| 質問 | 見るファイル |
|---|---|
| 認証・ログインの全体フロー | [`construction/user-onboarding-flow.md`](construction/user-onboarding-flow.md) |
| Google OAuth の Lambda Proxy 経由の理由 | [`operations/session-handoff-20260420.md`](operations/session-handoff-20260420.md) |
| 何を作るか (要件) | [`inception/requirements/requirements.md`](inception/requirements/requirements.md) |
| 誰のために作るか (ペルソナ) | [`inception/user-stories/personas.md`](inception/user-stories/personas.md) |
| どう作るか (アーキテクチャ) | [`inception/application-design/application-design.md`](inception/application-design/application-design.md) |
| テーブル構造 | [`construction/er-diagram.md`](construction/er-diagram.md) |
| RLS ポリシー | `migrations/0009_rls_role_separation.sql` |
| 退会・転勤 | [`construction/user-lifecycle-spec.md`](construction/user-lifecycle-spec.md) |
| デプロイ手順 / Phase 2 計画 | [`construction/deployment-phases.md`](construction/deployment-phases.md) |
| ローカル起動 | [`construction/local-development.md`](construction/local-development.md) |
| 運用リスク一覧 (R1〜R15) | [`construction/unit-02/nfr-design/operational-risks.md`](construction/unit-02/nfr-design/operational-risks.md) |
| 本番稼働後の TODO | [`operations/post-mvp-backlog.md`](operations/post-mvp-backlog.md) |
| 費用感 | [`inception/requirements/cost-estimate.md`](inception/requirements/cost-estimate.md) |
| 次にやること / 進捗 | [`aidlc-state.md`](aidlc-state.md) |
| なぜその決定をしたか | [`audit.md`](audit.md) |
| 週次レポート (AI) の仕様 [LEGACY 凍結 2026-04-27] | [`construction/weekly-summary-design.md`](construction/weekly-summary-design.md) |

---

## 参考: フェーズ別ディレクトリ構造

物理配置は AIDLC の工程別:

```
aidlc-docs/
├── aidlc-state.md                  # ワークフロー進行状況
├── audit.md                         # 全セッションログ
├── docs-index.md                    # 本ファイル
│
├── inception/                       # 🔵 企画・要件フェーズ
│   ├── requirements/
│   ├── user-stories/
│   ├── application-design/
│   └── plans/
│
├── construction/                    # 🟢 実装設計フェーズ
│   ├── unit-01/ ... unit-04/        # Unit 別詳細設計
│   ├── build-and-test/
│   ├── security/
│   ├── plans/
│   ├── auth-externalization.md      # (LEGACY)
│   ├── user-onboarding-flow.md
│   ├── user-lifecycle-spec.md
│   ├── er-diagram.md
│   ├── sequence-diagrams.md
│   ├── deployment-phases.md
│   ├── shared-infrastructure.md
│   ├── local-development.md
│   └── migration-apprunner-to-ecs-express.md  # (LEGACY 塩漬け)
│
└── operations/                      # 🟡 運用フェーズ
    ├── post-mvp-backlog.md          # 継続タスク
    ├── infrastructure-audit-20260419.md
    ├── session-handoff-20260420.md
    └── claude-code-review-rollout.md
```
