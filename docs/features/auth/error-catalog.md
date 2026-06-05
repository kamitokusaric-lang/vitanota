# auth — 認証エラーカタログ

> 親: [overview.md](./overview.md)。**メッセージの一元管理 (正本) は `src/features/auth/lib/error-messages.ts` の `getErrorMessage()`。**
> 本ファイルはエラー 25 種のカテゴリ俯瞰。個別コードの最新文言はコードを見る。

> 設計原則: ユーザー向け文言は、コードから実発生原因を確認してから書く (根拠のない推測を書かない)。

## カテゴリ分布

| 領域 | 数 | 代表コード | 主な原因 |
|---|---|---|---|
| User-side | 3 | INVALID_RESPONSE, AccessDenied | sessionStorage 破棄・認可拒否・複数タブ同時ログイン |
| Google OAuth | 8 | INVALID_TOKEN, server_error | id_token 検証失敗・Google API エラー・スロットリング |
| Lambda Proxy | 3 | invalid_json, missing_params | ブラウザ↔Lambda 通信失敗・body 破損 |
| OAuth 標準 (RFC 6749) | 7 | invalid_grant, redirect_uri_mismatch | 認可コード期限切れ・PKCE 不一致・Config 不備 |
| App-server | 2 | VALIDATION_ERROR, UNKNOWN | リクエスト形式ミス・想定外 |
| DB | 1 | NOT_INVITED | 招待未済・Google メール≠招待先メール |
| Network | 1 | Failed to fetch | 接続断・CORS ブロック |

## 代表例

- **INVALID_RESPONSE**: sessionStorage がフロー中にクリアされた (タブ閉じ等)。→「ログイン情報が古くなりました。もう一度…」
- **INVALID_TOKEN**: `GOOGLE_CLIENT_ID` と `NEXT_PUBLIC_GOOGLE_CLIENT_ID` のズレで `aud` 不一致、または bundled JWKS が Google 鍵ローテ後に古い、または `email_verified=false`。
- **TOKEN_EXCHANGE_FAILED:invalid_grant**: 認可コードの期限切れ (フロー中に放置) または同一 code の二重交換。→「ログインの有効期限が切れました…」
- **NOT_INVITED**: 招待前のユーザーがログインを試みた、または Google メールが招待先と違う。→「このメールアドレスは登録されていません。招待リンクから…」
- **TOKEN_EXCHANGE_FAILED:HTTP_503**: Lambda が非 200 応答。→「認証サーバと通信できませんでした…」

## メッセージ解決ロジック

`getErrorMessage(code)`:
1. `TOKEN_EXCHANGE_FAILED:<detail>` を detail マップ → `HTTP_<status>` fallback → network regex fallback → raw 含む fallback
2. `BASIC_MESSAGES` lookup (独自 + NextAuth + OAuth pass-through)
3. 最終 fallback → UNKNOWN

詳細カタログ (発生源行・JSON) は当面 `../../../aidlc-docs/_archive/` の旧 auth-error-catalog を参照 (凍結資産)。
