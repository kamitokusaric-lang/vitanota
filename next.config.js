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
    // connect-src: Google Token Proxy Lambda (Function URL) への POST を許可。
    // URL は build 時に NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL から origin 部分だけ抽出する
    // (CSP は scheme://host までの origin を要求、末尾 path は不可)
    const proxyUrl = process.env.NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL;
    const proxyOrigin = proxyUrl ? new URL(proxyUrl).origin : '';
    const connectSrc = ['\'self\'', proxyOrigin].filter(Boolean).join(' ');
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src ${connectSrc};`,
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
