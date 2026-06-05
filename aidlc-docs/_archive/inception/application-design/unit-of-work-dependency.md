# ユニット依存関係

## 依存関係マトリクス

| | Unit-01 認証・テナント | Unit-02 日誌・感情 | Unit-03 教員ダッシュボード | Unit-04 管理者・アラート |
|---|---|---|---|---|
| **Unit-01** | — | 提供 | 提供 | 提供 |
| **Unit-02** | **依存** | — | 提供 | 提供 |
| **Unit-03** | **依存** | **依存** | — | なし |
| **Unit-04** | **依存** | **依存** | なし | — |

- **依存**: このユニットの開発・動作に必要
- **提供**: このユニットが提供する機能・サービスを他ユニットが利用する
- **なし**: 直接の依存関係なし

---

## 依存関係の詳細

### Unit-02 が Unit-01 に依存する理由

| 依存内容 | 詳細 |
|---|---|
| `withTenant()` | 全 DB アクセスに必須。Unit-01 で実装 |
| `getServerSession()` | API Route の認証チェックに必須 |
| `RoleGuard` | teacher ロール検証に必須 |
| DB スキーマ基盤 | `tenants`・`users` テーブルが存在することが前提 |
| 共通 UI | `Layout`・`Button` 等を利用 |

### Unit-03 が Unit-02 に依存する理由

| 依存内容 | 詳細 |
|---|---|
| `EmotionService.getEmotionTimeSeries()` | 感情スコアグラフのデータを EmotionService から取得 |
| `EmotionService.getTagFrequency()` | タグ頻度グラフのデータを EmotionService から取得 |
| `emotion_records` テーブル | Unit-02 のマイグレーションで作成済みが前提 |

### Unit-04 が Unit-02 に依存する理由

| 依存内容 | 詳細 |
|---|---|
| `EmotionService.getTeacherEmotionSummaries()` | 全教員の感情スコア集計（管理者ダッシュボード用） |
| `journal_entries` テーブル | アラート検知で「記録途絶」判定に使用 |
| `emotion_records` テーブル | アラート検知で「感情スコア連続低下」判定に使用 |

---

## 開発順序と依存グラフ

```
Unit-01（認証・テナント基盤）
  │  ← 全ユニットの基盤。shared/ を先行実装
  ▼
Unit-02（日誌・感情記録コア）
  │  ← Unit-01 完了後に開始
  ├──────────────────────┐
  ▼                      ▼
Unit-03                Unit-04
（教員ダッシュボード）  （管理者・アラート）
  │  ← Unit-02 完了後     │  ← Unit-02 完了後
  │     教員体験優先で      │     Unit-03 完了後に開始
  │     先に実施            │
  └──────────────────────┘
                          ▼
                       MVP 完成
```

**注記**: Unit-03 と Unit-04 は Unit-02 完了後に開始できる。今回は Q2=B（教員体験優先）により Unit-03 → Unit-04 の順で開発する。

---

## 共有リソース管理

| リソース | 管理ユニット | 利用ユニット |
|---|---|---|
| `src/shared/lib/db.ts` | Unit-01 | Unit-02・03・04 |
| `src/shared/lib/auth.ts` | Unit-01 | Unit-02・03・04 |
| `src/shared/components/` | Unit-01 | Unit-02・03・04 |
| `db/schema.ts` | Unit-01 起点、各ユニットで追記 | 後続全ユニット |
| `EmotionService` | Unit-02 | Unit-03・04 |

---

## ユニット境界違反の防止ルール

1. **Unit-03・04 は Unit-02 のサービスを呼び出せる** が、Unit-02 の内部実装（DB クエリ等）を直接コピーしてはならない
2. **Unit-03 と Unit-04 の間には直接の依存関係を作らない**
3. **各ユニットは `withTenant()` を経由せずに DB に直接アクセスしてはならない**
4. **管理者向けサービス（AdminDashboardService・AlertService）は日誌本文テキストを返却するメソッドを持ってはならない**
