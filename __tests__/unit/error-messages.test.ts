// 認証エラーメッセージのロジック検証
// 仕様書: aidlc-docs/construction/auth-error-catalog.md
import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '@/features/auth/lib/error-messages';

describe('getErrorMessage', () => {
  describe('null / undefined / 空文字', () => {
    it('null は null を返す', () => {
      expect(getErrorMessage(null)).toBeNull();
    });
    it('undefined は null を返す', () => {
      expect(getErrorMessage(undefined)).toBeNull();
    });
    it('空文字は null を返す', () => {
      expect(getErrorMessage('')).toBeNull();
    });
  });

  describe('基本エラー', () => {
    it('INVALID_RESPONSE は再ログイン促しメッセージ', () => {
      expect(getErrorMessage('INVALID_RESPONSE')).toContain(
        'もう一度ログインボタンを押して',
      );
    });

    it('INVALID_TOKEN は "時計のずれ" 等の推測を含まない', () => {
      const msg = getErrorMessage('INVALID_TOKEN')!;
      expect(msg).not.toContain('時計');
      expect(msg).not.toContain('拡張機能');
      expect(msg).toContain('もう一度お試しください');
      expect(msg).toContain('管理者');
    });

    it('NOT_INVITED は招待リンク案内', () => {
      expect(getErrorMessage('NOT_INVITED')).toContain('招待リンク');
    });

    it('SERVER_CONFIG_ERROR は管理者連絡', () => {
      expect(getErrorMessage('SERVER_CONFIG_ERROR')).toContain('管理者');
    });

    it('UNKNOWN はサポート連絡に誘導', () => {
      expect(getErrorMessage('UNKNOWN')).toContain('サポート');
    });
  });

  describe('AccessDenied / access_denied (同内容)', () => {
    it('AccessDenied (NextAuth 互換) と access_denied (pass-through) は同じメッセージ', () => {
      expect(getErrorMessage('AccessDenied')).toBe(
        getErrorMessage('access_denied'),
      );
    });
  });

  describe('Google /authorize pass-through', () => {
    it('server_error は「数分待って」を含む', () => {
      expect(getErrorMessage('server_error')).toContain('数分');
    });

    it('temporarily_unavailable は「時間を置いて」を含む', () => {
      expect(getErrorMessage('temporarily_unavailable')).toContain('時間を置いて');
    });

    it('invalid_request 等の未マップ pass-through は raw code を含む', () => {
      const msg = getErrorMessage('invalid_request')!;
      expect(msg).toContain('invalid_request');
      expect(msg).toContain('管理者');
    });
  });

  describe('TOKEN_EXCHANGE_FAILED:<detail>', () => {
    it('invalid_grant は再ログイン促し', () => {
      expect(
        getErrorMessage('TOKEN_EXCHANGE_FAILED:invalid_grant'),
      ).toContain('もう一度最初からログイン');
    });

    it('invalid_client は管理者連絡', () => {
      expect(
        getErrorMessage('TOKEN_EXCHANGE_FAILED:invalid_client'),
      ).toContain('管理者');
    });

    it('missing_params は再ログイン促し', () => {
      expect(
        getErrorMessage('TOKEN_EXCHANGE_FAILED:missing_params'),
      ).toContain('最初からログイン');
    });

    it('no_id_token は再ログイン促し', () => {
      expect(getErrorMessage('TOKEN_EXCHANGE_FAILED:no_id_token')).toContain(
        'もう一度ログイン',
      );
    });

    it('HTTP_<status> は status を含めた文面', () => {
      const msg = getErrorMessage('TOKEN_EXCHANGE_FAILED:HTTP_500')!;
      expect(msg).toContain('HTTP 500');
      expect(msg).toContain('もう一度お試し');
    });

    it('Failed to fetch はネットワーク接続確認の案内', () => {
      expect(
        getErrorMessage('TOKEN_EXCHANGE_FAILED:Failed to fetch'),
      ).toContain('インターネット接続');
    });

    it('NetworkError も同じネットワーク案内に集約', () => {
      expect(
        getErrorMessage('TOKEN_EXCHANGE_FAILED:NetworkError when attempting to fetch resource'),
      ).toContain('インターネット接続');
    });

    it('未マップ detail は raw を画面に残す (診断 handle)', () => {
      const msg = getErrorMessage('TOKEN_EXCHANGE_FAILED:some_new_google_error')!;
      expect(msg).toContain('some_new_google_error');
      expect(msg).toContain('サポート');
    });
  });

  describe('完全 fallback', () => {
    it('存在しないコードは UNKNOWN メッセージに集約', () => {
      expect(getErrorMessage('ThisCodeDoesNotExist')).toBe(
        getErrorMessage('UNKNOWN'),
      );
    });
  });
});
