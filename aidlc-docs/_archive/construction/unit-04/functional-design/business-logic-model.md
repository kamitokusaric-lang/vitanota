# Unit-04 ビジネスロジックモデル

**作成日**: 2026-04-17
**対象ストーリー**: US-A-010・US-A-011・US-A-020・US-A-021

---

## 1. 全教員ステータス集計（US-A-010）

### 集計クエリ（概念）

テナント内の全教員に対して、直近7日の感情タグカテゴリ別集計 + 最終記録日を取得。

```sql
-- 教員一覧 + 直近7日の感情集計 + 最終記録日 + アラート件数
SELECT
  u.id AS user_id,
  u.name,
  u.email,
  MAX(je.created_at) AS last_entry_date,
  COUNT(*) FILTER (WHERE t.category = 'positive' AND je.created_at >= :start) AS positive,
  COUNT(*) FILTER (WHERE t.category = 'negative' AND je.created_at >= :start) AS negative,
  COUNT(*) FILTER (WHERE t.category = 'neutral' AND je.created_at >= :start) AS neutral,
  (SELECT COUNT(*) FROM alerts a WHERE a.teacher_user_id = u.id AND a.status = 'open' AND a.tenant_id = :tenantId) AS open_alert_count
FROM users u
JOIN user_tenant_roles utr ON utr.user_id = u.id AND utr.tenant_id = :tenantId AND utr.role = 'teacher'
LEFT JOIN journal_entries je ON je.user_id = u.id AND je.tenant_id = :tenantId
LEFT JOIN journal_entry_tags jet ON jet.entry_id = je.id
LEFT JOIN tags t ON t.id = jet.tag_id AND t.type = 'emotion'
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.name, u.email;
```

---

## 2. 特定教員の感情傾向（US-A-011）

Unit-03 の `EmotionTrendService.getEmotionTrend()` を拡張。

**変更**: 現在は `userId` を RLS から自動取得（本人データのみ）。管理者向けには `targetUserId` パラメータを追加し、school_admin ロールで別教員のデータを取得可能にする。

```typescript
// 既存（Unit-03）
async function getEmotionTrend(db, tenantId, userId, period): Promise<EmotionTrendResponse>

// 拡張（Unit-04）— 管理者が指定した教員のデータを取得
// school_admin ロールの withTenantUser で実行するため、RLS は tenant_id のみでフィルタ
// userId フィルタはアプリ層の WHERE で明示
async function getEmotionTrendForTeacher(db, tenantId, targetUserId, period): Promise<EmotionTrendResponse>
```

**セキュリティ**: API 層で `school_admin` ロールチェック + `targetUserId` がテナント内の教員であることを検証。

---

## 3. アラート検知バッチ（US-A-020）

### 検知アルゴリズム

`POST /api/cron/detect-alerts` で実行（MVP は手動、将来 EventBridge 連携）。

**処理フロー**:
```
1. テナント内の全教員を取得
2. 各教員について:
   a. negative_trend チェック
      - 直近7日の感情タグを集計
      - negative 比率 >= 60% → アラート生成
      - 同じ教員に同じ type の open アラートが既にあればスキップ（重複防止）
   b. recording_gap チェック
      - 最終記録日から今日までの日数を計算
      - 5日以上 → アラート生成
      - 同じ教員に同じ type の open アラートが既にあればスキップ
3. 生成したアラートを alerts テーブルに INSERT
4. 結果サマリーを返却
```

### 閾値（MVP デフォルト・ハードコード）

| 検知種別 | 閾値 | 説明 |
|---|---|---|
| negative_trend | negative 比率 >= 60% | 直近7日の全感情タグのうち negative が 60% 以上 |
| recording_gap | 5日間 | 最終記録日から5日以上経過 |

---

## 4. アラートクローズ（US-A-021）

### API: PUT /api/admin/alerts/[id]/close

```typescript
// リクエスト: PUT /api/admin/alerts/:id/close
// ボディ: なし
// レスポンス: { alert: AlertListItem }

// 処理:
// 1. requireAuth() → school_admin チェック
// 2. alerts テーブルで id + tenant_id + status='open' を検索
// 3. status='closed', closed_by=userId, closed_at=now() に更新
// 4. 更新結果を返却
```

---

## 5. API 設計一覧

| メソッド | パス | 説明 | ストーリー |
|---|---|---|---|
| GET | `/api/admin/teachers` | 全教員ステータス一覧 | US-A-010 |
| GET | `/api/admin/teachers/[id]/emotion-trend` | 特定教員の感情傾向 | US-A-011 |
| GET | `/api/admin/alerts` | アクティブアラート一覧 | US-A-020 |
| PUT | `/api/admin/alerts/[id]/close` | アラートクローズ | US-A-021 |
| POST | `/api/cron/detect-alerts` | アラート検知バッチ | US-A-020 |

**共通**: 全 API で `requireAuth()` + `school_admin` ロールチェック（cron は API キー認証）。

---

## 6. データフロー

```
管理者 → /dashboard/admin → SWR → GET /api/admin/teachers
                                       ↓
                                 AdminDashboardService.getTeacherStatuses()
                                       ↓
                                 DB: users JOIN journal_entries JOIN tags (RLS 適用)

管理者 → 教員カードクリック → GET /api/admin/teachers/[id]/emotion-trend
                                       ↓
                                 EmotionTrendService.getEmotionTrendForTeacher()
                                       ↓
                                 DB: journal_entries JOIN tags (RLS 適用)

cron/手動 → POST /api/cron/detect-alerts
                  ↓
            AlertDetectionService.detectAll()
                  ↓
            DB: 各教員の集計 → alerts INSERT
```
