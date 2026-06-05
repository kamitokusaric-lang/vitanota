# Unit-05 (AI 連携) — デプロイアーキテクチャ

> **対応インフラ設計**: [`infrastructure-design.md`](infrastructure-design.md) (同階層)
> **対応実装プラン**: [`inception/plans/2026-05-11-ai-chat-extraction-plan.md`](../../../inception/plans/2026-05-11-ai-chat-extraction-plan.md)
> **作成日**: 2026-05-11
> **位置付け**: ai-chat-stack の段階デプロイ計画、ベースライン tag / ロールバック手順 / 既存スタックとの整合

## 環境構成

vitanota 既存パターン踏襲:

| 環境 | 用途 | AppRunner | Bedrock |
|---|---|---|---|
| **dev** | chimo 個人開発、ローカル + Docker Compose | なし (`pnpm dev`) | mock or 実 Bedrock (個人 API キー) |
| **本番 (prod)** | 教員運用 | `vitanota-prod-app` | 実 Bedrock (ap-northeast-1) |

**staging** 環境は現状 vitanota 既存スタックに存在しないため、Unit-05 でも作らない (本番フラグ OFF 状態で内部検証する方式、Phase 6/7)。

## スタック依存関係 (デプロイ順)

```
┌────────────────────┐
│ FoundationStack    │  既存・依存元
└─────────┬──────────┘
          │
   ┌──────┴──────┐
   ▼             ▼
┌──────────┐ ┌─────────────┐
│DataShared│ │ DataCore    │  既存
│Stack     │ │ Stack       │
└────┬─────┘ └──────┬──────┘
     │              │
     └──────┬───────┘
            │
            ▼
   ┌────────────────┐
   │ AppStack       │  既存
   └──────┬─────────┘
          │
          ▼
   ┌────────────────┐
   │ EdgeStack      │  既存
   └────────────────┘

(以下、新規・既存スタックとは独立にデプロイ可)

┌────────────────────┐
│  AiChatStack       │  ★ 新規 (Unit-05)
│  (Lambda + IAM +   │
│   Secrets + SSM +  │
│   CloudWatch +     │
│   SNS)             │
└────────────────────┘
```

**ポイント**:
- AiChatStack は既存スタックを **参照しない** (cross-stack import なし)
- AppRunner からの Lambda invoke は SDK 経由 (ARN を AppRunner env 変数で渡す、stack 間 export/import を使わない)
- SSM Parameter Store / Secrets Manager 経由のパラメータ共有も疎結合
- これにより AiChatStack の独立 destroy が可能、既存スタックは無影響

## ベースライン tag

実装プラン (`aidlc-docs/inception/plans/2026-05-11-ai-chat-extraction-plan.md`) で定義済み:

- **tag 名**: `pre-ai-chat-extraction-baseline`
- **付与タイミング**: 機能ブランチ `feat/2026-05-11-ai-chat-extraction` 作業着手時の main HEAD
- **付与コマンド**: `git tag pre-ai-chat-extraction-baseline <main HEAD SHA>`
- **用途**: 本番デプロイ後の問題発覚時のコードロールバック起点

## 段階デプロイ (Phase 0-7、実装プラン踏襲)

### Phase 0: 設計フェーズ
- aidlc-docs/ 配下のドキュメント生成のみ
- コード変更ゼロ、本番影響ゼロ
- **現在のフェーズ**: ここ (機能設計 / NFR 要件 / NFR 設計 / インフラ設計まで完了)

### Phase 1: DB migration (リスク最小)
**目的**: 新規テーブル + カラム追加のみ、既存機能に影響なし

**手順**:
1. `migrations/00XX_chat_extraction_source_columns.sql` 新規 (tasks / journal_entries に source_chat_snippet 追加)
2. `migrations/00YY_api_rate_limits.sql` 新規 (api_rate_limits テーブル + RLS)
3. `src/db/schema.ts` の Drizzle 定義更新
4. ローカル DB に migration 適用 + 動作確認 (既存機能無影響を verify)
5. 既存テスト suite が GREEN を確認

**本番デプロイは Phase 6 まで保留**

### Phase 2: Bedrock 連携 Lambda + IAM (インフラ単体)
**目的**: ai-chat-stack の主要リソース構築

**手順**:
1. `infra/lib/lambdas/chat-extraction/` 新規ディレクトリ (Lambda コード + esbuild 設定)
2. `infra/lib/ai-chat-stack.ts` 新規 (Lambda + IAM + Secrets + SSM + CloudWatch + SNS)
3. `infra/bin/vitanota.ts` に AiChatStack 追加 (デプロイ対象として登録)
4. Lambda 単体テスト (mock Bedrock、PIIMasker / candidateValidator 重点)
5. ローカル `cdk synth` で CloudFormation テンプレート生成、目視確認

**本番デプロイは Phase 6 まで保留**

### Phase 3: /api/ai-chat/extract API
**目的**: Next.js API ルート + AppRunner の Lambda invoke 経路

