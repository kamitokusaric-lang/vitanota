# Story Generation Plan — 2026-05-11 AI 連携第一弾

> **作成日**: 2026-05-11
> **目的**: AI チャット抽出機能 (EPIC-T-07) のユーザーストーリー生成プラン
> **承認**: 本プランの方針は AskUserQuestion で chimo と合意済み (2026-05-11)
> **アダプティブ短縮**: 戦略レベル決定済みのためプラン承認とストーリー生成承認を 1 回にまとめる (5/2 セッション踏襲)

## 1. 戦略・方針 (chimo 合意済み)

- **EPIC**: EPIC-T-07 「AI チャット抽出」(新規エピック)
- **対象ペルソナ**: PERSONA-T-01 田中 さくら (拡張シーン込み)
- **ストーリー数**: 5-6 件
- **MoSCoW**: Must + Should 混在 (コア機能 Must / 付随 UI Should / 信頼性 Could)
- **ブレイクダウン**: 機能ベース (Feature-Based)、シーンは Given 句に埋め込み

## 2. 生成ステップ

- [x] Step 1: 対象ペルソナ拡張シーン記述 (新規 stories ファイル冒頭、既存 personas.md には追記しない)
- [x] Step 2: EPIC-T-07 「AI チャット抽出」エピック概要記述 (既存 EPIC-T-05/06 との関係も明示)
- [x] Step 3: 6 ストーリー生成 (Given/When/Then、INVEST 準拠、AC-CE-XX とトレース付き)
- [x] Step 4: 裏テーマ踏み絵チェックセクション (本ストーリー群の合格判定)
- [x] Step 5: 既存ストーリーへの注記 (EPIC-T-05 / T-06 / US-T-010〜014 / US-T-020 への影響)
- [x] Step 6: 参照リンク追加 (要件文書 / 既存 stories / 既存 personas)

## 3. 生成するストーリー一覧

| ID | タイトル | MoSCoW | 関連 AC |
|---|---|---|---|
| US-T-070 | チャットでサッと書き散らす (起動 UX) | 🔴 Must | AC-CE-01〜06、NFR-CE-02 |
| US-T-071 | AI に書いた言葉をタスクとして拾ってもらう | 🔴 Must | AC-CE-07〜10, 12〜14, 18、NFR-CE-01 |
| US-T-072 | AI に書いた言葉を日誌ネタとして拾ってもらう | 🔴 Must | AC-CE-07〜09, 11〜14, 19、NFR-CE-01 |
| US-T-073 | チャットを閉じても安心 (未承認候補の防護) | 🟡 Should | AC-CE-16, 17, 20、NFR-CE-09 |
| US-T-074 | 日誌候補に気分絵文字を選ぶ (mood UI、教員選択死守) | 🟡 Should | AC-CE-11, 15 |
| US-T-075 | Bedrock 障害時もタスク管理は使える (信頼性) | 🟢 Could | NFR-CE-11, 12, 13 |

## 4. 必須アーティファクト (チェックリスト)
- [x] stories ファイル作成: `aidlc-docs/inception/user-stories/2026-05-11-ai-chat-extraction-stories.md`
- [x] INVEST 準拠 (Independent / Negotiable / Valuable / Estimable / Small / Testable) — 各ストーリーに記載
- [x] 各ストーリーに Given/When/Then の AC
- [x] PERSONA-T-01 とのマッピング明示
- [x] 裏テーマ踏み絵チェック (mood AI 不可侵 / 観測者原則 / メンタルケア SaaS 化なし / Knowledge Tool 寄せなし)

## 5. アプローチ判断材料 (chimo に確認した 4 論点と回答)

1. **既存 stories.md との関係**: EPIC-T-07 として新規エピック、新規ファイル別途 (推し採用)
2. **ストーリー粒度・件数**: 5-6 件、主要シーン中心 (推し採用)
3. **MoSCoW 付け方**: Must + Should 混在 (推し採用)
4. **ブレイクダウン軸**: 機能ベース (推し採用)

## 6. 参照
- 要件: `aidlc-docs/inception/requirements/2026-05-11-ai-chat-extraction.md`
- Assessment: `aidlc-docs/inception/plans/2026-05-11-ai-chat-extraction-stories-assessment.md`
- 既存 stories: `aidlc-docs/inception/user-stories/stories.md`
- 既存 personas: `aidlc-docs/inception/user-stories/personas.md`
