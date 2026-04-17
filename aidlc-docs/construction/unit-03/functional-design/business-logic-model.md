# Unit-03 ビジネスロジックモデル

**作成日**: 2026-04-16
**対象ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）

---

## 1. 感情傾向集計アルゴリズム

### 集計クエリ（概念）

```sql
SELECT
  DATE(je.created_at) AS date,
  COUNT(*) FILTER (WHERE t.category = 'positive') AS positive,
  COUNT(*) FILTER (WHERE t.category = 'negative') AS negative,
  COUNT(*) FILTER (WHERE t.category = 'neutral') AS neutral
FROM journal_entries je
JOIN journal_entry_tags jet ON jet.entry_id = je.id
JOIN tags t ON t.id = jet.tag_id AND t.type = 'emotion'
WHERE je.user_id = :userId
  AND je.tenant_id = :tenantId
  AND je.created_at >= :startDate
  AND je.created_at < :endDate
GROUP BY DATE(je.created_at)
ORDER BY date ASC;
```

### 期間の算出

| 期間 | startDate | endDate |
|---|---|---|
| week | 今日 - 6日 (00:00:00) | 今日 + 1日 (00:00:00) |
| month | 今日 - 29日 (00:00:00) | 今日 + 1日 (00:00:00) |
| quarter | 今日 - 89日 (00:00:00) | 今日 + 1日 (00:00:00) |

- タイムゾーン: サーバー側で `Asia/Tokyo` に正規化して日付を算出
- データがない日は結果に含まれない（フロントエンドで 0 補完する）

---

## 2. API 設計

### GET /api/private/dashboard/emotion-trend

教員本人の感情傾向時系列データを返す。

**リクエスト**:
```
GET /api/private/dashboard/emotion-trend?period=week
```

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| period | string | No | `week` / `month` / `quarter`（デフォルト: `week`） |

**レスポンス** (200):
```json
{
  "period": "week",
  "data": [
    { "date": "2026-04-10", "positive": 2, "negative": 1, "neutral": 0, "total": 3 },
    { "date": "2026-04-11", "positive": 0, "negative": 0, "neutral": 1, "total": 1 },
    { "date": "2026-04-12", "positive": 1, "negative": 0, "neutral": 0, "total": 1 }
  ],
  "totalEntries": 5
}
```

**認証**: `requireAuth()` で教員本人のセッションを検証
**RLS**: `withTenantUser()` 経由で tenant_id + user_id を注入。本人のエントリのみ集計される

**エラー**:
- 401: 未認証
- 400: 不正な period 値

### Zod スキーマ

```typescript
export const emotionTrendQuerySchema = z.object({
  period: z.enum(['week', 'month', 'quarter']).default('week'),
});
```

---

## 3. サービス層

### EmotionTrendService

新規作成: `src/features/teacher-dashboard/lib/emotionTrendService.ts`

```typescript
// 責務: 感情傾向データの集計
// 依存: withTenantUser (shared)、tags / journal_entries / journal_entry_tags (schema)

async function getEmotionTrend(
  tenantId: string,
  userId: string,
  period: 'week' | 'month' | 'quarter'
): Promise<EmotionTrendResponse>
```

- `withTenantUser()` を必ず経由（RLS 準拠）
- Drizzle ORM の `sql` ヘルパーで集計クエリを構築
- データがない日は結果に含めない（フロント側で補完）

---

## 4. データフロー

```
教員 → /dashboard/teacher → SWR(useSWR) → GET /api/private/dashboard/emotion-trend
                                                    ↓
                                            requireAuth() → withTenantUser()
                                                    ↓
                                          EmotionTrendService.getEmotionTrend()
                                                    ↓
                                          DB: journal_entries JOIN tags (RLS 適用)
                                                    ↓
                                          EmotionTrendResponse → JSON
```

---

## 5. グラフ表示判定ロジック

```typescript
const MIN_ENTRIES_FOR_GRAPH = 3;

if (response.totalEntries < MIN_ENTRIES_FOR_GRAPH) {
  // ガイドメッセージを表示
  // 「記録を続けるとグラフが表示されます（あと N 件）」
} else {
  // Recharts でグラフを描画
}
```
