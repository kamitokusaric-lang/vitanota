# access-distribution (利用分析)

> system_admin が「いつ・どの機能が・どれだけ使われたか」を見るための分布ダッシュボード。利用回数の集計は業務メトリクスであり踏み絵にならない ([PHILOSOPHY §4.1](../../PHILOSOPHY.md))。

- **src**: `src/features/access-distribution/`
- **粒度**: overview 1 枚
- **OpenAPI**: **対象外** (`/api/system/*` は IGNORE)

## 何ができるか (system_admin)

機能別の利用分布をバブルチャート (日付 × 時間帯 × 件数) で表示:

- **UU** (unique user)、**AI 整理** (quick_capture)、**日々ノート**、**タスク** touch/完了、**カレンダー操作** (種別別)
- 用途: 教員アクセス集中時の incident 照合、PAM 障害との相関分析

## 集計の仕組み

`lib/aggregator.ts` が JST 日付 × 24 時間のグリッドを 0 埋め初期化し、各 `*UsageRepository` の集計結果をマージする。`withSystemAdmin()` で全テナント横断。LAUNCH_DATE (2026-05-07) 以前の内部テスト期間ノイズはデフォルト除外。

表示は `MetricBubbleChart.tsx` (2026-05-30 にヒートマップから移行)。

## 踏み絵

- 集計するのは**利用回数**のみ。日々ノートは投稿数だけ数え、本文・感情には触れない (情緒データではない)。
- 個人の利用パターンを「評価」する用途ではなく、システム健全性・障害相関を見るための業務メトリクス。

## API

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/system/access-distribution` | 全メトリクス集計 (start/end, 1〜90 日) |

system_admin 限定。`/api/system/*` は OpenAPI 対象外。

## 横断依存

- 集計元: 各機能の利用イベント (ai-chat / journal / tasks / calendar)
- AI 改善指標 (ai-analytics) は [features/system](../system/overview.md) 側、同ページに統合表示
