# 統合テスト実行手順

## 前提

- PostgreSQL が起動していること（`pnpm db:local:up`）
- マイグレーションが適用済みであること
- Next.js dev サーバーが起動していること（`pnpm dev`）

## 実行

```bash
pnpm test:integration
```

## テストシナリオ

### テナント隔離テスト

| シナリオ | 検証内容 |
|---|---|
| テナント A の教員がテナント B のエントリにアクセス | 404 or 空結果 |
| テナント A の教員がテナント B のタグを参照 | 空結果 |
| URL パラメータの ID 書き換え（IDOR） | 404 |

### ロール・アクセス制御テスト

| シナリオ | 検証内容 |
|---|---|
| teacher → `/api/admin/teachers` | 403 |
| teacher → `/api/admin/alerts` | 403 |
| school_admin → `/api/admin/teachers` | 200 |
| school_admin → 日誌本文非含有 | レスポンスに content なし |
| 未認証 → 全 API | 401 |

### 感情傾向 API テスト

| シナリオ | 検証内容 |
|---|---|
| 有効な period で教員自身のデータ | 200 + 正しい集計 |
| 不正な period | 400 |
| 管理者が教員のデータを取得 | 200 |

### アラート検知テスト

| シナリオ | 検証内容 |
|---|---|
| negative 比率 60% 以上の教員 | アラート生成 |
| 5日以上記録途絶の教員 | アラート生成 |
| 既に open アラートがある教員 | 重複生成しない |

### アラートクローズテスト

| シナリオ | 検証内容 |
|---|---|
| open アラートをクローズ | status=closed, closed_by/closed_at 設定 |
| 既に closed のアラート | 404 |
