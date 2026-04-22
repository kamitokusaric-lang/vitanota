# 認証エラーコード・カタログ

**目的**: 認証フロー中にユーザー画面に表示されるエラーコードの**仕様書**。実装の一元管理場所は `src/features/auth/lib/error-messages.ts`。

**対象フロー**: Google OAuth ログイン (Authorization Code Flow + PKCE, Lambda Proxy 経由)

**関連ドキュメント**:
- [`construction/user-onboarding-flow.md`](user-onboarding-flow.md) — 招待フロー仕様
- [`operations/session-handoff-20260420.md`](../operations/session-handoff-20260420.md) — Lambda Proxy 導入経緯

**文言設計ポリシー**:
- メッセージにはユーザーが取れる**具体的アクション**を含める (再試行 / 設定確認 / 管理者連絡)
- **根拠のない推測は書かない** (例: 「時計のずれが原因の可能性」等)。実発生原因はコード経路から確認して「実発生原因 (頻度順)」列に事実として記載する
- 未知パターンは `raw detail` を画面に残すことで診断 handle を温存する

---

## 領域の分類

| 領域 | 意味 |
|---|---|
| **User-side** | ブラウザ状態・ユーザー操作 (sessionStorage 破棄・認可拒否・CSRF 疑い) |
| **Google** | Google OAuth API の応答由来 (id_token 検証失敗・OAuth 標準エラー・Google 側障害) |
| **Lambda Proxy** | `vitanota-prod-google-token-proxy` Lambda の内部エラー |
| **App-server** | Next.js API route (`/api/auth/google-signin` 等) の内部ロジック |
| **DB** | データベース状態 (招待未済等) |
| **Config** | 環境変数 / Secrets Manager / Google Cloud Console の設定不備 |
| **Network** | ブラウザ ↔ サーバ / Lambda ↔ Google の通信失敗 |

---

## エラーコード一覧 (reachable)

### 基本エラー (TOKEN_EXCHANGE_FAILED 以外)

| # | コード | 発生源 (file:line) | 領域 | 実発生原因 (頻度順) | ユーザー表示メッセージ |
|---|---|---|---|---|---|
| 1 | `INVALID_RESPONSE` | `pages/auth/google-callback.tsx:49` | User-side | 1. sessionStorage がフロー中にクリアされた (タブ閉じ・別タブでの再ログイン・ブラウザ再起動)<br>2. 複数タブ/ウィンドウで同時にログインを試みた<br>3. 認証 URL を手動でコピペして直接開いた<br>4. CSRF 攻撃 (極稀) | ログイン情報が古くなりました。もう一度ログインボタンを押してやり直してください。 |
| 2 | `SERVER_CONFIG_ERROR` | `pages/auth/google-callback.tsx:59`,<br>`pages/api/auth/google-signin.ts:51` | Config | 1. デプロイ時の env var 設定漏れ (`NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL` / `GOOGLE_CLIENT_ID`)<br>2. Secrets Manager の値欠損 (極稀、通常はデプロイ段階で気づく) | サーバ設定に不備があります。管理者までご連絡ください。 |
| 3 | `INVALID_TOKEN` | `pages/api/auth/google-signin.ts:61` | Google / Config | 1. サーバの `GOOGLE_CLIENT_ID` とフロントの `NEXT_PUBLIC_GOOGLE_CLIENT_ID` のズレで `aud` 不一致 (Config 起因)<br>2. bundled `google-jwks.json` が Google 鍵ローテ後に古いまま (Config 起因、`pnpm fetch-jwks` + 再デプロイで解消)<br>3. `email_verified === false` (個人 Google アカウントで稀)<br>4. id_token 改竄/破損 (極稀) | ログインできませんでした。もう一度お試しください。繰り返し発生する場合は管理者までご連絡ください。 |
| 4 | `NOT_INVITED` | `pages/api/auth/google-signin.ts:89` | DB | 1. 招待前のユーザーがログインを試みた (オンボーディング順序ミス)<br>2. 招待済だが Google アカウントのメアドが招待先と違う<br>3. 退会・削除後のユーザー (`deleted_at` セット済) | このメールアドレスは登録されていません。招待リンクからサインアップしてください。見つからない場合は招待元にご確認ください。 |
| 5 | `AccessDenied` | Google `?error=access_denied` pass-through (`pages/auth/google-callback.tsx:38`) | User-side | 1. ユーザーが Google 同意画面で「キャンセル」「許可しない」を押した<br>2. Google Workspace 管理者が該当 OAuth アプリをブロックしている | Google アカウントの利用許可が得られませんでした。もう一度ログインし、同意画面で「許可」を選択してください。 |
| 6 | `VALIDATION_ERROR` | `pages/api/auth/google-signin.ts:40` | App-server | 1. フロント実装バグ (idToken が空・短すぎる等)<br>2. 不正な手動リクエスト (攻撃試行等、極稀) | リクエストが正しくありません。ページを再読み込みしてからもう一度お試しください。 |
| 7 | `UNKNOWN` | `pages/auth/google-callback.tsx:111,113` | App-server / fallback | 1. `/api/auth/google-signin` が想定外のエラー形式で応答した (バグ)<br>2. fetch が投げた非 Error オブジェクト | ログインに失敗しました。もう一度お試しください。繰り返し発生する場合はサポートにご連絡ください。 |

