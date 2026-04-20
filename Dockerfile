# ── Stage 1: deps ──────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# ── Stage 2: builder ───────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Next.js は NEXT_PUBLIC_* を BUILD 時に client JS へリテラル置換する仕様のため
# build-arg 経由で値を注入する必要がある。
# (AppRunner runtime env var はサーバサイド SSR では使えるが client JS では undefined になる)
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}

ARG NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL
ENV NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL=${NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL}

ENV NEXT_TELEMETRY_DISABLED=1

# Google ID Token ローカル検証用 JWKS を焼き込む（ビルド時 fetch・再デプロイで更新）
# 鍵ローテへの追従は週次以上のデプロイで確保。詳細: aidlc-docs/construction/auth-externalization.md
RUN apk add --no-cache curl \
 && curl -sSL https://www.googleapis.com/oauth2/v3/certs \
    -o src/features/auth/lib/google-jwks.json \
 && echo "JWKS fetched: $(wc -c < src/features/auth/lib/google-jwks.json) bytes"

RUN pnpm run build

# ── Stage 3: runner ────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# セキュリティ: 非 root ユーザーで実行
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
