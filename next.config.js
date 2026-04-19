/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Docker デプロイ向け standalone 出力モード（server.js 単体で起動可能）
  output: 'standalone',

  // BR-SEC-02: HTTP セキュリティヘッダー
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // connect-src: Authorization Code Flow + PKCE でブラウザから
            //   Google /token エンドポイントへの POST を許可するために追加
            value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://oauth2.googleapis.com;`,
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  images: {
    domains: ['lh3.googleusercontent.com'],
  },
};

module.exports = nextConfig;
