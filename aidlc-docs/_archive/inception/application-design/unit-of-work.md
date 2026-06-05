# ユニット定義

## 設計前提

- **アーキテクチャ**: モノリス（単一 Next.js アプリ）
- **開発順序**: Unit-01 → Unit-02 → Unit-03 → Unit-04（教員体験優先）
- **完了基準**: 各ユニット完了時点で単体動作する状態（ブラウザで実際に操作できる）
- **共通基盤**: `src/shared/` を Unit-01 で先行実装し、以降のユニットが利用する

---

## Unit-01：認証・テナント基盤

**スコープ**: 認証・セッション管理・マルチテナント基盤・共通インフラ

### 責務

- Google OAuth によるログイン・ログアウト
- Auth.js セッション管理（JWT・有効期限）
- テナント（学校）の作成・停止（システム管理者）
- ユーザーとテナントの紐づけ
- **`src/shared/` の先行実装**（全ユニットが依存する基盤）
  - `db.ts`（Drizzle ORM クライアント・`withTenant()` ラッパー）
  - `auth.ts`（Auth.js 設定）
  - 共通 UI コンポーネント（`Layout`・`Button`・`Modal`・`ErrorMessage` 等）
- DB スキーマの初期設定（`tenants`・`users` テーブル・RLS 有効化）
- セキュリティ基盤（HTTPセキュリティヘッダー・入力バリデーション基盤・レート制限）

### 完了時点でできること

```
✅ Google アカウントでログインできる
✅ ログアウトするとセッションが無効化される
✅ 未認証状態でダッシュボードにアクセスしようとするとログイン画面にリダイレクトされる
✅ システム管理者がテナントを作成できる
✅ 異なるテナントのユーザーが互いのデータにアクセスできないことを確認できる（テナント隔離テスト通過）
```

### 主要成果物

- `src/features/auth/`（TenantService・RoleService・コンポーネント）
- `src/shared/lib/db.ts`・`auth.ts`
- `src/shared/components/`（共通 UI）
- `db/schema.ts`（tenants・users テーブル）
- `db/migrations/`（RLS ポリシー含む初期マイグレーション）
- `pages/auth/signin.tsx`・`pages/api/auth/[...nextauth].ts`

---

## Unit-02：日誌・感情記録コア

**スコープ**: 日誌エントリ CRUD・感情スコア・感情カテゴリ・タグ・タイムライン表示

### 責務

- 日誌エントリの作成・編集・削除
- 感情スコア（1〜5）の記録・更新
- 感情カテゴリ（複数選択）の記録・更新
- タグの作成・付与・管理
- 教員ダッシュボードのタイムライン表示（エントリ一覧）
- 日誌エントリの RLS による教員本人限定アクセス

### 完了時点でできること

```
✅ 教員がログインしてダッシュボードを開ける
✅ 新しい日誌エントリを作成できる（本文・感情スコア・感情カテゴリ・タグ）
✅ 作成したエントリがタイムラインに表示される
✅ エントリを編集・削除できる（本人のみ）
✅ タグを作成・付与できる
✅ 他の教員のエントリが表示されないことを確認できる
```

### 主要成果物

- `src/features/journal/`（JournalService・TagService・コンポーネント・フック）
- `src/features/emotion/`（EmotionService・コンポーネント）
- `db/schema.ts`（journal_entries・emotion_records・tags・entry_tags テーブル追加）
- `pages/dashboard/teacher.tsx`（タイムライン表示）
- `pages/api/journal/`・`pages/api/emotion/`・`pages/api/tags/`

---

## Unit-03：教員ダッシュボード

**スコープ**: 感情スコア時系列グラフ・タグ別頻度グラフ・月次サマリー

### 責務

- 感情スコアの時系列折れ線グラフ（週・月）
- タグ別記録頻度の棒グラフ（週・月）
- 当月の記録件数・感情スコア平均のサマリーカード
- グラフのインタラクティブな期間切り替え（週・月）
- EmotionService の集計メソッドを利用（Unit-02 の成果物に依存）

