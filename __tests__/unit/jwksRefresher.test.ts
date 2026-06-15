// JWKS 恒久対策: refresher の書込前バリデーション (壊れた/空の応答を Secret に保管しない門番) の回帰防止。
import { describe, it, expect } from 'vitest';
import { isValidJwks } from '../../scripts/jwks-refresher/validateJwks';

const validKey = {
  kty: 'RSA',
  kid: 'abc123',
  n: 'sXch1...base64url...',
  e: 'AQAB',
  alg: 'RS256',
  use: 'sig',
};

describe('isValidJwks', () => {
  it('正当な RSA JWKS を受理する', () => {
    expect(isValidJwks({ keys: [validKey] })).toBe(true);
    expect(isValidJwks({ keys: [validKey, { ...validKey, kid: 'def456' }] })).toBe(true);
  });

  it('keys が空 / 無し は拒否 (全プロセス道連れ防止)', () => {
    expect(isValidJwks({ keys: [] })).toBe(false);
    expect(isValidJwks({})).toBe(false);
    expect(isValidJwks({ keys: 'nope' })).toBe(false);
  });

  it('必須フィールド欠落は拒否', () => {
    expect(isValidJwks({ keys: [{ kty: 'RSA', kid: 'x', e: 'AQAB' }] })).toBe(false); // n 無し
    expect(isValidJwks({ keys: [{ kty: 'RSA', n: 'x', e: 'AQAB' }] })).toBe(false); // kid 無し
    expect(isValidJwks({ keys: [{ ...validKey, kty: 'EC' }] })).toBe(false); // RSA でない
    expect(isValidJwks({ keys: [{ ...validKey, kid: '' }] })).toBe(false); // 空文字
  });

  it('JSON でない値は拒否', () => {
    expect(isValidJwks(null)).toBe(false);
    expect(isValidJwks('string')).toBe(false);
    expect(isValidJwks(undefined)).toBe(false);
  });
});