### Google 側エラー (pass-through, `pages/auth/google-callback.tsx:36-39`)

Google の `/authorize` エンドポイントが `?error=<code>` を返した場合。OAuth 2.0 仕様 (RFC 6749 §4.1.2.1) に定義。

| # | コード | 領域 | 実発生原因 (頻度順) | ユーザー表示メッセージ |
|---|---|---|---|---|
| 8 | `access_denied` | User-side | → `#5 AccessDenied` と同じ扱い | → `#5` と同じメッセージ |
| 9 | `server_error` | Google | 1. Google 認証サーバの一時的障害 | Google 認証サーバで一時的なエラーが発生しています。数分待ってからもう一度お試しください。 |
| 10 | `temporarily_unavailable` | Google | 1. Google 側のスロットリング・メンテナンス | Google 認証サーバが混雑しています。少し時間を置いてからもう一度お試しください。 |
| 11 | Google その他 `?error=<raw>` | Google | 1. 実装変更で OAuth 仕様準拠外パラメータを送った<br>2. Google 側が新 error code を追加した | Google 認証でエラー (`<raw>`) が発生しました。もう一度お試しください。繰り返す場合は管理者にご連絡ください。 |

### TOKEN_EXCHANGE_FAILED:&lt;detail&gt;

コード形式は `TOKEN_EXCHANGE_FAILED:<detail>`。`<detail>` で分岐。発生源は `pages/auth/google-callback.tsx:80,86,91`。

#### Lambda Proxy 固有 detail

| # | detail | 発生源 Lambda コード (file:line) | 領域 | 実発生原因 (頻度順) | ユーザー表示メッセージ |
|---|---|---|---|---|---|
| 12 | `invalid_json` | `infra/lib/data-shared-stack.ts:181` | Lambda Proxy / App-server | 1. フロント実装バグで body が JSON 不正<br>2. ブラウザ ↔ Lambda 間で body が途中で破損 (極稀) | 通信エラーが発生しました。ページを再読み込みしてからもう一度お試しください。 |
| 13 | `missing_params` | `infra/lib/data-shared-stack.ts:186` | App-server | 1. フロントが `code` または `codeVerifier` を送り忘れ (実装バグ)<br>2. ネットワークで JSON 一部欠落 (極稀) | ログイン情報が不足しています。最初からログインをやり直してください。 |
| 14 | `invalid_google_response` | `infra/lib/data-shared-stack.ts:164` | Google | 1. Google /token が JSON 以外を返した (Google 側障害時に HTML エラーページが返るケース) | Google との通信に問題がありました。しばらく待ってからもう一度お試しください。 |

#### Google OAuth 仕様の標準 detail (Google /token が返す error code)

| # | detail | 領域 | 実発生原因 (頻度順) | ユーザー表示メッセージ |
|---|---|---|---|---|
| 15 | `invalid_grant` | Google / User-side | 1. ユーザーがログインフロー中に 10 分以上手を止めた (authorization code 期限切れ)<br>2. ユーザーが同じ code で複数回交換を試みた (code 使い切り)<br>3. サーバ時刻ズレ (超稀、AWS 環境では実質発生しない) | ログインの有効期限が切れました。もう一度最初からログインしてください。 |
| 16 | `invalid_request` | Google / App-server | 1. フロントが不正な `redirect_uri` を渡した (実装バグ)<br>2. PKCE の verifier と challenge の対応がズレた (実装バグ) | 認証リクエストに問題があります。ブラウザを再読み込みしてからもう一度ログインしてください。 |
| 17 | `invalid_client` | Google / Config | 1. Secrets Manager の `client_secret` が Google Cloud Console の値と不一致<br>2. Client Secret ローテ直後で Lambda が古い値を cache してる | サーバ側の認証設定に問題があります。管理者までご連絡ください。 |
| 18 | `redirect_uri_mismatch` | Config | 1. Google Cloud Console の「承認済みリダイレクト URI」リストに本番 URL の登録漏れ<br>2. プロトコル / ドメイン / path のどこかが微妙にズレてる (http vs https / www. の有無) | 認証のリダイレクト設定に問題があります。管理者までご連絡ください。 |
| 19 | `invalid_scope` | App-server | 1. OAuth リクエストに `openid / email / profile` 以外のスコープを追加した (実装変更ミス) | 要求した認証権限が不正です。管理者までご連絡ください。 |
| 20 | `unauthorized_client` | Google / Config | 1. Google Cloud Console で OAuth Client が無効化された<br>2. 本番プロジェクトと異なる test プロジェクトの `client_id` を使った | このアプリケーションは認証を許可されていません。管理者までご連絡ください。 |
| 21 | `unsupported_grant_type` | App-server | 1. Lambda が `authorization_code` 以外の `grant_type` を送った (実装バグ) | 認証方式の設定に問題があります。管理者までご連絡ください。 |