**手順**:
1. `pages/api/ai-chat/extract.ts` 新規 (env flag → 認証 → rate limit → Lambda invoke の 4 段階)
2. `src/schemas/aiChat.ts` 新規 (Zod schemas 共通定義)
3. `src/lib/rateLimit.ts` 新規 (PostgreSQL UPSERT ロジック)
4. AppRunner の IAM ロール拡張 (Lambda invoke 権限追加)
5. API ルートの統合テスト (mock Lambda)

**本番デプロイは Phase 6 まで保留**

### Phase 4: Frontend component 開発 (UI 完成、フラグ OFF)
**目的**: 全 component / hook 実装、ただし env flag OFF で本番では非表示

**手順**:
1. `src/features/ai-chat/components/` 新規ディレクトリ (9 component)
2. `src/features/ai-chat/hooks/` 新規 (useChatExtraction / useChatBubbleFlag)
3. 共通 Layout に `<ChatBubble>` マウント (useChatBubbleFlag で条件付き表示)
4. ユニットテスト (component / hook、80% カバレッジ目標)
5. ローカル `pnpm dev` で env flag ON 状態で UI 動作確認 (mock API)

**本番デプロイは Phase 6 まで保留**

### Phase 5: 統合テスト + 内部検証
**目的**: フル統合で動作確認、本番投入前の最終チェック

**手順**:
1. Playwright E2E テスト追加 (起動 → 送信 → 抽出 → 承認 → tasks / journal_entries 確認)
2. 教員シーン別の手動検証 (モバイル / PC / 朝 / 隙間 / 帰宅後 をシミュレート)
3. 踏み絵チェック実機検証 (mood AI 不可侵 / 観測者原則 / 履歴非永続化)
4. コスト試算 (実 API コール × 単価で月額予測)
5. CI GREEN 確認

**本番デプロイは Phase 6 で**

### Phase 6: 本番デプロイ (フィーチャーフラグ OFF のまま)
**目的**: コードは本番にあるけど教員には見えない状態を作る

**手順**:
1. 全テスト GREEN 最終確認 (`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build`)
2. main にマージ (PR 経由)、CI GREEN 確認
3. `cdk deploy vitanota-prod-app` (新 Docker image deploy、AppRunner update)
4. `cdk deploy vitanota-prod-ai-chat` (新 AiChatStack デプロイ、Lambda + IAM + Secrets + etc.)
5. 本番 DB migration 適用 (memory `reference_db_migrator_flow.md`):
   ```
   aws lambda invoke \
     --function-name vitanota-prod-db-migrator \
     --payload '{"command":"migrate"}' \
     /tmp/migrate.json
   ```
6. AppRunner env 変数 update:
   - `ENABLE_AI_CHAT_EXTRACTION=false` (まだ OFF のまま)
   - `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION=false`
   - `AI_CHAT_LAMBDA_ARN=<新 Lambda ARN>`
   - AppRunner 自動再起動 ~3 分
7. **本番でフラグ OFF 状態の動作確認**:
   - 既存 UX (タスク管理 / 日誌画面) が無影響で稼働すること
   - ChatBubble が表示されないこと
   - API 直叩きで 404 が返ること

### Phase 7: フィーチャーフラグ ON (教員に公開)
**目的**: 本番教員に AI チャット抽出機能を公開

**前提**:
- school_admin (校長先生) に事前通知 + 同意取得
- プライバシーポリシー更新文言 (NFR-U05-SEC-03) を反映
- chimo が本番テナントで実機検証完了

**手順**:
1. 本番 chimo テナントで `ENABLE_AI_CHAT_EXTRACTION=true` 一時設定 → 自分だけで動作確認
2. 問題なければ `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION=true` も追加
3. AppRunner 再起動 → 全教員に公開
4. 観測フェーズ (1 週間程度):
   - CloudWatch Alarms (p95 / 失敗率 / 月次予算) を chimo が watch
   - 教員フィードバック (機能 B フィードバック経路) を回収
   - 抽出精度 / 承認率 / 棄却率を CloudWatch メトリクスで監視
5. 異常時はフラグ OFF で即時 revert

## ロールバック手順

### 即時対応 (緊急停止)
**シナリオ**: AI が踏み絵踏む発言 / コスト暴騰 / 障害多発を検知

```bash
# AppRunner env 更新 (フラグ OFF)
aws apprunner update-service \
  --service-arn $APPRUNNER_SERVICE_ARN \
  --source-configuration '{"...env vars with ENABLE_AI_CHAT_EXTRACTION=false..."}'
# → AppRunner 自動再起動 ~3 分で AI 機能停止
```

**所要時間**: ~3 分
**影響**: 既存 UX (タスク管理 / 日誌画面) は無影響、AI チャット機能だけ停止

### コードロールバック
**シナリオ**: フラグ OFF だけでは対応できない問題 (例: AppRunner 起動失敗)

