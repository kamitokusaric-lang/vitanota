# Unit-03 テックスタック決定

**作成日**: 2026-04-16

---

## 新規依存パッケージ

| パッケージ | バージョン | 用途 | 決定理由 |
|---|---|---|---|
| recharts | ^2.x | 感情傾向の折れ線グラフ描画 | ユーザー選定（Q2=A）。React 向け宣言的 API、tree-shaking 対応 |

---

## 既存テックスタック（変更なし）

Unit-01・02 で確定済みのスタックをそのまま使用。

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 14（Pages Router・TypeScript） |
| ORM | Drizzle ORM |
| 認証 | Auth.js v4（database セッション戦略） |
| バリデーション | Zod（クライアント + API 共有） |
| データフェッチ | SWR |
| テスト | Vitest + React Testing Library |
| DB | PostgreSQL 16 + RLS |

---

## スキーマ変更（新規 enum 型）

| 変更 | 内容 |
|---|---|
| `tag_type` enum | `CREATE TYPE tag_type AS ENUM ('emotion', 'context')` |
| `emotion_category` enum | `CREATE TYPE emotion_category AS ENUM ('positive', 'negative', 'neutral')` |
| `tags.type` カラム | `tag_type NOT NULL DEFAULT 'context'`（`is_emotion` を置き換え） |
| `tags.category` カラム | `emotion_category`（nullable、emotion タグのみ使用） |

Drizzle ORM の `pgEnum` で定義し、マイグレーションで既存データを変換。

---

## 採用しなかった選択肢

| 項目 | 不採用案 | 理由 |
|---|---|---|
| グラフライブラリ | Chart.js / Nivo | Recharts がユーザー選定。React 親和性・宣言的 API で十分 |
| キャッシュ | サーバー側 Cache-Control | データ量が小さく集計も軽量。キャッシュの複雑性を避ける |
| インデックス追加 | (type, category) 複合インデックス | 教員1名 90日分は最大 150行。既存インデックスで十分 |
| バンドル最適化 | next/dynamic 動的インポート | tree-shaking で十分。/dashboard/teacher は専用ページで他への影響なし |