### 完了時点でできること

```
✅ 教員ダッシュボードで感情スコアの推移グラフを閲覧できる
✅ 週・月で表示期間を切り替えられる
✅ タグ別の記録頻度グラフを閲覧できる
✅ 月次サマリー（記録件数・感情平均）を確認できる
✅ 他の教員のデータがグラフに混入しないことを確認できる
```

### 主要成果物

- `src/features/teacher-dashboard/`（コンポーネント・フック）
- `src/features/emotion/components/`（EmotionScoreGraph・TagFrequencyChart を Unit-02 から拡張）
- `pages/api/emotion/timeseries.ts`・`pages/api/emotion/tag-frequency.ts`

---

## Unit-04：管理者ダッシュボード・アラート

**スコープ**: 全教員ステータス一覧・アラート自動生成・アラート管理・要注意フラグ

### 責務

- テナント内全教員のステータスカード一覧（色分けインジケーター）
- 特定教員の感情スコア推移の詳細表示（日誌本文は非表示）
- 要注意フラグの設定・解除（メモ付き）
- アラートの自動生成（毎日深夜の定期バッチ）
  - 感情スコア連続低下の検知
  - 記録途絶の検知
- アラートの一覧表示・クローズ管理
- アラート履歴の閲覧
- SWR 30秒ポーリングによる管理者画面の自動更新

### 完了時点でできること

```
✅ 管理者（校長）がダッシュボードで全教員のステータスを一覧確認できる
✅ 特定教員の感情スコア推移グラフを確認できる（日誌本文は表示されない）
✅ 要注意フラグを設定できる
✅ アラートがバッジとして表示される
✅ アラートを「対応済み」にクローズできる
✅ アラート履歴を参照できる
✅ 教員ロールで管理者 API を叩くと 403 が返ることを確認できる
✅ 管理者が日誌本文テキストを取得できないことを確認できる
✅ → MVP 完成
```

### 主要成果物

- `src/features/admin-dashboard/`（AdminDashboardService・AlertService・AlertDetectionJob・コンポーネント・フック）
- `db/schema.ts`（alerts・watch_flags テーブル追加）
- `pages/dashboard/admin.tsx`（SWR ポーリング）
- `pages/api/admin/`（全管理者 API）
- `pages/api/cron/detect-alerts.ts`

---

## コード組織化方針（グリーンフィールド）

```
vitanota/                     ← Next.js アプリルート
├── src/
│   ├── features/             ← 機能別（Unit ごとに追加）
│   │   ├── auth/             ← Unit-01
│   │   ├── journal/          ← Unit-02
│   │   ├── emotion/          ← Unit-02（グラフは Unit-03 で拡張）
│   │   ├── teacher-dashboard/ ← Unit-03
│   │   └── admin-dashboard/  ← Unit-04
│   └── shared/               ← Unit-01 で先行実装・全ユニットが利用
│       ├── lib/
│       │   ├── db.ts         （Drizzle + withTenant）
│       │   └── auth.ts       （Auth.js 設定）
│       └── components/       （共通 UI コンポーネント）
├── pages/                    ← Next.js Pages Router
│   ├── api/                  ← API Routes（Unit ごとに追加）
│   └── dashboard/
├── db/
│   ├── schema.ts             ← Drizzle スキーマ（全 Unit で追記）
│   └── migrations/           ← Drizzle Kit 生成（Unit ごとに追加）
└── drizzle.config.ts
```

**ルール**:
- アプリケーションコードは `vitanota/` 直下（`aidlc-docs/` には置かない）
- 各ユニットの開発で追加するファイルは上記の対応ディレクトリに配置する
- `shared/` への追加は Unit-01 を基本とし、以降のユニットで必要が生じた場合のみ追記する
