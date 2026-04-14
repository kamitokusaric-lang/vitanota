# コンポーネント定義

## 設計前提

- **ルーター**: Next.js Pages Router
- **レンダリング**: `getServerSideProps` で初期データ取得 + SWR でクライアント更新
- **ディレクトリ構造**: 機能別（Feature-based）
- **コンポーネント種別**: SC = サーバーサイドレンダリング対応 / CC = クライアントコンポーネント必須（インタラクション・グラフ等）

---

## 機能別コンポーネント一覧

### FEATURE: auth（認証・テナント管理）

| コンポーネント | 種別 | 責務 |
|---|---|---|
| `LoginPage` | SC | Google ログインボタンを表示。未認証ユーザーをリダイレクト |
| `TenantGuard` | SC | リクエストのテナント所属を検証し、不正アクセスを遮断 |
| `RoleGuard` | SC | ロール（teacher / admin / sysadmin）を検証し、権限外アクセスを遮断 |
| `SessionProvider` | CC | Auth.js セッションをアプリ全体に提供（_app.tsx でラップ） |

---

### FEATURE: journal（日誌記録）

| コンポーネント | 種別 | 責務 |
|---|---|---|
| `JournalTimeline` | CC | 教員の日誌エントリを新しい順にタイムライン表示。SWR で最新状態を維持 |
| `JournalEntryCard` | CC | 1件の日誌エントリを表示（日付・感情スコア・本文冒頭・タグ）。編集・削除ボタン付き |
| `JournalEntryForm` | CC | 日誌エントリの作成・編集フォーム。本文・感情スコア・感情カテゴリ・タグを入力 |
| `DeleteConfirmDialog` | CC | エントリ削除前の確認ダイアログ（FR-03-2 の確認要件） |
| `TagSelector` | CC | タグの複数選択・新規作成。既存タグはオートコンプリートで提示 |

---

### FEATURE: emotion（感情・コンディション記録）

| コンポーネント | 種別 | 責務 |
|---|---|---|
| `EmotionScoreSelector` | CC | 1〜5 段階の感情スコアをビジュアルに選択（絵文字・カラーバー等） |
| `EmotionCategorySelector` | CC | 感情カテゴリ（喜び・充実・疲労・不安・怒り等）を複数選択 |
| `EmotionScoreGraph` | CC | 感情スコアの時系列折れ線グラフ（Recharts）。週・月で期間切り替え可能 |
| `TagFrequencyChart` | CC | タグ別記録頻度の棒グラフ（Recharts）。週・月で期間切り替え可能 |

---

### FEATURE: teacher-dashboard（教員個人ダッシュボード）

| コンポーネント | 種別 | 責務 |
|---|---|---|
| `TeacherDashboardPage` | SC | 教員ダッシュボードのページコンテナ。`getServerSideProps` で初期データを取得 |
| `TeacherDashboardHeader` | SC | 教員名・今日の日付・新規記録ボタンを表示 |
| `MonthlySummary` | SC | 当月の記録件数・感情スコア平均のサマリーカード |
| `DashboardGraphSection` | CC | 感情グラフ・タグ頻度グラフをまとめたセクション（グラフは CC 必須） |

---

### FEATURE: admin-dashboard（管理者ダッシュボード・アラート）

| コンポーネント | 種別 | 責務 |
|---|---|---|
| `AdminDashboardPage` | SC | 管理者ダッシュボードのページコンテナ。`getServerSideProps` で初期データ取得。SWR で 30 秒ポーリング |
| `TeacherStatusGrid` | CC | テナント内全教員のステータスカードを一覧表示 |
| `TeacherStatusCard` | CC | 1名分の教員カード。名前・感情スコア平均・ステータスインジケーター（色分け）・要注意フラグを表示。日誌本文は表示しない |
| `TeacherDetailPanel` | CC | 特定教員の詳細パネル。感情スコア推移グラフ・要注意フラグ設定・メモ入力。日誌本文は表示しない |
| `AlertBadge` | CC | 未対応アラート件数のバッジ。SWR ポーリングで自動更新 |
| `AlertList` | CC | 未対応アラートの一覧。対象教員・発生日時・アラート種別を表示 |
| `AlertItem` | CC | 1件のアラート。「対応済み」クローズボタン付き |
| `AlertHistoryList` | CC | 対応済みアラートの履歴一覧。発生日時・対応日時・対応者を表示 |
| `WatchFlagForm` | CC | 「要注意」フラグの設定・解除フォーム。メモ入力付き |

---

### SHARED（共通コンポーネント）

| コンポーネント | 種別 | 責務 |
|---|---|---|
| `Layout` | SC | 全ページ共通のヘッダー・ナビゲーション・フッター |
| `Button` | CC | 共通ボタン（Primary / Secondary / Danger バリアント） |
| `Modal` | CC | 共通モーダルダイアログ |
| `LoadingSpinner` | CC | ローディング表示 |
| `ErrorMessage` | SC/CC | エラーメッセージ表示（SECURITY-09：内部情報を露出しない） |
| `EmptyState` | SC | データが存在しない場合の空状態表示 |
