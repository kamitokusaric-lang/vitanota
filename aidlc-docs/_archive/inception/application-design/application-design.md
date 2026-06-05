# アプリケーション設計（統合ドキュメント）

## 設計決定サマリー

| 観点 | 決定内容 | 理由 |
|---|---|---|
| ルーター | Next.js **Pages Router** | Auth.js v4 との実績。学習コスト低。MVP 速度優先 |
| バックエンド | **サービス層あり**（機能別サービスクラス） | アラート判定等の複雑なロジックをユニットテスト可能にする |
| データフェッチ | **getServerSideProps + SWR ハイブリッド** | 初期表示はサーバー側、インタラクティブ更新は SWR |
| 集計計算 | **リアルタイム SQL 集計** | MVP 規模（テナントあたり 10〜100 名）では PostgreSQL で十分 |
| アラート検知 | **定期バッチ（毎日深夜）** | 「記録途絶」検知に最適。Vercel Cron Jobs で実装 |
| ディレクトリ | **機能別（Feature-based）** | 4ユニットの独立性が高い。将来の機能追加に対応しやすい |
| 管理者画面更新 | **SWR 30秒ポーリング** | リアルタイム性と実装コストのバランス |
| ORM | **Drizzle ORM + PostgreSQL RLS** | RLS との相性が良い。`withTenant()` でDB層のテナント隔離を保証 |

---

## アーキテクチャ概観

```
ブラウザ
  │
  ├─ Pages（SSR）
  │   ├─ /dashboard/teacher   教員ダッシュボード
  │   ├─ /dashboard/admin     管理者ダッシュボード
  │   └─ /auth/signin         ログイン
  │
  └─ API Routes
      ├─ /api/auth/[...nextauth]   Auth.js（Google OAuth）
      ├─ /api/journal/             日誌 CRUD
      ├─ /api/emotion/             感情データ
      ├─ /api/admin/               管理者専用 API
      └─ /api/cron/detect-alerts   アラートバッチ（Cron）

  各 API Route
  ├─ getServerSession()  → 認証チェック
  ├─ RoleGuard           → ロール検証
  ├─ 入力バリデーション   → SECURITY-05
  └─ Service            → withTenant() → PostgreSQL（RLS）
```

---

## テナント隔離設計

本システムの最重要セキュリティ要件はテナント間のデータ隔離（学校間の情報漏洩防止）。5層の防御を設ける。

```
Layer 1: Auth.js セッション    未認証リクエストを遮断
Layer 2: TenantGuard          セッションの tenantId を検証
Layer 3: RoleGuard            ロールを検証（教員/管理者）
Layer 4: サービス層の検証     所有者 ID の一致確認（IDOR 防止）
Layer 5: PostgreSQL RLS       DB 層で tenant_id を自動フィルタ
                              ← withTenant() でセッション変数をセット
                              ← アプリ層を迂回してもブロック
```

---

## コンポーネント構成

詳細は `components.md` を参照。

### 教員向け機能

```
TeacherDashboardPage（SSR）
  ├─ TeacherDashboardHeader
  ├─ JournalTimeline（SWR）
  │   └─ JournalEntryCard × N
  │       ├─ EmotionScoreSelector
  │       └─ EmotionCategorySelector
  ├─ DashboardGraphSection（CC）
  │   ├─ EmotionScoreGraph（Recharts）
  │   └─ TagFrequencyChart（Recharts）
  └─ MonthlySummary
```

### 管理者向け機能

```
AdminDashboardPage（SSR + SWR 30秒ポーリング）
  ├─ AlertBadge（SWR）
  ├─ AlertList
  │   └─ AlertItem × N（クローズボタン付き）
  ├─ TeacherStatusGrid
  │   └─ TeacherStatusCard × N（色分けインジケーター）
  │       └─ TeacherDetailPanel（展開時）
  │           ├─ EmotionScoreGraph（Recharts）
  │           └─ WatchFlagForm
  └─ AlertHistoryList
```

---

## サービス構成

詳細は `services.md` を参照。

