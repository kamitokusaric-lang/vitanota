# vitanota ドキュメントインデックス

フェーズ・ステージごとに生成された全ドキュメントの一覧。新しいファイルが追加されるたびに本ファイルを更新する。

---

## ワークフロー管理

| ファイル | 内容 |
|---|---|
| [`aidlc-state.md`](aidlc-state.md) | 現在のステージ・拡張機能設定・全ステージの進捗チェックリスト |
| [`audit.md`](audit.md) | 全ユーザー入力・AI応答・意思決定の時系列ログ |
| [`docs-index.md`](docs-index.md) | 本ファイル。全ドキュメントの索引 |

---

## 🔵 インセプションフェーズ

### 要件（requirements/）

| ファイル | 内容 |
|---|---|
| [`inception/requirements/requirements.md`](inception/requirements/requirements.md) | **メイン要件定義書**。FR-01〜09・NFR-01〜06・技術スタック・MVP定義・スコープ外 |
| [`inception/requirements/requirement-verification-questions.md`](inception/requirements/requirement-verification-questions.md) | 要件確認のための質問と回答（Q1〜14） |
| [`inception/requirements/cost-estimate.md`](inception/requirements/cost-estimate.md) | 開発費用・月次運用コストの試算（開発者1名・1校・教員20名想定） |

### ユーザーストーリー（user-stories/）

| ファイル | 内容 |
|---|---|
| [`inception/user-stories/personas.md`](inception/user-stories/personas.md) | 3ペルソナの定義（教員・校長・システム管理者） |
| [`inception/user-stories/stories.md`](inception/user-stories/stories.md) | 24ストーリー。3ペルソナ × エピック構成。MoSCoW優先度付き |

### アプリケーション設計（application-design/）

| ファイル | 内容 |
|---|---|
| [`inception/application-design/application-design.md`](inception/application-design/application-design.md) | **統合設計ドキュメント**。設計決定サマリー・アーキテクチャ概観・テナント隔離設計・API一覧・データモデル概要 |
| [`inception/application-design/components.md`](inception/application-design/components.md) | 26コンポーネントの定義（機能別・種別・責務） |
| [`inception/application-design/component-methods.md`](inception/application-design/component-methods.md) | 全サービスのメソッドシグネチャ・入出力型・API Route 定義 |
| [`inception/application-design/services.md`](inception/application-design/services.md) | 8サービスの責務・主要操作・セキュリティ方針 |
| [`inception/application-design/component-dependency.md`](inception/application-design/component-dependency.md) | 依存関係マトリクス・データフロー図・ディレクトリ構造 |

### プラン（plans/）

| ファイル | 内容 |
|---|---|
| [`inception/plans/execution-plan.md`](inception/plans/execution-plan.md) | **実行プラン**。ワークフロー可視化・全ステージの実行/スキップ判断と理由 |
| [`inception/plans/application-design-plan.md`](inception/plans/application-design-plan.md) | アプリケーション設計フェーズのプラン・質問（Q1〜8）と回答・判断理由 |
| [`inception/plans/story-generation-plan.md`](inception/plans/story-generation-plan.md) | ユーザーストーリー生成フェーズのプラン・質問（Q1〜8）と回答 |
| [`inception/plans/user-stories-assessment.md`](inception/plans/user-stories-assessment.md) | ユーザーストーリー実施判断の記録 |

---

## 🟢 コンストラクションフェーズ（未開始）

> ユニット生成ステージ完了後に追加予定

| 予定ディレクトリ | 内容（予定） |
|---|---|
| `construction/plans/` | ユニット生成プラン |
| `construction/unit-01-auth/` | Unit-01（認証・テナント基盤）の設計・コード |
| `construction/unit-02-journal/` | Unit-02（日誌・感情記録コア）の設計・コード |
| `construction/unit-03-teacher-dashboard/` | Unit-03（教員ダッシュボード）の設計・コード |
| `construction/unit-04-admin-dashboard/` | Unit-04（管理者ダッシュボード・アラート）の設計・コード |
| `construction/build-and-test/` | ビルド・テスト手順書 |

---

## クイックリファレンス

**「何を作るか」を確認したい** → [`requirements.md`](inception/requirements/requirements.md)

**「誰のために作るか」を確認したい** → [`personas.md`](inception/user-stories/personas.md) / [`stories.md`](inception/user-stories/stories.md)

**「どう作るか」を確認したい** → [`application-design.md`](inception/application-design/application-design.md)

**「どんな構成か」を確認したい** → [`component-dependency.md`](inception/application-design/component-dependency.md)

**「コンポーネント一覧」を確認したい** → [`components.md`](inception/application-design/components.md)

**「APIやメソッド」を確認したい** → [`component-methods.md`](inception/application-design/component-methods.md)

**「次に何をするか」を確認したい** → [`aidlc-state.md`](aidlc-state.md)

**「なぜその決定をしたか」を確認したい** → [`audit.md`](audit.md)

**「費用感」を確認したい** → [`cost-estimate.md`](inception/requirements/cost-estimate.md)
