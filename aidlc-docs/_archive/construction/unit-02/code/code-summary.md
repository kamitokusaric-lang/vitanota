# Unit-02 コード生成サマリー

**生成日**: 2026-04-15
**対応ストーリー**: US-T-010〜014・US-T-020〜022
**テスト件数**: 142 件 GREEN（Unit-01 22 + Unit-02 120）

## 構造

```
src/
├── db/
│   └── schema.ts                     # journal_entries / tags / journal_entry_tags / sessions / public_journal_entries VIEW (Drizzle)
├── features/
│   └── journal/
│       ├── schemas/
│       │   ├── journal.ts            # createEntrySchema / updateEntrySchema / timelineQuerySchema (Zod + OpenAPI metadata)
│       │   └── tag.ts                # createTagSchema / tagIdParamSchema
│       ├── lib/
│       │   ├── publicTimelineRepository.ts  # SP-U02-04 Layer 3: VIEW 専用、PublicJournalEntry 型ブランド
│       │   ├── privateJournalRepository.ts  # CRUD、user_id+tenant_id WHERE 二重防御
│       │   ├── tagRepository.ts              # SYSTEM_DEFAULT_TAGS シード + CRUD
│       │   ├── journalEntryService.ts        # トランザクション境界・タグ検証・イベントログ
│       │   ├── tagService.ts                 # school_admin 権限チェック
│       │   ├── apiHelpers.ts                 # requireAuth + mapErrorToResponse 共通化
│       │   └── errors.ts                     # ドメインエラー (HTTP マッピング元)
│       └── components/
│           ├── TagFilter.tsx          # PP-U02-01 useMemo + includes、20件上限・10件選択制御
│           ├── EntryCard.tsx          # 50文字プレビュー・privacy バッジ・編集リンク
│           ├── EntryForm.tsx          # React Hook Form + zodResolver、サーバーと同じ Zod スキーマ共有
│           ├── TimelineList.tsx       # SWR で /api/public/journal/entries
│           └── MyJournalList.tsx      # SWR で /api/private/journal/entries/mine
├── shared/
│   ├── lib/
│   │   ├── db.ts                     # withTenantUser HOF (tenant_id + user_id 両方注入、R1 対策)
│   │   ├── log-events.ts             # 型安全な LogEvents 定数 + logEvent ヘルパー
│   │   └── logger.ts                 # pino + redact (content/sessionToken を P1-D 対応)
│   └── types/
│       └── brand.ts                  # PublicJournalEntry 型ブランド (SP-U02-04 Layer 3)
└── openapi/
    ├── schemas.ts                    # レスポンス型の Zod スキーマ
    └── registry.ts                   # OpenAPI 3.1 レジストリ (9 operations)

pages/
├── api/
│   ├── public/
│   │   └── journal/entries.ts        # GET タイムライン (s-maxage=30, swr=60)
│   ├── private/
│   │   └── journal/
│   │       ├── entries.ts            # POST 作成
│   │       ├── entries/[id].ts       # GET/PUT/DELETE
│   │       ├── entries/mine.ts       # GET マイ記録
│   │       ├── tags.ts               # GET/POST
│   │       └── tags/[id].ts          # DELETE
│   └── system/tenants.ts             # POST にデフォルトタグシード追加（Step 9 で改修）
└── journal/
    ├── index.tsx                     # 共有タイムラインページ
    ├── mine.tsx                      # マイ記録ページ
    ├── new.tsx                       # 新規投稿
    └── [id]/edit.tsx                 # 編集・削除

migrations/
├── 0002_unit02_sessions.sql          # Auth.js database セッション戦略 (SP-07)
├── 0003_unit02_journal_core.sql      # 3テーブル + 複合 FK
├── 0004_unit02_journal_rls.sql       # RLS 2ポリシー (SP-U02-02)
└── 0005_unit02_public_view.sql       # public_journal_entries VIEW (SP-U02-04 Layer 4)

scripts/
└── gen-openapi.ts                    # openapi.yaml 自動生成

openapi.yaml                          # OpenAPI 3.1 仕様（自動生成）

.github/
├── workflows/
│   ├── ci.yml                        # 4 ジョブ + OpenAPI sync check + Action SHA 固定
│   ├── deploy.yml                    # AWS Actions も SHA 固定
│   └── claude-review.yml             # Claude Code Review Phase 1
└── dependabot.yml                    # Actions/npm 週次更新

.githooks/
├── pre-commit                        # gitleaks ローカル検知
└── README.md                         # 開発者セットアップ
```

## 主要な実装決定

### 1. SP-U02-04 8層防御の物理化（is_public 漏えい対策）

| Layer | 実装 |
|---|---|
| L1 CloudFront パス分離 | infrastructure-design.md |
| L2 エンドポイント分離 | `pages/api/public/*` vs `pages/api/private/*` |
| L3 Repository 型分離 | `PublicTimelineRepository` (VIEW 専用) vs `PrivateJournalRepository` (CRUD) |
| L4 PostgreSQL VIEW | `public_journal_entries` (is_public 列を露出しない) |
| L5 RLS public_read | migration 0004 |
| L6 アプリ層 WHERE | Repository 内で明示 |
| L7 統合テスト | integration-test-plan.md Suite 5 |
| L8 複合 FK | journal_entry_tags の (entry_id, tenant_id) FK |

### 2. R1 RDS Proxy ピンニング対策

- `withTenantUser(tenantId, userId, fn)` HOF が必ず `db.transaction` を張り、内部で `set_config('app.*', ..., true)` を使用
- `true` = LOCAL スコープのため、トランザクション終了時に自動リセット
- すべての DB アクセスはこの HOF を経由する（Service 層で必須化）

### 3. SP-07 Database セッション戦略の準備

- `sessions` テーブルを Unit-01 に遡及追加（migration 0002）
- 実装は Step 8 で auth-options.ts を database 戦略に切替予定

### 4. ログイベントの型安全性

- `src/shared/lib/log-events.ts` に 14 イベントを型定義
- `logEvent(LogEvents.JournalEntryCreated, { ... })` のように呼び出すと、ペイロードフィールドが TypeScript で強制
- 機密情報（content・sessionToken）は pino redact で自動マスク

### 5. OpenAPI 仕様の自動生成

- 既存の Zod スキーマに `.openapi()` メタデータを追加
- `pnpm gen:openapi` で `openapi.yaml` を生成（9 operations）
- CI で `openapi:check` により Zod とのドリフト検知

## 関連ドキュメント

- API 仕様: `openapi.yaml` (機械可読) / `api-contracts.md` (人間可読概要)
- DB 構造: `aidlc-docs/construction/er-diagram.md` / `database-schema.md`
- 設計パターン: `aidlc-docs/construction/unit-02/nfr-design/nfr-design-patterns.md`
- 運用リスク: `aidlc-docs/construction/unit-02/nfr-design/operational-risks.md`
- セキュリティレビュー: `aidlc-docs/inception/requirements/security-review.md`
- 統合テスト計画: `aidlc-docs/construction/unit-02/nfr-design/integration-test-plan.md`
