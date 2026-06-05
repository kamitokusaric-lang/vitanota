# 認証とテナント境界 (RLS)

> **正本**: RLS ポリシーの定義は `migrations/0009_rls_role_separation.sql` および後続 migration。ロール定義の詳細は [role-definitions.md](./role-definitions.md)。
> 本ファイルは「境界の考え方」を述べる。具体的なポリシー文は SQL を見る。

---

## マルチテナント隔離

vitanota は 1 つの DB に複数のテナント (学校) を同居させる。隔離は**多層**で守る:

1. **接続コンテキスト**: API は `withTenantUser()` でセッションから `tenant_id` / `user_id` / role を確定し、DB 接続にセットする。
2. **RLS ポリシー**: 各テーブルに `tenant_id = current_tenant` を強制する行レベルポリシーを貼る。アプリ層がバグっても他テナントの行は見えない。
3. **API WHERE 句**: サービス層でも明示的に `WHERE tenant_id = ... AND user_id = ...` を書く (RLS との二重防御)。
4. **複合外部キー**: `(child_id, tenant_id) REFERENCES parent(id, tenant_id)` でクロステナント参照を物理的に不可能にする。

この多層構造により、IDOR (他人/他テナントのリソースへの不正アクセス) を複数の層で同時に防ぐ。

---

## 4 つのロール

| ロール | 説明 | 主な権限 |
|---|---|---|
| `system_admin` | vitanota 運営 | 横断機能 (`/api/system/*`)。所属テナントを持たない場合、通常 API は 403 |
| `school_admin` | 学校管理者 (校長等) | 組織状態の俯瞰 (学校エンゲージメント)。**個々の感情データは見られない** |
| `teacher` | 教員 | 自分の記録・タスク・相互関心の層 |
| `bootstrap` | 初期セットアップ用 | テナント作成時の暫定 |

**重要 (踏み絵)**: `school_admin` の特権は「組織状態の層」に限定される。個々の教員の mood・感情データは school_admin から不可視。これは [PHILOSOPHY §3 (2層構造)](../PHILOSOPHY.md) を RLS で物理的に守る部分である。

`system_admin` は所属の有無で挙動が変わる: 単独 (テナント未所属) なら通常 API は 403 で、横断機能は `/api/system/*` で別途提供する。`system_admin` 兼 `school_admin`/`teacher` の兼務アカウントなら通常 API も叩ける。

---

## 可視性の特殊ケース

- **日誌エントリ**: `is_public=true` はテナント内の teacher 以上に可視 (相互関心の層)。`is_public=false` は所有者のみ。公開タイムラインは `is_public` 列を露出しない VIEW (`public_journal_entries`) 経由。
- **ai_sessions** (AI 整理の中間データ): 本人 + `system_admin` のみ可視。`school_admin` には不可視 (踏み絵)。
- **タスク**: 同テナント内で可視。更新・削除は assignee or createdBy or school_admin。コメント削除は投稿者本人のみ。

---

## 認証フロー

Google OAuth (Lambda Proxy 経由) + NextAuth + DB IAM 認証。詳細フローは [features/auth/onboarding.md](../features/auth/onboarding.md) (招待フロー Step0〜5) と [features/auth/error-catalog.md](../features/auth/error-catalog.md) (認証エラー 25 種)。シーケンス図は [sequence-diagrams.md](./sequence-diagrams.md)。