```bash
git checkout pre-ai-chat-extraction-baseline
git tag rollback-2026-05-XX
git push origin pre-ai-chat-extraction-baseline:main --force  # ※ 慎重に
# → CI が pre-baseline image を ECR push → AppRunner pull
cdk deploy vitanota-prod-app
```

**所要時間**: ~10 分
**影響**: AI 機能だけでなくコード全体が pre-baseline に戻る

**注意**: memory `feedback_commit_push_timing.md` — chimo が CI/CD タイミング自主管理、緊急 force push は事前に chimo 確認

### AiChatStack 完全削除
**シナリオ**: AI 機能を完全に撤回、ai-chat-stack のリソース全部消す

```bash
# まずフラグ OFF (既存スタックの env 変数除去)
aws apprunner update-service ... ENABLE_AI_CHAT_EXTRACTION=false

# AiChatStack destroy
cdk destroy vitanota-prod-ai-chat
# → Lambda / IAM / Secrets / SSM / CloudWatch Alarms / SNS topic 全部削除
```

**所要時間**: ~5 分
**影響**: AI 機能の AWS リソース全削除、既存スタックは無影響

### スキーマのロールバック (新規カラムのみ)
**シナリオ**: source_chat_snippet カラムを完全削除したい (まず不要)

```sql
ALTER TABLE tasks DROP COLUMN source_chat_snippet;
ALTER TABLE journal_entries DROP COLUMN source_chat_snippet;
DROP TABLE api_rate_limits;
```

**影響**: 既存クエリは無影響 (NULL 許可カラム削除のみ)
**注意**: 残置しても害なし (アプリが参照しないだけ)、急いで削除する必要は通常ない

## CI/CD 統合

### main ブランチへの merge
- 既存 GitHub Actions パターン踏襲
- Docker image build → ECR push → AppRunner update-service → health check
- AI 関連の追加 step なし (既存 pipeline で完結)

### cdk deploy のタイミング
- AppStack: 既存 main push pipeline で自動 (新 image deploy)
- **AiChatStack: 手動 `cdk deploy vitanota-prod-ai-chat`** (Phase 6 で 1 回、その後変更時のみ)
- 理由: AiChatStack は変更頻度低、手動 deploy で安全側

### Lambda コード更新
- 機能ブランチで Lambda コード変更 → main merge
- `cdk deploy vitanota-prod-ai-chat` で Lambda 更新 (~30 秒)

## 観測対象

### Phase 6 完了後 (フラグ OFF 段階) の確認項目
- [ ] CloudWatch Logs `/aws/lambda/vitanota-prod-chat-extraction` ロググループ存在
- [ ] AiChatStack の全リソース作成成功 (`aws cloudformation describe-stacks --stack-name vitanota-prod-ai-chat`)
- [ ] AppRunner の env 変数に新変数追加済み
- [ ] AppRunner の IAM Role に lambda:InvokeFunction 権限追加済み
- [ ] DB に新規テーブル / カラム追加済み (`\dt` で確認)
- [ ] フラグ OFF 状態で `/api/ai-chat/extract` 直叩き → 404 返却
- [ ] フラグ OFF 状態で既存タスク管理 / 日誌画面が無影響稼働

### Phase 7 ON 後の観測項目 (1 週間)
- [ ] CloudWatch メトリクス `extraction_latency_ms` p95 < 3 秒
- [ ] CloudWatch メトリクス `extraction_failed` 失敗率 < 5%
- [ ] CloudWatch アラーム発火状況 (発火しないことを期待)
- [ ] 教員フィードバック (フィードバック機能経由) の質と量
- [ ] 抽出承認率 / 棄却率 (運営 chimo 内部参照、管理者には見せない)
- [ ] テナント月次 Bedrock コスト見積もり (実値 vs 予測)

## 不採用デプロイ戦略 (記録)

| 不採用 | 理由 |
|---|---|
| Blue/Green デプロイ | 段階フラグで段階リリース実現済み、追加複雑性過剰 |
| Canary release (10% → 50% → 100%) | テナント単位フラグなし、全テナント一斉 ON で運用 (chimo 決定) |
| staging 環境構築 | 本番フラグ OFF 状態 + ローカル dev で代替 |
| CodeDeploy / CodePipeline 統合 | 既存 GitHub Actions で完結、AWS native CI 不要 |

## 参照
- インフラ設計: `infrastructure-design.md` (同階層)
- 実装プラン: `aidlc-docs/inception/plans/2026-05-11-ai-chat-extraction-plan.md`
- 既存 deployment-phases: `aidlc-docs/construction/deployment-phases.md`
- 既存共有インフラ: `aidlc-docs/construction/shared-infrastructure.md`
- memory: `project_domain_and_infra.md` (既存スタック構成)
- memory: `reference_db_migrator_flow.md` (DB migration フロー)
- memory: `feedback_commit_push_timing.md` (chimo の CI/CD タイミング管理)
- memory: `feedback_implementation_reversibility.md` (revert 可能性原則)
