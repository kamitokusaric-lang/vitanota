# ユニットテスト実行手順

## 実行

```bash
pnpm vitest run
```

## カバレッジ付き実行

```bash
pnpm vitest run --coverage
```

## 期待結果

- **テスト件数**: 186 件パス
- **カバレッジ閾値**: lines/functions/branches/statements すべて 80% 以上
- **テストファイル**: 27 ファイル

## テスト内訳

| ユニット | テスト数 | 対象 |
|---|---|---|
| Unit-01 | 22 | 認証・テナント・共通 UI |
| Unit-02 | 120 | 日誌 CRUD・タグ・バリデーション・RLS |
| Unit-03 | 34 | 感情傾向集計・グラフコンポーネント・TagFilter 改修 |
| Unit-04 | 10 | アラート検知閾値・EmotionRatioBar・AlertBanner |

## カバレッジ除外

以下は統合テストでカバーするため、ユニットテストのカバレッジ対象外：

- DB 依存サービス層（adminDashboardService, alertDetectionService, alertService, emotionTrendService）
- SWR フック
- Zod スキーマ（型定義）
- Auth.js 関連（auth-options, withAuthSSR, withAuthApi）
- DB 接続層（db.ts, db-auth.ts, secrets.ts）
