// Google JWKS リフレッシャ Lambda (非 VPC = インターネット可)。
//
// 役割: Google の JWKS を取得・検証して Secrets Manager に保管する「橋渡し役」。
//   AppRunner は PRIVATE_ISOLATED + NAT 撤廃で実行時に外へ出られないため、鍵という
//   データだけを安全な経路 (Secrets Manager VPC Endpoint) で VPC 内へ運び込む。
//
// 起動経路 (二刀流):
//   - EventBridge schedule (定期ハートビート・rate 6h)
//   - AppRunner からの on-demand invoke (verifyGoogleIdToken の kid 不一致トリガー)
//
// セキュリティ (認証の信頼根):
//   - 取得先 URL はハードコード・リダイレクト追従しない (SSRF 余地を消す)・TLS 検証必須 (fetch 既定)
//   - 書込前バリデーション (isValidJwks) を通った正当な JWKS のみ PutSecretValue
//   - input/鍵本文は公開鍵だが、構造化ログには件数のみ出す
import {
  SecretsManagerClient,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { isValidJwks, type Jwks } from './validateJwks';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SECRET_ARN = process.env.GOOGLE_JWKS_SECRET_ARN ?? '';
const REGION =
  process.env.AWS_REGION_OVERRIDE ?? process.env.AWS_REGION ?? 'ap-northeast-1';

const secretsClient = new SecretsManagerClient({ region: REGION });

export interface RefreshResult {
  ok: boolean;
  count?: number;
  jwks?: Jwks;
  error?: string;
}

export async function handler(): Promise<RefreshResult> {
  if (!SECRET_ARN) {
    console.error(
      JSON.stringify({
        event: 'jwks_refresh.config_missing',
        detail: 'GOOGLE_JWKS_SECRET_ARN unset',
      }),
    );
    return { ok: false, error: 'config_missing' };
  }

  // 1. Google JWKS 取得 (リダイレクト追従禁止・5s タイムアウト)
  let jwks: Jwks;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(GOOGLE_CERTS_URL, {
        redirect: 'error',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.error(
        JSON.stringify({ event: 'jwks_refresh.fetch_failed', status: res.status }),
      );
      return { ok: false, error: `fetch_status_${res.status}` };
    }
    const body: unknown = await res.json();
    if (!isValidJwks(body)) {
      console.error(JSON.stringify({ event: 'jwks_refresh.invalid_jwks' }));
      return { ok: false, error: 'invalid_jwks' };
    }
    jwks = body;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'jwks_refresh.fetch_error',
        name: err instanceof Error ? err.name : 'unknown',
      }),
    );
    return { ok: false, error: 'fetch_error' };
  }

  // 2. 検証済みのみ Secret へ保管
  try {
    await secretsClient.send(
      new PutSecretValueCommand({
        SecretId: SECRET_ARN,
        SecretString: JSON.stringify(jwks),
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'jwks_refresh.put_failed',
        name: err instanceof Error ? err.name : 'unknown',
      }),
    );
    return { ok: false, error: 'put_failed' };
  }

  console.info(
    JSON.stringify({ event: 'jwks_refresh.success', count: jwks.keys.length }),
  );
  // 3. on-demand 呼び出し元 (kid 不一致トリガー) が即利用できるよう JWKS を返す
  return { ok: true, count: jwks.keys.length, jwks };
}
