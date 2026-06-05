# ai-chat (AI 整理)

> 「雑に投げる → 整う → 残る」の入口 ([PHILOSOPHY §6](../../PHILOSOPHY.md))。教員のテキストから AI がタスク/日誌ネタの候補を抽出し、教員が確認して確定する。AI は整えるだけ、決めるのは教員。

- **src**: `src/features/ai-chat/`
- **対応要件**: EPIC-T-07 (AI チャット抽出、2026-05-11)
- **粒度**: overview + api
- **OpenAPI**: あり (tag: `AI Chat`)

## 何ができるか

- テキスト入力から候補を抽出 (`extract`) — Bedrock 経由 Claude Haiku
- 候補を行ごとに表示 → ワンタップ承認 / 編集 / 棄却。task と diary の 2 分類
- 確定 (`confirm`) で `tasks` / `journal_entries` に INSERT (`source_chat_snippet` 付き)
- diary のときだけ MoodPicker (5 段階)。**mood は教員が選ぶ。AI 提案なし**
- 確定/棄却の理由を記録 (`feedback`)、利用計測 (`events`)

## セッションのライフサイクル

`ai_sessions` テーブル: `draft` (抽出直後) → `confirmed` (確定) / `discarded` (破棄)。中間データ `ai_output_json` に AI 提案 vs 教員選択の差分を記録 (プロンプト改善用)。

## 機能フラグ (env 2 段)

| 変数 | 役割 |
|---|---|
| `ENABLE_AI_CHAT_EXTRACTION` | マスター ON/OFF (false で全テナント停止・API 404) |
| `AI_CHAT_ALLOWLIST_TENANT_IDS` | テナント単位の許可リスト (未設定なら全テナント) |

`featureFlag.ts` の `isAiChatEnabledForTenant()` で判定。管理画面化は backlog 行き。

## 踏み絵 (最重要)

- **mood は AI に触らせない**: 出力 schema に mood フィールド自体を含めない ([PHILOSOPHY §4.1](../../PHILOSOPHY.md))
- **感情代弁・励まし・評価を禁止**: 出力は事実 + 提案のみ ([PHILOSOPHY §4.3](../../PHILOSOPHY.md))
- **観測装置化しない**: チャット本文は構造化ログに残さない。`input_text` は DB に保存し RLS で本人 + system_admin のみ可視。**school_admin には不可視**
- **個人評価に使わない**: 承認率/棄却率は運営内部のプロンプト改善指標のみ、管理者に個人指標を見せない
- Bedrock invocation logging は OFF 運用 (PII 漏洩防止、監視は Lambda 構造化ログのみ)

## PII マスキング

`piiMask.ts` が email / 電話番号を regex で `[email]` / `[phone]` に置換。完全除去ではないため Bedrock の system prompt 側でも抽象化を指示。構造化ログには `input_text_redacted` のみ流す。

## 横断依存

- API → [api.md](./api.md)
- ai_sessions の可視性 → [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md#可視性の特殊ケース)
- 抽出されたタスク/日誌の本体 → [features/tasks](../tasks/overview.md) / [features/journal](../journal/overview.md)
