# Unit-01 ビジネスロジックモデル

## 概要

Unit-01 は vitanota の全機能の基盤となる認証・テナント管理を担う。
以下のビジネスプロセスを定義する。

---

## BP-01: ユーザーログインフロー

**トリガー**: ユーザーが「Google でログイン」ボタンをクリック

```
[1] Google OAuth 認証（Auth.js が処理）
     ↓ Google からメール・名前・画像を受け取る
[2] Auth.js signIn コールバック
     ↓ users テーブルに該当メールが存在するか確認
     ├─ 存在しない → ログイン拒否（招待なしでは登録不可）
     └─ 存在する → 続行
[3] JWT コールバック
     ↓ user_tenant_roles から roles・tenantId を取得
     ↓ tenants から tenant_status を取得
     ↓ JWT に userId・tenantId・roles・tenantStatus を埋め込む
[4] セッション確立（24時間スライディングウィンドウ）
[5] ログイン後リダイレクト
     ├─ roles に 'school_admin' を含む → /dashboard/admin
     └─ roles が 'teacher' のみ → /dashboard/teacher
```

**前提条件**: ユーザーが招待フローを完了しており、users テーブルに登録済み

---

## BP-02: 招待フロー

**トリガー**: system_admin または school_admin が招待を発行

```
[1] 招待者が対象メールアドレス・付与ロールを入力
[2] システムが invitation_tokens レコードを生成
     - token: UUID（ランダム）
     - expires_at: 発行から 7 日後
     - invited_by: 招待者の userId
[3] 招待リンク（/auth/invite?token=xxx）をメール送信
     ※ MVP では実際のメール送信は対象外。リンクをシステム管理者がコピーして手動共有
[4] 招待された人が招待リンクからアクセス
[5] 「Google でログイン」で Google OAuth 認証
[6] Auth.js signIn コールバック
     - token を検証（期限・未使用確認）
     - users レコードを作成（初回の場合）
     - user_tenant_roles レコードを作成（tenant_id・role を紐づけ）
     - invitation_tokens.used_at を現在時刻で更新
[7] セッション確立 → ロールに応じてリダイレクト
```

**招待権限**:
- system_admin → 任意テナントへ任意ロールで招待可能
- school_admin → 自テナント内の teacher・school_admin のみ招待可能
- teacher → 招待不可

---

## BP-03: テナント作成フロー

**トリガー**: system_admin がテナント作成を実行

```
[1] system_admin が学校名・スラグ（URLキー）を入力
[2] バリデーション
     - スラグの重複チェック（tenants テーブル）
     - 学校名の最大文字数確認
[3] tenants レコードを作成（status: 'active'）
[4] 作成完了（以後 school_admin の招待フローで管理者を紐づける）
```

---

## BP-04: テナント停止フロー

**トリガー**: system_admin がテナント停止を実行

```
[1] system_admin が対象テナントを選択し停止操作
[2] tenants.status を 'suspended' に更新
[3] 既存セッションは即時では無効化されない
     （次回アクセス時に JWT コールバックが tenantStatus: 'suspended' を返す）
[4] 停止中テナントのユーザーがアクセスした場合
     - GET リクエスト → 正常に返す（読み取り可）
     - POST/PUT/DELETE リクエスト → 423 Locked を返す
[5] テナント再有効化
     - system_admin のみ実行可
     - tenants.status を 'active' に戻す
```

---

## BP-05: ログアウトフロー

**トリガー**: ユーザーがナビゲーションの「ログアウト」をクリック

```
[1] Auth.js signOut() を呼び出し
[2] サーバーサイドセッション（JWT）を無効化
[3] クライアントのセッションクッキーを削除
[4] /auth/signin へリダイレクト
```

---

## BP-06: セッション検証（全リクエスト共通）

**トリガー**: 保護されたページ・API への全リクエスト

```
[1] getServerSideProps または API Route でセッションを取得
     - getServerSession(req, res, authOptions)
[2] セッションなし → 401 / /auth/signin へリダイレクト
[3] tenantStatus === 'suspended' かつミューテーション → 423 Locked
[4] ロール確認（RoleGuard）
     - 必要ロールを持たない → 403 Forbidden
[5] テナント隔離（withTenant）
     - DB アクセスは必ず withTenant(tenantId, ...) 経由
     - PostgreSQL RLS がテナントIDでフィルタリング
```

---

## セッション設計

| 項目 | 値 |
|---|---|
| 方式 | JWT（Auth.js デフォルト） |
| 有効期間 | 最終アクティビティから 24時間（スライディングウィンドウ） |
| JWT ペイロード | userId・tenantId・roles・tenantStatus |
| クッキー設定 | HttpOnly・Secure・SameSite=Lax |
| 更新タイミング | リクエストごとに `updateAge: 24 * 60 * 60` で延長 |

---

## 招待権限マトリクス

| 招待者 | 招待先テナント | 付与可能ロール |
|---|---|---|
| system_admin | 任意 | teacher・school_admin |
| school_admin | 自テナントのみ | teacher・school_admin |
| teacher | — | 招待不可 |

---

## ロール設計（複数ロール対応）

| ロール | 対象 | tenant_id |
|---|---|---|
| system_admin | SaaS 運営者 | null（テナント非所属） |
| school_admin | 校長・教頭・事務 | テナントに紐づく |
| teacher | 教員 | テナントに紐づく |

**複数ロールの組み合わせ**:
- teacher + school_admin → 有効（例：教頭が自身も日誌を記録したい場合）
- system_admin + テナントロール → 無効（system_admin はテナント非所属のため）

**複数ロールユーザーのリダイレクト**:
- roles に school_admin が含まれる → ログイン後 `/dashboard/admin` へ
- roles が teacher のみ → ログイン後 `/dashboard/teacher` へ
- ナビゲーションに「教員ビュー」「管理者ビュー」の切り替えリンクを表示
