// 認証エラーコード → ユーザー表示メッセージの一元管理
//
// 仕様書: aidlc-docs/construction/auth-error-catalog.md
// 文言変更時は仕様書側も同時更新すること

// 基本エラー (独自 + NextAuth 互換名 + Google OAuth /authorize pass-through の既知分)
const BASIC_MESSAGES: Record<string, string> = {
  // 独自エラー
  INVALID_RESPONSE:
    'ログイン情報が古くなりました。もう一度ログインボタンを押してやり直してください。',
  SERVER_CONFIG_ERROR:
    'サーバ設定に不備があります。管理者までご連絡ください。',
  INVALID_TOKEN:
    'ログインできませんでした。もう一度お試しください。繰り返し発生する場合は管理者までご連絡ください。',
  NOT_INVITED:
    'このメールアドレスは登録されていません。招待リンクからサインアップしてください。見つからない場合は招待元にご確認ください。',
  INVITE_INVALID:
    '招待リンクが無効です。既に使用済みか、有効期限が切れている可能性があります。招待元にご確認ください。',
  EMAIL_MISMATCH:
    'ログインした Google アカウントが招待されたメールアドレスと一致しません。招待されたアドレスでログインしてください。',
  VALIDATION_ERROR:
    'リクエストが正しくありません。ページを再読み込みしてからもう一度お試しください。',
  UNKNOWN:
    'ログインに失敗しました。もう一度お試しください。繰り返し発生する場合はサポートにご連絡ください。',

  // NextAuth 互換名 (access_denied と同内容)
  AccessDenied:
    'Google アカウントの利用許可が得られませんでした。もう一度ログインし、同意画面で「許可」を選択してください。',

  // Google OAuth /authorize pass-through (RFC 6749 §4.1.2.1)
  access_denied:
    'Google アカウントの利用許可が得られませんでした。もう一度ログインし、同意画面で「許可」を選択してください。',
  server_error:
    'Google 認証サーバで一時的なエラーが発生しています。数分待ってからもう一度お試しください。',
  temporarily_unavailable:
    'Google 認証サーバが混雑しています。少し時間を置いてからもう一度お試しください。',
};

// Google /authorize が返しうる他の pass-through エラー (仕様書 #11)。
// 個別メッセージは持たず raw を含めた定型で表示する。
const GOOGLE_AUTHORIZE_PASSTHROUGH = new Set([
  'invalid_request',
  'unauthorized_client',
  'unsupported_response_type',
  'invalid_scope',
]);

// TOKEN_EXCHANGE_FAILED:<detail> の detail 部分
const TOKEN_EXCHANGE_DETAIL_MESSAGES: Record<string, string> = {
  // Lambda Proxy 固有
  invalid_json:
    '通信エラーが発生しました。ページを再読み込みしてからもう一度お試しください。',
  missing_params:
    'ログイン情報が不足しています。最初からログインをやり直してください。',
  invalid_google_response:
    'Google との通信に問題がありました。しばらく待ってからもう一度お試しください。',

  // Google OAuth 標準 (Google /token が返す error code)
  invalid_grant:
    'ログインの有効期限が切れました。もう一度最初からログインしてください。',
  invalid_request:
    '認証リクエストに問題があります。ブラウザを再読み込みしてからもう一度ログインしてください。',
  invalid_client:
    'サーバ側の認証設定に問題があります。管理者までご連絡ください。',
  redirect_uri_mismatch:
    '認証のリダイレクト設定に問題があります。管理者までご連絡ください。',
  invalid_scope: '要求した認証権限が不正です。管理者までご連絡ください。',
  unauthorized_client:
    'このアプリケーションは認証を許可されていません。管理者までご連絡ください。',
  unsupported_grant_type:
    '認証方式の設定に問題があります。管理者までご連絡ください。',

  // フロント fallback
  no_id_token: 'Google からの応答が不完全でした。もう一度ログインしてください。',
};

const TOKEN_EXCHANGE_PREFIX = 'TOKEN_EXCHANGE_FAILED:';

export function getErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;

  // TOKEN_EXCHANGE_FAILED:<detail> の分岐
  if (code.startsWith(TOKEN_EXCHANGE_PREFIX)) {
    const detail = code.slice(TOKEN_EXCHANGE_PREFIX.length);

    if (detail in TOKEN_EXCHANGE_DETAIL_MESSAGES) {
      return TOKEN_EXCHANGE_DETAIL_MESSAGES[detail];
    }

    // HTTP_<status> fallback (#23)
    if (detail.startsWith('HTTP_')) {
      const status = detail.slice('HTTP_'.length);
      return `認証サーバと通信できませんでした (HTTP ${status})。もう一度お試しください。`;
    }

    // Network エラー (Failed to fetch / NetworkError 等) (#24)
    if (/fetch|network/i.test(detail)) {
      return 'インターネット接続が確認できません。接続状態を確認してからもう一度お試しください。';
    }

    // 未マップ fallback (#25) — raw を画面に残す
    return `通信エラーが発生しました (詳細: ${detail})。もう一度お試しください。繰り返す場合はサポートにご連絡ください。`;
  }

  // 基本エラー
  if (code in BASIC_MESSAGES) {
    return BASIC_MESSAGES[code];
  }

  // Google /authorize pass-through 未マップ (#11)
  if (GOOGLE_AUTHORIZE_PASSTHROUGH.has(code)) {
    return `Google 認証でエラー (${code}) が発生しました。もう一度お試しください。繰り返す場合は管理者にご連絡ください。`;
  }

  // 完全 fallback
  return BASIC_MESSAGES.UNKNOWN;
}
