# Unit-01 ビジネスルール

## 認証・セッション

### BR-AUTH-01: 招待なし登録禁止
- Google OAuth でログインしようとしたユーザーのメールが `users` テーブルに存在しない場合、ログインを拒否する
- Auth.js の `signIn` コールバックで `return false` を返す
- エラーメッセージ: 「アカウントが見つかりません。招待リンクからサインアップしてください。」

### BR-AUTH-02: セッション有効期限
- セッションは最終アクティビティから **24時間** で期限切れとなる（スライディングウィンドウ）
- Auth.js の `session.maxAge = 24 * 60 * 60`（秒）で設定
- リクエストごとにセッションを更新: `session.updateAge = 24 * 60 * 60`

### BR-AUTH-03: JWT ペイロードの必須項目
- JWT には必ず `userId`・`tenantId`・`roles`・`tenantStatus` を含める
- `roles` が空の場合、アクセスを拒否する

### BR-AUTH-04: ログアウト時のセッション完全無効化
- ログアウト時はサーバーサイドセッションを無効化し、クッキーを削除する
- ブラウザの「戻る」ボタンで保護ページにアクセスできないようにする

---

## テナント管理

### BR-TENANT-01: テナント作成権限
- `tenants` テーブルへの INSERT は `system_admin` ロールを持つユーザーのみ実行できる
- school_admin・teacher は実行不可（API レベルで 403 を返す）

### BR-TENANT-02: スラグの一意性
- テナントスラグは英数字・ハイフンのみ使用可（正規表現: `^[a-z0-9-]+$`）
- 最小 3 文字・最大 50 文字
- 重複するスラグでのテナント作成は拒否する

### BR-TENANT-03: テナント停止の影響範囲
- `tenants.status = 'suspended'` の場合:
  - GET リクエスト → 通常通り処理する（読み取り可）
  - POST / PUT / DELETE リクエスト → **423 Locked** を返す
  - エラーレスポンス: `{ error: 'TENANT_SUSPENDED', message: 'このテナントは現在停止中です' }`
- 停止はテナント内の全ロールに適用される（school_admin・teacher ともに書き込み不可）

### BR-TENANT-04: テナント再有効化権限
- 停止中テナントの再有効化（`status = 'active'`）は `system_admin` のみ実行可能

### BR-TENANT-05: テナント削除禁止（MVP）
- MVP ではテナントの物理削除は実装しない
- 停止（suspended）状態が最終的な非活性化手段

---

## 招待

### BR-INVITE-01: 招待トークンの有効期限
- 招待トークンは発行から **7日間** 有効
- `expires_at <= now()` の場合、招待リンクは無効として拒否する
- エラーメッセージ: 「招待リンクの有効期限が切れています。再度招待を依頼してください。」

### BR-INVITE-02: 招待トークンの使い捨て
- 1つの招待トークンは1回のみ使用可能
- `used_at IS NOT NULL` の場合、招待リンクは使用済みとして拒否する

### BR-INVITE-03: 招待権限の範囲
- system_admin: 任意テナントへ teacher・school_admin を招待可能
- school_admin: 自テナント内の teacher・school_admin のみ招待可能
- teacher: 招待の発行は不可

### BR-INVITE-04: メールアドレスの重複招待
- 同一テナント内で同じメールアドレスへの重複招待（未使用トークンが存在する場合）は上書き可能
  - 既存の未使用トークンを無効化し、新しいトークンを発行する

### BR-INVITE-05: 既存ユーザーへの招待（複数ロール）
- 既にシステムに登録済みのユーザーを別テナントまたは別ロールで招待した場合:
  - 新しい `user_tenant_roles` レコードを追加する（既存レコードは保持）
  - 同一テナント・同一ロールの重複は `UNIQUE` 制約でブロック

---

## ロール・権限

### BR-ROLE-01: ロールの組み合わせ制限
- 有効な組み合わせ: teacher + school_admin（同一テナント内）
- 無効な組み合わせ: system_admin + teacher、system_admin + school_admin
  - system_admin は tenant_id = NULL であるため、テナント固有ロールとの併用不可

### BR-ROLE-02: system_admin のテナント非所属
- system_admin の `user_tenant_roles.tenant_id` は `NULL`
- system_admin は `withTenant()` を使用せずに全テナントのデータを管理する専用 API を使用する

### BR-ROLE-03: ロール別デフォルトリダイレクト
- ログイン後のリダイレクト先:
  - roles に `school_admin` を含む → `/dashboard/admin`
  - roles が `teacher` のみ → `/dashboard/teacher`
  - roles が `system_admin` → `/admin/tenants`（システム管理画面）
- 複数ロールユーザー（teacher + school_admin）はナビゲーションで切り替え可能

### BR-ROLE-04: ページアクセス制御
- `/dashboard/teacher` および `/api/journal/*`・`/api/emotion/*`: `teacher` ロール必須
- `/dashboard/admin` および `/api/admin/*`: `school_admin` ロール必須
- `/admin/*` および `/api/system/*`: `system_admin` ロール必須
- ロール不足の場合: 403 Forbidden を返す

---

## セキュリティ

### BR-SEC-01: レート制限（SECURITY-11）
- `/api/auth/signin` エンドポイント: **IP ごとに 10回/分** までの試行を許可
- 超過した場合: 429 Too Many Requests を返す
- 実装: `src/shared/lib/rate-limit.ts`（メモリベース、MVPスコープ）

### BR-SEC-02: HTTP セキュリティヘッダー（SECURITY-04）
- `next.config.js` の `headers()` で全ページに設定:

| ヘッダー | 値 |
|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` |

### BR-SEC-03: クッキーセキュリティ（SECURITY-12）
- Auth.js セッションクッキーは `HttpOnly`・`Secure`・`SameSite=Lax` で設定
- 開発環境では `Secure` を除く（HTTP 対応のため）

### BR-SEC-04: エラーレスポンスの情報漏洩防止（SECURITY-15）
- API エラーレスポンスはエラーコードと汎用メッセージのみ返す
- スタックトレース・DB エラー詳細・内部パス等はクライアントに返さない
- 形式: `{ error: 'ERROR_CODE', message: '...' }`

### BR-SEC-05: 入力バリデーション（SECURITY-05）
- テナント名・スラグ・招待メールアドレスは API 受信時に Zod スキーマでバリデーション
- バリデーションエラーは 400 Bad Request で返す

### BR-SEC-06: 構造化ログ（SECURITY-03）
- 認証イベント（ログイン成功・失敗・ログアウト）は必ず構造化ログに記録する
- ログ形式: `{ timestamp, requestId, level, event, userId?, tenantId?, ip? }`
- PII（メールアドレス等）はログに含めない

---

## バリデーションルール

| フィールド | ルール |
|---|---|
| tenant.name | 1〜100文字、空白のみ禁止 |
| tenant.slug | 3〜50文字、`^[a-z0-9-]+$` |
| invitation.email | RFC 5322 準拠のメール形式 |
| invitation.role | 'teacher' または 'school_admin' のみ |
| user.name | 1〜100文字 |
