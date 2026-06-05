# dashboard (学校統計)

> school_admin が学校全体の状態を俯瞰する場所。組織状態の層であって、個々の教員の感情を覗く場所ではない ([PHILOSOPHY §3](../../PHILOSOPHY.md))。

- **src**: `src/features/dashboard/`
- **対応要件**: FR-05 (教員ダッシュボード), FR-06 (管理者ダッシュボード)
- **粒度**: overview 1 枚
- **OpenAPI**: **対象外** (`/api/school/*` は IGNORE: 学校レポート)

## 何ができるか (school_admin)

3 タブで学校全体を集計表示する (個人特定情報は返さない・集計値のみ):

- **ムード分析** (`mood-analysis`): 全校の mood 5 段階の日別積み上げ・前期比トレンド
- **教員ワークロード** (`teachers-workload`): 教員別の未完了タスク件数推移 (業務量の客観指標)
- **全校ウェルネス** (`wellness`): 感情タグの positive/negative/neutral 集計・アクティブ教員数

## 可視性と踏み絵

| ロール | mood 分析 | wellness | workload | 個人の感情本文 |
|---|---|---|---|---|
| school_admin | 集計可視 | 集計可視 | 名前+件数 | **不可** |
| teacher | 不可 | 不可 | 不可 | 本人のみ |

- 集計対象は公開・非公開を問わず全投稿だが、**個人を特定できる粒度では返さない**。
- school_admin の唯一の特権は「学校エンゲージメントの俯瞰」。個々の mood・感情本文へのアクセスは [PHILOSOPHY §4.0 (観測されると壊れる)](../../PHILOSOPHY.md) を踏むため不可。
- タスク件数 (業務量) は客観指標として教員名つきで開示してよい (既にカンバンで可視化済み・情緒データではない)。

## API

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/school/mood-analysis` | 全校 mood 別分析 |
| GET | `/api/school/teachers-workload` | 教員別未完了タスク推移 |
| GET | `/api/school/wellness` | 全校感情集計 |

すべて school_admin 限定、`Cache-Control: private, no-store`。`/api/school/*` は OpenAPI 対象外。集計ロジックは `lib/schoolDashboardService.ts`、期間は JST。

## 横断依存

- 集計元データ → [features/journal](../journal/overview.md) (mood/感情), [features/tasks](../tasks/overview.md) (workload)
- 利用動向の分析は別機能 → [features/access-distribution](../access-distribution/overview.md)
- 2 層構造の境界 → [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md)
