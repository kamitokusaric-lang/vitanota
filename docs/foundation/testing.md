# テスト・ビルド (横断)

> **CI の正本は `.github/workflows/` と `package.json` の scripts。** 本ファイルは戦略と手順の運用サマリー。
> 原本の詳細手順 (Phase 1 As-Built 時点) は `../../aidlc-docs/_archive/` の build-and-test/ (凍結資産)。

## CI ハードゲート (required5)

main への PR は以下が緑であること (OSV は除外):

- 型チェック (`tsc`)
- lint
- ユニットテスト (`vitest`)
- 統合テスト
- OpenAPI チェック (`openapi:check` + `openapi:coverage`) — API 変更時の DoD ([CLAUDE.md](../../CLAUDE.md))

## ローカル実行 (pnpm)

```bash
pnpm install            # 依存
pnpm tsc --noEmit       # 型チェック
pnpm lint               # lint
pnpm vitest run         # ユニットテスト
pnpm vitest run --coverage
pnpm build              # 本番ビルド
pnpm gen:openapi && pnpm openapi:check && pnpm openapi:coverage
```

ローカル開発環境の立ち上げは [local-development.md](./local-development.md)。

## テストの種類

- **ユニット**: ビジネスロジック層 (service/repository) 中心。除外: DB 層実体・SWR・Auth.js。
- **統合**: テナント隔離・ロール制御 (RLS)・IDOR 防止・感情傾向集計など、セキュリティ境界の検証が中心。

## 罠 (メモ)

- `vi.doMock` は `node:crypto` 等の Node 標準 module には効かない (randomUUID 固定不可)。
- migration は AppRunner deploy より**前**に適用する (新コードが旧 schema を参照する race を避ける、→ [foundation/infrastructure.md](./infrastructure.md))。