#### フロントエンド fallback detail

| # | detail | 発生源 (file:line) | 領域 | 実発生原因 (頻度順) | ユーザー表示メッセージ |
|---|---|---|---|---|---|
| 22 | `no_id_token` | `pages/auth/google-callback.tsx:86` | Google / App-server | 1. Google が `id_token` を返さなかった (scope に `openid` が入ってない等、実装バグ)<br>2. Lambda Proxy の response 組み立てバグ | Google からの応答が不完全でした。もう一度ログインしてください。 |
| 23 | `HTTP_<status>` | `pages/auth/google-callback.tsx:79` | Network / Lambda Proxy | 1. Lambda が非 200 応答 + `error` field 不在 (実装バグ or 想定外エラー)<br>2. Function URL レイヤで 5xx 発生 | 認証サーバと通信できませんでした (HTTP `<status>`)。もう一度お試しください。 |
| 24 | `Failed to fetch` / その他 Error.message | `pages/auth/google-callback.tsx:90` | Network | 1. ユーザーのインターネット接続断<br>2. ブラウザが Lambda URL を CORS で弾いた (設定ミス、過去事例あり)<br>3. CSP `connect-src` で Lambda URL が許可されてない | インターネット接続が確認できません。接続状態を確認してからもう一度お試しください。 |
| 25 | 上記以外の未マップ detail | — | fallback | 1. Google OAuth 仕様の新エラーコード追加 (将来対応)<br>2. Lambda Proxy が返す未定義 error code | 通信エラーが発生しました (詳細: `<raw>`)。もう一度お試しください。繰り返す場合はサポートにご連絡ください。 |

---

## 到達不可 / 削除済

以下は NextAuth の OAuth フロー経由でのみ発生するが、本プロジェクトは `auth-options.ts` で `providers: []` としているため **実質到達しない**。コードから削除する。

| コード | 元の用途 | 削除理由 |
|---|---|---|
| `OAuthAccountNotLinked` | NextAuth の Account Linking 失敗 | OAuth provider 未使用 |
| `OAuthSignin` | NextAuth の OAuth 開始失敗 | 同上 |
| `OAuthCallback` | NextAuth の OAuth callback 失敗 | 同上 |
| `OAuthCreateAccount` | NextAuth の Account 作成失敗 | 同上 |
| `EmailCreateAccount` | NextAuth の Email Provider 失敗 | Email Provider 未使用 |
| `Callback` | NextAuth の callback generic | 同上 |
| `CredentialsSignin` | NextAuth の Credentials Provider 失敗 | Credentials Provider 未使用 |

---

## 文言の統一ルール

| パターン | 末尾の定型 | 該当 # |
|---|---|---|
| ユーザーが自力で対処可能 | 「〜してから、もう一度お試しください」 | 1, 3, 4, 5, 6, 12, 13, 15, 16, 22, 23, 24 |
| 時間を置くべき | 「しばらく / 数分待ってからもう一度お試しください」 | 9, 10, 14 |
| 管理者対応 (Config 起因) | 「管理者までご連絡ください」 | 2, 3, 11, 17, 18, 19, 20, 21 |
| サポート対応 (不明・fallback) | 「繰り返し発生する場合はサポートにご連絡ください」 | 3, 7, 25 |

**「管理者」と「サポート」の使い分け** (MVP では両方 chimo 宛だが将来分離に備えた語彙設計):
- 管理者: vitanota 導入先学校の system_admin (設定・招待の問題)
- サポート: vitanota 運営 (不明・開発元起因)

---

## 実装上のルール

1. **一元管理**: 全エラー文言は `src/features/auth/lib/error-messages.ts` の `getErrorMessage(code)` 関数経由で取得する。`pages/auth/signin.tsx` と `pages/auth/google-callback.tsx` は両方ともここを参照する。
2. **TOKEN_EXCHANGE_FAILED パース**: `:` で split して `<prefix>:<detail>` に分解、detail を別 map で lookup。未マップ時は `#25 fallback` メッセージで raw を残す。
3. **診断情報の温存**: 未知 pattern では raw detail を画面に残す。これにより chimo が画面キャプチャから原因特定でき、CloudWatch Logs との 2 面作戦が成立する。
4. **ログへの出力**: エラーコードは CloudWatch Logs (Lambda Proxy / App Runner) にも全て記録済。画面に出ない detail も追跡可能。
5. **更新条件**: Google OAuth API の仕様変更 / 新 error code 発見時 / 実発生原因の仮説が実データで覆った時は、本ドキュメントと `error-messages.ts` を同時更新する。

---

## 変更履歴

| 日付 | 変更 | 契機 |
|---|---|---|
| 2026-04-22 | 初版作成 (Phase B TOKEN_EXCHANGE plain 化の代替策として、日本語翻訳 + 実発生原因列を設けた仕様書に刷新) | chimo 「エラーメッセージは表示しておくで良くない？」+ 「時計ズレ原因の記述は根拠ある？」の二連指摘 |