| サービス | 機能 | 主な依存 |
|---|---|---|
| `TenantService` | テナント管理・検証 | `withTenant()` |
| `RoleService` | ロール検証 | Auth.js セッション |
| `JournalService` | 日誌 CRUD | `withTenant()` |
| `TagService` | タグ管理 | `withTenant()` |
| `EmotionService` | 感情データ・集計 | `withTenant()` |
| `AdminDashboardService` | 管理者向けデータ集約 | `EmotionService`・`withTenant()` |
| `AlertService` | アラート管理・評価 | `withTenant()` |
| `AlertDetectionJob` | バッチ実行エントリーポイント | `AlertService` |

---

## API 設計概要

### 教員向け API

| メソッド | パス | 概要 |
|---|---|---|
| GET | `/api/journal` | 日誌エントリ一覧（タイムライン） |
| POST | `/api/journal` | 日誌エントリ作成 |
| PUT | `/api/journal/:id` | 日誌エントリ更新（本人のみ） |
| DELETE | `/api/journal/:id` | 日誌エントリ削除（本人のみ） |
| POST | `/api/emotion` | 感情データ記録 |
| PUT | `/api/emotion/:id` | 感情データ更新 |
| GET | `/api/emotion/timeseries` | 感情スコア時系列（グラフ用） |
| GET | `/api/emotion/tag-frequency` | タグ別記録頻度（グラフ用） |
| GET | `/api/tags` | タグ一覧 |
| POST | `/api/tags` | タグ作成 |

### 管理者向け API（admin ロール必須）

| メソッド | パス | 概要 |
|---|---|---|
| GET | `/api/admin/dashboard` | 全教員ステータス一覧 |
| GET | `/api/admin/teachers/:id/emotion` | 特定教員の感情推移 |
| PUT | `/api/admin/teachers/:id/watch-flag` | 要注意フラグ設定 |
| GET | `/api/admin/alerts` | 未対応アラート一覧 |
| POST | `/api/admin/alerts/:id/close` | アラートクローズ |
| GET | `/api/admin/alerts/history` | アラート履歴 |

### システム API

| メソッド | パス | 概要 |
|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | Auth.js エンドポイント |
| POST | `/api/cron/detect-alerts` | アラート検知バッチ（Cron Secret 保護） |

---

## データモデル概要

> 詳細スキーマは機能設計（Functional Design）フェーズで定義する

### 主要テーブル

| テーブル | 概要 | テナント隔離 |
|---|---|---|
| `tenants` | 学校テナント | — |
| `users` | ユーザー（教員・管理者） | `tenant_id` |
| `journal_entries` | 日誌エントリ | `tenant_id`（RLS） |
| `emotion_records` | 感情スコア・カテゴリ | `tenant_id`（RLS） |
| `tags` | タグマスタ | `tenant_id`（RLS） |
| `entry_tags` | エントリ×タグ中間テーブル | （journal_entries 経由） |
| `alerts` | アラート | `tenant_id`（RLS） |
| `watch_flags` | 要注意フラグ | `tenant_id`（RLS） |

**RLS 設計**: `journal_entries`・`emotion_records`・`tags`・`alerts`・`watch_flags` には RLS ポリシーを設定し、`app.tenant_id` セッション変数でフィルタする。`withTenant()` がすべての DB アクセス前に自動的にセッション変数をセットする。

---

## セキュリティ設計マッピング

| SECURITY ルール | 実装箇所 |
|---|---|
| SECURITY-01（暗号化） | PostgreSQL の暗号化・HTTPS（TLS） |
| SECURITY-04（HTTPヘッダー） | Next.js `next.config.js` の `headers()` |
| SECURITY-05（入力バリデーション） | 全 API Route で Zod によるバリデーション |
| SECURITY-06（最小権限） | RoleGuard + RLS |
| SECURITY-08（IDOR防止） | サービス層の所有者 ID 検証 + RLS |
| SECURITY-11（レート制限） | API Route ミドルウェア + Cron Secret |
| SECURITY-12（セッション管理） | Auth.js の JWT・セッション有効期限 |
| SECURITY-15（フェイルセーフ） | エラーハンドラで内部情報を返さない |

---

## 参照ドキュメント

- コンポーネント詳細: `components.md`
- メソッドシグネチャ: `component-methods.md`
- サービス詳細: `services.md`
- 依存関係・ディレクトリ構造: `component-dependency.md`
