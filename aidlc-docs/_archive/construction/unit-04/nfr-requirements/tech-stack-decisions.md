# Unit-04 テックスタック決��

**作成日**: 2026-04-17

---

## 新規依存パッケージ

なし。Unit-04 は既存のスタック（Next.js + Drizzle + SWR + Recharts）で実装可能。

---

## 既存テックスタック（変更なし）

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 14（Pages Router・TypeScript） |
| ORM | Drizzle ORM |
| 認証 | Auth.js v4（database セッション） |
| バリデーション | Zod |
| データフェッチ | SWR（自動更新なし・手動リロード） |
| グラフ | Recharts（Unit-03 コンポーネント再利用） |
| テスト | Vitest + React Testing Library |
| DB | PostgreSQL 16 + RLS |

---

## スキーマ変更

| 変更 | 内容 |
|---|---|
| `alert_type` enum | `CREATE TYPE alert_type AS ENUM ('negative_trend', 'recording_gap')` |
| `alert_status` enum | `CREATE TYPE alert_status AS ENUM ('open', 'closed')` |
| `alerts` テーブル | 新規作成（id, tenant_id, teacher_user_id, type, status, detection_context, closed_by, closed_at, created_at） |
| RLS ポリシー | school_admin + system_admin のみアクセス可能 |

---

## 採用しなかった選択肢

| 項目 | 不採用案 | 理由 |
|---|---|---|
| cron 認証 | API キー（CRON_API_KEY） | MVP は手動実行のため session 認証で十分 |
| 自動更新 | SWR refreshInterval | MVP では手動リロード（Q7=C） |
| watch_flags テーブル | 要注意フラグ用 | US-A-012 が Should 落としで不要 |
| 追加インデックス | 集計用複合インデックス | 教員 50名規模では不要 |
