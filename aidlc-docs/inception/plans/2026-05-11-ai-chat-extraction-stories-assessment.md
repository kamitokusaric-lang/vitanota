# User Stories Assessment — 2026-05-11 AI 連携第一弾

## Request Analysis
- **Original Request**: vitanota AI 連携第一弾 (チャット → タスク + 日誌ネタ抽出) のユーザーストーリー化
- **User Impact**: Direct (教員が直接使う新機能、タスク/日誌入力フローが追加される)
- **Complexity Level**: Medium (戦略レベル決定済みだが、利用シーン多様 / mood UI / 確認 UI の振る舞いに細部)
- **Stakeholders**: 教員 (PERSONA-T-01 田中 さくら 拡張シーン)、運営 chimo (PERSONA-S-01)

## Assessment Criteria Met
- [x] High Priority:
  - 新規ユーザー向け機能 (チャット入力経由のタスク/日誌作成)
  - ユーザーワークフロー変更 (既存フォーム経由から追加経路)
  - 複雑な業務要件 (mood UI / セッション境界 / インラインバブル確認)
  - 新製品機能 (vitanota AI 連携第一弾)
  - 顧客向け機能 (現場教員 25 名 + 校長導入意思表明先向け)
- Expected Benefits:
  - 受け入れ基準の Oracle 確立 (機能設計 → コード生成 → E2E テストまで一気通貫)
  - 教員シーン (朝・隙間・帰宅後) を Given 句で明示、現場フィット度を高める
  - 既存 stories.md との関係性整理 (EPIC-T-07 として独立)

## Decision
**Execute User Stories**: **Yes**

**Reasoning**: 新規ユーザー機能、ワークフロー変更、複雑要件、新製品機能 — High Priority の 4 つすべてに該当。CLAUDE.md user-stories.md の「Default Decision Rule」(疑わしきは include) にも一致。5/2 セッション「ユーザーストーリースキップ」(機能 A=chimo 自身 / B/C=要件で十分明示可能) とは状況が異なる: 本機能は教員向け新規 UX、シーン多様、複雑な確認フロー含む。

## Expected Outcomes
- 教員視点でのストーリー化 (要件文書 F-CE-XX の AC を「教員が何をどう体験するか」に翻訳)
- 機能設計 / E2E テスト の Oracle 確立
- 受け入れ基準への現場シーン埋め込み (Given 句にモバイル / 朝 / 隙間 / 帰宅後)
- 既存 EPIC-T-05 (Won't) との関係整理 (本エピック T-07 は追加経路、置き換えではない)
- 既存 EPIC-T-06 (Won't / Anthropic 接続凍結) との分離整理

## Plan の方針 (chimo と合意済み 2026-05-11)
- **stories 関係**: EPIC-T-07 として新規エピック、新規ファイル `2026-05-11-ai-chat-extraction-stories.md` 別途作成 (既存 stories.md は触らない)
- **粒度・件数**: 5-6 件、主要シーン中心
- **MoSCoW**: Must + Should 混在 (コア機能 Must / 付随 UI Should)
- **ブレイクダウン**: 機能ベース (Feature-Based)、シーンは Given 句に埋め込み (ハイブリッド寄り)

## 参照
- `aidlc-docs/inception/requirements/2026-05-11-ai-chat-extraction.md` — 要件文書 (F-CE-01〜04 と AC-CE-01〜20)
- `aidlc-docs/inception/user-stories/stories.md` — 既存ストーリー (24 件、EPIC-T-01〜06)
- `aidlc-docs/inception/user-stories/personas.md` — 既存ペルソナ (T-01 / A-01 / S-01)
- `aidlc-docs/inception/plans/user-stories-assessment.md` — 旧アセスメント (5/2 セッション、当時はスキップ判定)
