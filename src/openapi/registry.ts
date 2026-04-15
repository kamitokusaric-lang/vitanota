// Step 18: OpenAPI 3.1 レジストリ
// 全 Unit-02 エンドポイントを登録し、scripts/gen-openapi.ts から呼び出される
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import {
  createEntrySchema,
  updateEntrySchema,
  timelineQuerySchema,
} from '@/features/journal/schemas/journal';
import { createTagSchema, tagIdParamSchema } from '@/features/journal/schemas/tag';

import {
  errorResponseSchema,
  timelineResponseSchema,
  myJournalResponseSchema,
  entryResponseSchema,
  tagListResponseSchema,
  tagResponseSchema,
  tagDeleteResponseSchema,
} from './schemas';

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  // ─── 共通エラー応答 ─────────────────────────────────────────
  const errorResponses = {
    400: {
      description: 'バリデーションエラー',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: '未認証',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: '権限不足',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'リソースが見つからない',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    423: {
      description: 'テナント停止中',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    500: {
      description: 'サーバーエラー',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  };

  const sessionCookie = {
    cookieAuth: [],
  };

  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'next-auth.session-token',
    description: 'Auth.js セッション Cookie（database 戦略）',
  });

  // ─────────────────────────────────────────────────────────────
  // /api/public/journal/entries - 共有タイムライン
  // SP-U02-04 Layer 1-2: パス名前空間分離
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/public/journal/entries',
    summary: '共有タイムライン取得（テナント内の全公開エントリ）',
    description:
      'is_public=true のエントリのみが返却される。CloudFront でエッジキャッシュされる（s-maxage=30, stale-while-revalidate=60）。SP-U02-04 8層防御で is_public=false の漏えいを物理的に防ぐ。',
    tags: ['Journal (Public)'],
    security: [sessionCookie],
    request: {
      query: timelineQuerySchema,
    },
    responses: {
      200: {
        description: '共有タイムラインのページ',
        content: {
          'application/json': { schema: timelineResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/private/journal/entries - エントリ作成
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/api/private/journal/entries',
    summary: '日誌エントリを作成（US-T-010）',
    description: 'Cache-Control: private, no-store。所有者は自動的に現在のセッションユーザー。',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      body: {
        content: {
          'application/json': { schema: createEntrySchema },
        },
      },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: entryResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/private/journal/entries/[id] - 取得・更新・削除
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/private/journal/entries/{id}',
    summary: 'エントリ単体取得（所有者のみ）',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '取得成功',
        content: { 'application/json': { schema: entryResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/private/journal/entries/{id}',
    summary: 'エントリ更新（US-T-011・所有者のみ）',
    description: 'SP-U02-03: API 層の WHERE 句 + RLS WITH CHECK で IDOR を二重防御',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { 'application/json': { schema: updateEntrySchema } },
      },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: entryResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/private/journal/entries/{id}',
    summary: 'エントリ削除（US-T-012・所有者のみ）',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      204: { description: '削除成功' },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/private/journal/entries/mine - マイ記録
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/private/journal/entries/mine',
    summary: 'マイ記録取得（自分の全エントリ・公開非公開両方）',
    description: 'Cache-Control: private, no-store。CloudFront はバイパス。',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      query: timelineQuerySchema,
    },
    responses: {
      200: {
        description: 'マイ記録のページ',
        content: { 'application/json': { schema: myJournalResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/private/journal/tags - タグ一覧・作成
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/private/journal/tags',
    summary: 'テナント内タグ一覧取得',
    tags: ['Tag'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'タグ一覧',
        content: { 'application/json': { schema: tagListResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/private/journal/tags',
    summary: 'タグ作成（teacher 以上）',
    tags: ['Tag'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: createTagSchema } } },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: tagResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/private/journal/tags/{id}',
    summary: 'タグ削除（school_admin のみ・システムデフォルト不可）',
    tags: ['Tag'],
    security: [sessionCookie],
    request: {
      params: tagIdParamSchema,
    },
    responses: {
      200: {
        description: '削除成功（影響を受けたエントリ数を返却）',
        content: { 'application/json': { schema: tagDeleteResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // OpenAPI ドキュメント生成
  // ─────────────────────────────────────────────────────────────
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'vitanota API',
      version: '0.2.0', // Unit-02 リリース時点
      description: `
教員向け BtoB SaaS「vitanota」の REST API 仕様。

## 認証
全エンドポイントが Auth.js の database セッション戦略（SP-07）でログイン必須。
Cookie \`next-auth.session-token\` を介してセッション検証される。

## パス設計
- \`/api/public/*\` — CloudFront でキャッシュ可能（is_public=true のリソース）
- \`/api/private/*\` — Cache-Control: private, no-store

## エラーコード
- 400 VALIDATION_ERROR — Zod バリデーション失敗
- 401 UNAUTHORIZED — セッション無効
- 403 FORBIDDEN / TENANT_LOCKED — 権限不足・テナント停止
- 404 JOURNAL_NOT_FOUND / TAG_NOT_FOUND — 所有者でない or 存在しない
- 423 TENANT_LOCKED — テナント suspended
- 500 INTERNAL_ERROR — 予期しないエラー
      `.trim(),
      contact: {
        name: 'vitanota dev',
      },
    },
    servers: [
      { url: 'https://dev.vitanota.example.com', description: 'Development' },
      { url: 'https://vitanota.example.com', description: 'Production' },
    ],
  });
}
