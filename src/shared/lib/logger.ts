// SP-01: Redact パターン（SECURITY-03 準拠）
// 機密情報がログに混入することを仕組みとして防ぐ
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.secret',
      '*.accessToken',
      '*.refreshToken',
      'DATABASE_URL',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'vitanota',
  },
});

export function createRequestLogger(requestId: string): pino.Logger {
  return logger.child({ requestId });
}
