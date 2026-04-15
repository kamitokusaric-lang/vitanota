# vitanota インフラ構成統合サマリー・セキュリティレビュー（Unit-01 + Unit-02 時点）

**作成日**: 2026-04-15
**対象**: Unit-01（認証・テナント基盤）+ Unit-02（日誌・感情記録コア）のインフラ設計全体
**目的**: セキュリティリスクの棚卸し・考慮漏れの洗い出し・商用化前の論点整理

---

## 更新履歴

- **2026-04-15 初版**: Unit-01 + Unit-02 の統合セキュリティレビューを実施、論点 A-K を特定
- **2026-04-15 改訂1**: 論点 C（JWT 失効）を Database セッション戦略で解決、論点 F（PII エッジキャッシュ混入）を 7層多層防御（SP-U02-04）で解決
  - Unit-01 nfr-design-patterns.md に SP-07 セッション戦略パターン追加
  - Unit-02 nfr-design-patterns.md に SP-U02-04 多層防御パターン追加
  - Unit-02 infrastructure-design.md に PostgreSQL VIEW `public_journal_entries` 定義追加
  - CloudFront パスを `/api/public/*` と `/api/private/*` に名前空間分離
- **2026-04-15 改訂6（本版）**: 論点 M（ユーザーライフサイクル）を追加
  - 教員退会・転勤・データエクスポート・物理削除バッチの設計を確定
  - Phase 1（スキーマ修正）を実装、Phase 2（API・Service・バッチ）は次 Unit
- **2026-04-15 改訂5**: 運用フェーズで対応する既知項目を明文化
  - **論点 L**（サプライチェーン攻撃対策）を追加
  - **運用フェーズ項目**を新セクションとして追加（インシデント対応 Runbook・外部ペンテスト計画・セキュリティトレーニング）
- **2026-04-15 改訂4**: 論点 H 追加ハードニング
  - **Layer 8 追加**: SP-U02-04 7層 → **8層防御**。`journal_entry_tags` に `tenant_id` 冗長列と複合 FK `(entry_id, tenant_id)` `(tag_id, tenant_id)` を追加し、DB エンジンレベルでクロステナント参照を物理拒否
  - `journal_entries` / `tags` に `(id, tenant_id)` の UNIQUE 制約を追加（複合 FK の参照先）
  - マイグレーション `0005_cross_tenant_fk.sql` を Unit-02 に追加
  - 統合テストに Layer 8 の生存確認ケースを追加
- **2026-04-15 改訂3**: 残存 P2 論点 A・B の追加対応完了
  - **論点 A**（App Runner オリジン保護強化）→ 月次ヘッダーローテーション自動化（Lambda + EventBridge） + 直接アクセス検知（CloudWatch Metric Filter） + gitleaks プリコミット/CI + 移行パス明記
  - **論点 B**（RDS Proxy IAM 認証トークン管理）→ CloudTrail `rds-db:connect` 監査 + RDS 接続元 IP 監視 Lambda + IAM Permission Boundary 全ロール適用 + トラストポリシー四半期レビュー
- **2026-04-15 改訂2**: P0/P1 論点の追加対応完了
  - **論点 D**（監査ログ保持・読み取りログ）→ S3 Object Lock 7年保持 + Kinesis Firehose 転送 + 読み取りイベント追加 + CloudWatch Logs 削除権限剥奪
  - **論点 E**（GitHub Actions OIDC 権限）→ トラストポリシーを `ref:refs/heads/main` + `environment:production` に限定
  - **論点 G**（Lambda マイグレーター権限分離）→ execute/deploy/invoke の3ロール分離 + prod invoke ホワイトリスト + CloudTrail/SNS 通知
  - **論点 H**（マルチテナント隔離の検証）→ 統合テスト計画 `integration-test-plan.md` を作成、8 Suite で網羅

---

## 1. 全体アーキテクチャ図

```
┌──────────────────────────────────────────────────────────────┐
│ [インターネット]                                              │
│         │ HTTPS                                              │
│         ▼                                                    │
│ ┌──────────────────────────────────────────┐                │
│ │ AWS Shield Standard（L3/L4 DDoS 無料）    │                │
│ └──────────────────────────────────────────┘                │
│         │                                                    │
│         ▼                                                    │
│ ┌──────────────────────────────────────────┐                │
│ │ Amazon CloudFront(グローバル)              │                │
│ │ ├ ACM 証明書 (us-east-1)                  │                │
│ │ ├ カスタムドメイン: vitanota.example.com   │                │
│ │ ├ TLSv1.2_2021 強制                        │                │
│ │ ├ デフォルト: CachingDisabled              │                │
│ │ ├ `/api/public/*`: vitanota-timeline-cache │                │
│ │ └ `/api/private/*`: CachingDisabled        │                │
│ └──────────────────────────────────────────┘                │
│         │                                                    │
│         ▼(オリジンリクエスト + X-CloudFront-Secret)          │
│ ┌──────────────────────────────────────────┐                │
│ │ AWS WAF v2 Web ACL                        │                │
│ │ ├ CommonRuleSet (Block)                   │                │
│ │ ├ KnownBadInputsRuleSet (Block)           │                │
│ │ ├ SQLiRuleSet (Block)                     │                │
│ │ ├ AmazonIpReputationList (Block)          │                │
│ │ ├ RateLimitPerIP 1000/5min (Block)        │                │
│ │ └ journal-entry-post-bodycheck (Count→7日後Block) │        │
│ └──────────────────────────────────────────┘                │
│         │                                                    │
├─────────┼────────────────────────────────────────────────────┤
│         ▼  AWS ap-northeast-1                                │
│ ┌──────────────────────────────────────────┐                │
│ │ AWS App Runner                             │                │
│ │ ├ コンテナ: Next.js 14 (Node.js 20)        │                │
│ │ ├ 0.25 vCPU / 0.5 GB                       │                │
│ │ ├ dev: min 0 max 3 / prod: min 1 max 5    │                │
│ │ ├ ヘルスチェック: /api/health              │                │
│ │ ├ Middleware: X-CloudFront-Secret 検証     │                │
│ │ └ ECR: vitanota/app                        │                │
│ └──────────────────────────────────────────┘                │
│         │                                                    │
│         ▼ VPC コネクター                                      │
│ ┌──────────────────────────────────────────┐                │
│ │ VPC プライベートサブネット 2AZ              │                │
│ │                                            │                │
│ │  ┌─────────────┐       ┌─────────────┐    │                │
│ │  │ RDS Proxy    │       │ Lambda       │    │                │
│ │  │ IAM認証      │       │ vitanota-db- │    │                │
│ │  │ TLS必須      │       │ migrator     │    │                │
│ │  │ Pool 50%     │       │ Node.js 20   │    │                │
│ │  └──────┬──────┘       └──────┬──────┘    │                │
│ │         │                      │            │                │
│ │         └──────────┬───────────┘            │                │
│ │                    ▼                        │                │
│ │         ┌──────────────────────┐            │                │
│ │         │ RDS PostgreSQL 16    │            │                │
│ │         │ db.t4g.micro         │            │                │
│ │         │ dev: 単一AZ           │            │                │
│ │         │ prod: Multi-AZ        │            │                │
│ │         │ 暗号化 KMS            │            │                │
│ │         │ 削除保護 (prod)       │            │                │
│ │         │ RLS 有効              │            │                │
│ │         │ + public_journal_    │            │                │
│ │         │   entries VIEW       │            │                │
│ │         │ + sessions テーブル   │            │                │
│ │         └──────────────────────┘            │                │
│ └──────────────────────────────────────────┘                │
│                                                                │
│ ┌─────────────────────┐  ┌──────────────────┐                │
│ │ Secrets Manager      │  │ CloudWatch Logs  │                │
│ │ ├ nextauth-secret    │  │ /vitanota/prod/app (90d) │         │
│ │ ├ google-client-id   │  │ /vitanota/dev/app (30d)  │         │
│ │ ├ google-client-secret│ │ WAF logs                  │         │
│ │ ├ cloudfront-secret  │  │ Lambda logs               │         │
│ │ └ db-migrator-config │  └─────┬──────────────┘                │
│ └─────────────────────┘        │ Subscription Filter            │
│                                 ▼                                │
│                        ┌──────────────────┐                     │
│                        │ Kinesis Firehose │                     │
│                        │ vitanota-audit-  │                     │
│                        │ firehose         │                     │
│                        └─────┬────────────┘                     │
│                              ▼                                   │
│                        ┌──────────────────────┐                 │
│                        │ S3: vitanota-audit-  │                 │
│                        │     logs-prod         │                 │
│                        │ ├ Object Lock 7年     │                 │
│                        │ ├ KMS 暗号化           │                 │
│                        │ ├ MFA Delete          │                 │
│                        │ └ Lifecycle:          │                 │
│                        │    1y→Glacier         │                 │
│                        │    3y→Deep Archive    │                 │
│                        └──────────────────────┘                 │
│                                                                │
│ ┌─────────────────────┐  ┌──────────────────┐                │
│ │ CloudWatch Alarms    │  │ SNS + Email      │                │
│ │ AuthErrors           │  │ vitanota-alerts  │                │
│ │ AppErrors            │  │                  │                │
│ │ RdsCpuHigh           │  └──────────────────┘                │
│ │ RdsCreditLow         │                                       │
│ │ Http5xx              │                                       │
│ │ MemoryHigh           │                                       │
│ │ CloudFrontOriginErrors│                                      │
│ │ WafBlockedRequestsHigh│                                      │
│ │ ProdMigratorInvoked   │                                      │
│ └─────────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘

 [外部]
  GitHub Actions ─┬─ OIDC(main/production 限定) ──▶ IAM Role
                  │            └ ECR Push / AppRunner Update / CloudFront Invalidation
                  │            └ Lambda UpdateFunctionCode (migrator-deploy-role)
                  └─ Google OAuth(Auth.js 経由)
```

---

## 2. 全 AWS リソース一覧

### コンピュート
| リソース | 用途 | 環境 |
|---|---|---|
| App Runner `vitanota-dev` | Next.js アプリ (dev) | dev |
| App Runner `vitanota-prod` | Next.js アプリ (prod) | prod |
| Lambda `vitanota-db-migrator-dev` | DB マイグレーション実行 | dev |
| Lambda `vitanota-db-migrator-prod` | DB マイグレーション実行 | prod |

### ストレージ・データ
| リソース | 用途 |
|---|---|
| RDS PostgreSQL 16 (`vitanota-dev`) | db.t4g.micro 単一 AZ |
| RDS PostgreSQL 16 (`vitanota-prod`) | db.t4g.micro Multi-AZ |
| RDS Proxy `vitanota-rds-proxy-dev/prod` | IAM 認証・接続プール |
| ECR `vitanota/app` | コンテナイメージ |
| **S3 `vitanota-audit-logs-prod`** | **監査ログ長期保管・Object Lock 7年・P1-D** |

### エッジ・ネットワーク
| リソース | 用途 |
|---|---|
| CloudFront ディストリビューション × 2(dev/prod) | エッジキャッシュ・TLS 終端 |
| WAF v2 Web ACL × 2(CLOUDFRONT スコープ) | 攻撃遮断 |
| Shield Standard | DDoS 保護(自動) |
| ACM 証明書(us-east-1) | CloudFront 用 TLS |
| VPC コネクター | App Runner → プライベート VPC |

### データパイプライン
| リソース | 用途 |
|---|---|
| **Kinesis Data Firehose `vitanota-audit-firehose`** | **CloudWatch Logs → S3 転送・P1-D** |
| **KMS key `vitanota-audit-kms`** | **監査ログ暗号化・P1-D** |

### ID・シークレット
| リソース | 用途 |
|---|---|
| IAM ロール: `vitanota-apprunner-role` | App Runner 実行 |
| IAM ロール: `vitanota-github-actions-role` | OIDC デプロイ（main + production 限定） |
| **IAM ロール: `vitanota-db-migrator-execute-role`** | **Lambda ランタイム実行用・P1-G** |
| **IAM ロール: `vitanota-db-migrator-deploy-role`** | **Lambda コードデプロイ専用・P1-G** |
| **IAM ロール: `vitanota-db-migrator-invoke-role`** | **Lambda invoke 専用・P1-G** |
| **IAM ロール: `vitanota-logs-admin-role`** | **CloudWatch Logs 削除専用・P1-D** |
| Secrets Manager: `vitanota/nextauth-secret` | Auth.js CSRF/PKCE 署名キー |
| Secrets Manager: `vitanota/google-client-id` | OAuth |
| Secrets Manager: `vitanota/google-client-secret` | OAuth |
| Secrets Manager: `vitanota/cloudfront-secret` | オリジン保護 |

### 監視
| リソース | 用途 |
|---|---|
| CloudWatch Logs: `/vitanota/{env}/app` | アプリログ 90日/30日 |
| CloudWatch Logs: WAF logs | 攻撃記録 |
| CloudWatch Logs: `/aws/lambda/vitanota-db-migrator-*` | マイグレーションログ |
| CloudWatch Alarms × 12+ | 異常検知（`ProdMigratorInvoked` 追加） |
| SNS: `vitanota-alerts` | メール通知 |

---

## 3. セキュリティポスチャ(防御レイヤー)

| レイヤー | 防御機構 | 対応リスク |
|---|---|---|
| L0 エッジ | AWS Shield Standard(DDoS L3/L4) | ボリューメトリック攻撃 |
| L0 エッジ | WAF CommonRuleSet(XSS/共通攻撃) | OWASP Top 10 |
| L0 エッジ | WAF SQLiRuleSet | SQL インジェクション(第一層) |
| L0 エッジ | WAF KnownBadInputsRuleSet | 既知の悪意あるペイロード |
| L0 エッジ | WAF AmazonIpReputationList | 脅威情報 IP |
| L0 エッジ | WAF RateLimitPerIP(1000/5min) | ブルートフォース |
| L1 オリジン | X-CloudFront-Secret ヘッダー検証 | App Runner 直アクセス |
| L1 アプリ | アプリ内レート制限(ログイン 10/分) | クレデンシャル・スタッフィング |
| L2 認証 | **Auth.js database セッション検証** | **改ざん・失効・即時取消可能** |
| L3 テナント | suspended チェック → 423 Locked | 停止テナントのアクセス |
| L4 認可 | ロール検証(school_admin 等) | 権限昇格 |
| L5 入力 | Zod スキーマバリデーション(Client + API) | 不正入力・型混乱 |
| L6 API層 | `WHERE user_id = ?` 明示(IDOR 二重) | 他人リソース参照 |
| L7 DB層 | PostgreSQL RLS 2ポリシー + VIEW | テナント横断・所有者以外アクセス・is_public 漏えい |
| L8 データ | Drizzle prepared statement | SQL インジェクション(第二層) |
| L9 保管 | RDS KMS 保管時暗号化 + TLS 転送 | 物理盗難・中間者 |
| 観測 | pino redact・構造化ログ・S3 Object Lock 7年 | ログ経由漏えい・改ざん・長期保管 |

**多層性は確保されている。** 単一の層が破綻しても次の層で防げる構成。

---

## 3a. is_public 漏えい 8層防御（SP-U02-04・改訂1 で追加・改訂4 で Layer 8 追加）

```
Layer 1: CloudFront パス名前空間分離 (/api/public/* vs /api/private/*)
Layer 2: エンドポイント分離 (ハンドラファイルを物理分離)
Layer 3: Repository 型分離 (PublicTimelineRepository / PrivateJournalRepository、型ブランド)
Layer 4: PostgreSQL VIEW public_journal_entries (WHERE 句内包、is_public 列非露出、security_barrier)
Layer 5: RLS public_read ポリシー (DB 層強制)
Layer 6: アプリ層の明示 WHERE 句 (冗長な保険)
Layer 7: 統合テスト強制 (integration-test-plan.md Suite 5)
Layer 8: DB 複合 FK によるクロステナント参照物理防止 (journal_entry_tags の (entry_id, tenant_id) + (tag_id, tenant_id) FK)
```

---

## 3b. Auth.js Database セッション戦略（SP-07・改訂1 で追加）

| 項目 | 設定 |
|---|---|
| 戦略 | database（PostgreSQL sessions テーブル） |
| アダプタ | `@auth/drizzle-adapter` |
| アイドルタイムアウト | 30分 |
| 絶対最大寿命 | 8時間 |
| ロール変更時 | 該当ユーザーの全セッション自動失効 |
| テナント停止時 | 該当テナントの全ユーザーセッション自動失効 |
| 失効手段 | `DELETE FROM sessions WHERE ...` |
| 監査ログ | session_created・session_revoked・session_expired |
| RLS | 所有者 SELECT / school_admin ALL |

---

## 4. シークレット管理まとめ

| シークレット | 形式 | ローテーション | 保管 | 取得側 |
|---|---|---|---|---|
| NEXTAUTH_SECRET | 256bit ランダム（Auth.js CSRF/PKCE 用、database 戦略でも必要） | 手動 | Secrets Manager | App Runner |
| GOOGLE_CLIENT_ID/SECRET | OAuth | 手動 | Secrets Manager | App Runner |
| CLOUDFRONT_SECRET_HEADER_VALUE | ランダム文字列 | 手動(四半期推奨) | Secrets Manager | App Runner + CloudFront |
| DB 接続情報 | IAM トークン動的生成 | **不要**(15分で自動失効) | なし(都度取得) | App Runner + Lambda |
| ECR イメージ認証 | ECR getAuthorizationToken | **不要** | なし | App Runner + GitHub Actions |
| GitHub → AWS | OIDC Web Identity Token | **不要** | なし | GitHub Actions |
| セッショントークン | ランダム文字列（Auth.js database 戦略） | セッション毎（ログイン時発行・失効時削除） | sessions テーブル | Auth.js |

**長期保管の静的シークレットは最小限**(NextAuth + Google OAuth + CloudFront header のみ)。

---

## 5. ネットワーク境界(Trust Boundary)

```
[信頼境界1: インターネット → CloudFront]
  境界検査: TLS 終端・WAF・Shield
  許可: HTTPS 443 のみ

[信頼境界2: CloudFront → App Runner]
  境界検査: X-CloudFront-Secret ヘッダー
  許可: HTTPS + 署名ヘッダー

[信頼境界3: App Runner → VPC]
  境界検査: VPC コネクター
  許可: App Runner インスタンスロールを持つコンテナのみ

[信頼境界4: VPC → RDS Proxy]
  境界検査: sg-rds-proxy Inbound(sg-app-runner + sg-db-migrator のみ)
  許可: TCP 5432 + IAM トークン

[信頼境界5: RDS Proxy → RDS]
  境界検査: sg-rds Inbound(sg-rds-proxy のみ)
  許可: TCP 5432 + TLS + IAM 認証

[信頼境界6: GitHub Actions → AWS]
  境界検査: OIDC Web Identity + sub 条件
  許可: repo:your-org/vitanota:ref:refs/heads/main または :environment:production のみ
```

**境界ごとに認証+ネットワーク+SG の3層保護。App Runner と RDS は完全プライベート。**

---

## 6. データフロー(典型的な API リクエスト)

```
[教員のブラウザ]
    │ https://vitanota.example.com/api/public/journal/entries
    │ Cookie: next-auth.session-token=...
    ▼
[CloudFront エッジ]
    │ TLS 終端・WAF 評価・キャッシュキー計算（パス /api/public/* はキャッシュ有効）
    │ X-CloudFront-Secret ヘッダー付与
    ▼
[App Runner コンテナ / Next.js]
    │ [1] middleware.ts: X-CloudFront-Secret 検証 → 403 or 続行
    │ [2] withAuth: sessions テーブル lookup（Cookie → session_token → DB）
    │     → 有効なセッションなら userId・tenantId 取得、無効なら 401
    │ [3] withTenant: db.transaction 開始
    │ [4]   SET LOCAL app.tenant_id = tenantId
    │ [5]   SET LOCAL app.user_id = userId
    │ [6] API ハンドラ: Zod バリデーション
    │ [7] PublicTimelineRepository.findTimeline()
    │     → public_journal_entries VIEW から SELECT（is_public=true 内包）
    ▼
[RDS Proxy: IAM トークン認証・接続プール]
    ▼
[RDS PostgreSQL: RLS 評価 → 許可された行のみ返却]
    ▼
[結果をレスポンス構築 → pino で構造化ログ(本文redact)]
    │ event: journal_entry_list_read, endpoint: 'public', count: 20
    │   → CloudWatch Logs → Kinesis Firehose → S3 Object Lock
    ▼
[CloudFront: Cache-Control: s-maxage=30, stale-while-revalidate=60 で30秒キャッシュ]
    ▼
[教員のブラウザ]
```

---

## 7. 既知の運用リスク(operational-risks.md より抜粋)

| ID | リスク | 深刻度 | 状態 |
|---|---|---|---|
| R1 | RDS Proxy セッションピンニング | 🔴 | **統合テスト計画済**（integration-test-plan.md Suite 3） |
| R2 | dev 単一 AZ SPOF | 🔴 | 容認(dev のみ) |
| R4 | CloudFront + SWR 二重キャッシュ | 🟡 | 30秒遅延受容 + SP-U02-04 7層防御で強化 |
| R5 | RLS ポリシー設計 | 🟡 | **統合テスト計画済**（integration-test-plan.md Suite 4） |
| R7 | ローリングデプロイ中のマイグレーション競合 | 🟡 | Lambda で順序制御 |
| R11 | 署名ヘッダーローテーション | 🟡 | 新旧並行受容で対策 |
| R12 | WAF 誤検知 | 🟡 | Count モード7日運用 |

---

## 8. ⚠️ セキュリティレビューで特に注目すべき論点

当初 11論点（A-K）を特定。改訂1・改訂2 で 6論点を対応済み、残存 🟡 2論点、将来拡張 🟢 3論点。

### ✅ 論点 A: App Runner のパブリックエンドポイント漏えい時の影響 → **対応済み（2026-04-15 改訂3）**

**対応内容**:
- **A-1 月次ヘッダーローテーション自動化**: Lambda `vitanota-header-rotator` + EventBridge Scheduler で月初 01:00 JST に自動実行
  - Secrets Manager に `current_value` と `previous_value` を保持、24時間の猶予期間で新旧両方を受容
  - App Runner ミドルウェアが両方の値をチェックして段階的切替
- **A-2 直接アクセス検知**: CloudWatch Logs Metric Filter で `X-Forwarded-For` が CloudFront IP 範囲外のリクエストを検出、5分間に10回以上で SNS アラート
- **A-3 シークレット流出防止**: gitleaks をプリコミットフック + CI ステップに導入、main ブランチマージ時にシークレット混入を構造的にブロック
- **A-4 移行パス**: 将来 App Runner VPC-only 対応時 or 代替 ALB + ECS Fargate 構成への移行選択肢を運用ドキュメントに明記

**残存リスク**: 極小。ローテーション自動化により漏えい→攻撃の窓が最大1ヶ月に短縮。

---

### ✅ 論点 B: RDS Proxy IAM 認証のトークン管理 → **対応済み（2026-04-15 改訂3）**

**対応内容**:
- **B-1 CloudTrail `rds-db:connect` 監査**: CloudTrail Data Events で発行元 IAM エンティティを記録、想定外のエンティティ（非 apprunner-role / 非 migrator-role）からの発行を即アラート。1分間に100回超でブルートフォース検知
- **B-2 RDS 接続元 IP 監視**: Lambda `vitanota-rds-connection-monitor` が日次で `pg_stat_activity` をスキャン、App Runner / Lambda の ENI 範囲外からの接続を検知して SNS 通知
- **B-3 トラストポリシー最小化レビュー**: 全 IAM ロールの信頼先を運用 Runbook にチェックリスト化、四半期レビュー + ロール追加時の検証を必須化
- **B-4 IAM Permission Boundary**: 全 Unit-01 関連 IAM ロールに `vitanota-permission-boundary` を適用
  - 許可: 必要な AWS サービス API のみホワイトリスト
  - 拒否: `iam:*` 変更系・`kms:CreateKey/DeleteKey`・`cloudtrail:StopLogging/DeleteTrail`
  - ロールに過剰権限をうっかり付与しても境界で遮断
  - IAM エスカレーション攻撃を構造的に防止

**残存リスク**: 極小。トークン発行の監査・接続経路の監視・権限境界の3層で異常を早期検知。

---

### ✅ 論点 C: Auth.js JWT 失効の不可能性 → **対応済み（2026-04-15 改訂1）**

**対応内容**:
- Auth.js の セッション戦略を `jwt` → `database` に変更（Unit-01 SP-07 パターンとして追加）
- `sessions` テーブルを Unit-01 スキーマに追加、Drizzle アダプタで Auth.js と統合
- アイドルタイムアウト 30分・絶対最大寿命 8時間
- ロール変更時・テナント停止時に自動セッション失効
- 管理画面での強制ログアウト機能を Unit-03/04 で実装予定
- セッション作成・削除イベントを構造化ログに追加（論点 D の部分対応）
- 追加インフラゼロ、レイテンシ影響 5〜10ms（誤差レベル）

**残存リスク**: なし。商用化の障壁を解消。

---

### ✅ 論点 D: 監査ログの保持期間と改ざん防止 → **対応済み（2026-04-15 改訂2）**

**対応内容**:
- **S3 監査ログバケット** `vitanota-audit-logs-prod` を追加
  - Object Lock Governance Mode 7年保持・IAM 権限でも削除不可
  - KMS 暗号化（`vitanota-audit-kms`）・バージョニング有効・MFA Delete
  - Lifecycle: 1年後 Glacier Flexible → 3年後 Glacier Deep Archive → 7年後削除可能化
- **Kinesis Data Firehose** `vitanota-audit-firehose` で CloudWatch Logs → S3 に自動転送
  - バッファリング 300秒/5MB、GZIP 圧縮
  - エラー出力は別バケット `vitanota-audit-logs-errors`
- **CloudWatch Logs 削除権限を App Runner ロールから剥奪**
  - `logs:DeleteLogGroup`・`logs:DeleteLogStream`・`logs:DeleteRetentionPolicy` を除外
  - 専用ロール `vitanota-logs-admin-role` のみが保持、平常時は誰にも付与しない
- **読み取りイベントを構造化ログに追加**（Unit-02 OP-U02-01 拡張）
  - `journal_entry_read` / `journal_entry_list_read` / `tag_list_read`
  - `session_created` / `session_revoked`
  - 「誰が非公開エントリを読んだか」の事後追跡が可能
- エントリ本文は pino redact で記録対象外（プライバシー配慮）

**コスト**: 月数百円〜（ログ量次第）

**残存リスク**: 極小。教育機関の監査要件への対応基盤を整備。

---

### ✅ 論点 E: GitHub Actions の権限範囲 → **対応済み（2026-04-15 改訂2）**

**対応内容**: OIDC トラストポリシーを厳密化（Unit-01 infrastructure-design.md）
- **旧**: `repo:your-org/vitanota:*`（broad）
- **新**:
  ```json
  {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": [
        "repo:your-org/vitanota:ref:refs/heads/main",
        "repo:your-org/vitanota:environment:production"
      ]
    }
  }
  ```
- fork からの PR（`repo:fork-owner/*`）は完全に拒否
- feature ブランチ・PR からは AWS にアクセス不可
- **追加のブランチ保護**:
  - main ブランチ保護: 直接 push 不可・PR 必須・CI 必須・レビュー1名以上
  - `production` environment: repo admin による手動承認必須
  - `workflow_dispatch` はリポジトリ管理者のみ実行可
  - `pull_request_target` イベントは使用禁止

**残存リスク**: なし。

---

### ✅ 論点 F: PII のエッジキャッシュ混入リスク → **対応済み（2026-04-15 改訂1）**

**対応内容（SP-U02-04 多層防御の7層）**:
1. CloudFront パス名前空間分離（`/api/public/*` vs `/api/private/*`）でキャッシュ対象を構造的に分離
2. エンドポイント分離（ハンドラファイルを物理的に分ける）
3. Repository 型分離（PublicTimelineRepository / PrivateJournalRepository、型ブランドで誤用防止）
4. PostgreSQL VIEW `public_journal_entries`（WHERE 句を内包、`is_public` 列を露出しない、security_barrier）
5. RLS public_read ポリシー（DB 層で最終強制）
6. アプリ層の明示 WHERE 句（冗長だが保険）
7. 統合テスト強制（is_public=false 漏えいを CI で回帰検知）

**効果**:
- ソースコードのバグ、設定ミス、RLS 無効化事故のいずれに対しても、少なくとも1層は物理的に機能する
- `is_public` 列自体が View で露出しないため、エッジキャッシュに混入する経路が型レベル・DB レベルで存在しない

**残存リスク**: 極めて小さい（7層全てが同時に破綻する必要がある）

---

### ✅ 論点 G: Lambda マイグレーターの権限範囲 → **対応済み（2026-04-15 改訂2）**

**対応内容**: IAM ロールを3分離（Unit-01 infrastructure-design.md）

#### 1. `vitanota-db-migrator-execute-role`（Lambda ランタイム実行用）
```
rds-db:connect / secretsmanager:GetSecretValue
logs:CreateLogGroup / CreateLogStream / PutLogEvents
ec2:*NetworkInterface* (VPC Lambda 必須)
```
信頼ポリシー: `lambda.amazonaws.com` のみ

#### 2. `vitanota-db-migrator-deploy-role`（コードデプロイ専用）
```
lambda:UpdateFunctionCode / PublishVersion / GetFunction
```
信頼ポリシー: GitHub Actions OIDC（`ref:refs/heads/main` のみ）

#### 3. `vitanota-db-migrator-invoke-role`（実行呼び出し専用）
```
lambda:InvokeFunction
```
信頼先:
- `vitanota-db-migrator-dev-invokers` IAM グループ（全開発者）
- `vitanota-db-migrator-prod-invokers` IAM グループ（リリース担当者 3〜5名ホワイトリスト）

#### prod invoke の追加保護
- **特定 IAM User ホワイトリスト方式**で prod Lambda invoke を制限
- **CloudTrail で全 invoke を記録**（`lambda:Invoke` イベント）
- **prod invoke 発生時に SNS → 管理者メール通知**（CloudWatch Alarm `ProdMigratorInvoked`）
- **Lambda 関数側のハードコード保護**:
  ```ts
  if (event.command === 'drop' && process.env.ENV === 'prod') throw new Error('...')
  if (event.command === 'query' && process.env.ENV === 'prod') throw new Error('...')
  ```

**残存リスク**: 極小。

---

### ✅ 論点 H: マルチテナント隔離の仮定 → **対応済み（2026-04-15 改訂2）**

**対応内容**: 統合テスト計画 `integration-test-plan.md` を作成（Unit-02 nfr-design/）

8 Suite で網羅:
1. **Baseline** - テナント内正常系
2. **Cross-tenant protection** - 別テナントリソースへのアクセス拒否を網羅的に検証
3. **Session variable leakage** - RDS Proxy セッション再利用時の `app.tenant_id` 漏えい（論点 H の直接対応）
4. **RLS fail-safe** - セッション変数未設定・不正時の全拒否
5. **is_public leak prevention** - SP-U02-04 7層防御の生存確認
6. **IDOR prevention** - 所有者以外の更新・削除拒否
7. **Session strategy** - Auth.js database 戦略の動作検証
8. **RDS Proxy pinning detection** - 本番運用時の CloudWatch メトリクス監視

**実行条件**:
- 実 PostgreSQL（testcontainers）で検証、モック不可
- CI で必須化、失敗時は deploy ブロック
- 100 並列リクエストでのセッション変数漏えい検証を含む

**残存リスク**: 統合テスト実装後に再評価。テスト実装は Unit-02 コード生成フェーズで対応。

---

### 🟡 論点 M: ユーザーライフサイクル管理（2026-04-15 改訂6 で追加）

**問題発見の経緯**: Step 8 完了後のレビューで「ユーザー退会フローが未実装」かつ「現状の DB 制約だと `DELETE FROM users` が FK violation で失敗する」二重問題を発見。さらに教員の転勤を考慮すると、単純な退会ではなく以下のユースケースを区別する必要があると判明。

**ユースケース**:
1. **転勤（US-T-100）**: 教員が学校 A → 学校 B、人格は同一・テナント所属が変わる
2. **兼務**: 1人が複数学校に同時所属（既存 user_tenant_roles で対応）
3. **退会（US-T-099）**: vitanota 利用を完全終了
4. **強制退会（US-S-003）**: school_admin が退職処理
5. **データエクスポート（US-T-098）**: 任意のタイミングでマイ記録を JSON/Markdown ダウンロード
6. **物理削除バッチ（US-S-004）**: 退会後 30 日経過分を自動削除

**設計判断（2026-04-15 確定）**:
- Q1=B: 転勤時に公開エントリの本人名を匿名化（`user_id=NULL`）
- Q2=A: 転勤時のマイ記録は元学校に grace period 中残り、その後削除
- Q3=B: エクスポート形式は JSON + Markdown
- Q4=C: Phase 1 はスキーマ修正 + ストーリー追加のみ・API は次 Unit

**データ帰属の原則**:
- `users` 行（人格）: グローバル（テナント横断）
- `user_tenant_roles`: テナント所属の管理（転勤 = 行の差し替え）
- 公開 `journal_entries`: **テナント（学校）に帰属**・転勤後も残る・退会時は匿名化
- 非公開 `journal_entries`（マイ記録）: テナント × ユーザー・grace period 後削除
- `tags`: テナント単位・`created_by` は SET NULL で匿名化

**Phase 1 実装内容**（migration 0006・schema.ts 更新）:
- `tags.created_by` の FK を `ON DELETE SET NULL` に変更
- `invitation_tokens.invited_by` の FK を `ON DELETE SET NULL` に変更
- `journal_entries.user_id` を nullable に変更 + FK を `ON DELETE SET NULL` に変更
- `users.deleted_at TIMESTAMPTZ` カラム追加（soft delete）
- 部分インデックス `users_deleted_at_idx`（バッチ用）

**Phase 2 で実装予定**（次 Unit）:
- `POST /api/me/export` - マイ記録エクスポート（JSON / Markdown）
- `POST /api/me/withdraw` - 本人退会
- `POST /api/admin/users/[id]/remove-from-tenant` - school_admin 強制離脱
- 認証層: session callback で `deleted_at IS NOT NULL` を 401 扱い
- 物理削除バッチ Lambda（30 日経過分を CASCADE 削除）
- ログイベント: `UserExported` / `UserSoftDeleted` / `UserHardDeleted` / `UserTransferredFromTenant`
- ユニットテスト + 統合テスト Suite 9（ユーザーライフサイクル）

**残存リスク（Phase 1 完了時点）**:
- API 未実装のため、現状は手動 SQL でしか退会・転勤を処理できない
- 物理削除バッチ未実装のため、`deleted_at` セットされた行が無期限に残る
- いずれも Phase 2 で解消予定

**法的要件への対応**:
- 個人情報保護法第 19 条「保有個人データの削除請求権」 → US-T-099 anonymizePublic=false で対応
- データポータビリティ → US-T-098 で対応
- 文科省ガイドライン「利用目的達成後の速やかな削除」 → 30 日 grace + 物理削除バッチ

**横断仕様（単一真実源）**: `aidlc-docs/construction/user-lifecycle-spec.md`

**ストーリー**: `aidlc-docs/inception/user-stories/stories.md` の US-T-098/099/100, US-S-003/004 を参照

**シーケンス図**: `aidlc-docs/construction/sequence-diagrams.md` の 11〜14 を参照

---

### 🟡 論点 L: サプライチェーン攻撃対策（2026-04-15 改訂5 で追加）

**現状**: 未対応。設計レベルで明示的な対策を定義していない。

**懸念**:
- npm パッケージの悪意ある更新（過去事例: `event-stream`・`ua-parser-js` 乗っ取り）
- 依存ライブラリの既知脆弱性（CVE）への追従遅延
- `pnpm-lock.yaml` の改ざん
- ビルド時に注入される悪意あるコード
- npm Registry 経由のタイポスクワッティング

**特に本プロジェクトで注意が必要な依存関係**:
- `next` / `react` / `@auth/drizzle-adapter` / `drizzle-orm` / `pg` / `zod` / `pino`
- GitHub Actions 上で動く `aws-actions/configure-aws-credentials` 等の Action 類

**検討すべき追加対策**:

#### L-1: 依存脆弱性スキャン（CI 統合）
- **`pnpm audit`** を CI ワークフローに追加、critical/high 脆弱性で CI 失敗
- **Dependabot** or **Renovate** で自動 PR・セキュリティアップデート通知
- PR で導入される新規依存は**レビュー必須**（package.json diff の監視）

#### L-2: ロックファイル整合性検証
- `pnpm install --frozen-lockfile` を CI で強制（既に deploy.yml に記載済み）
- `pnpm-lock.yaml` の変更を git で追跡、不審な変更は PR で必ず確認
- CI で `pnpm install` 後に `pnpm-lock.yaml` が変更されていないことを検証

#### L-3: GitHub Actions の固定化
- 全 Action を**コミット SHA** で固定（タグ参照は改ざんされる可能性）
  ```yaml
  # ❌ 悪い例
  - uses: actions/checkout@v4
  # ✅ 良い例
  - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1
  ```
- Dependabot が Action の SHA 更新 PR を自動生成する設定

#### L-4: SBOM（Software Bill of Materials）生成
- CI で `pnpm list --json` or CycloneDX ツールで SBOM を生成
- ECR イメージにメタデータとして添付
- インシデント発生時に「影響パッケージが含まれているか」を即座に調査可能

#### L-5: npm provenance 活用
- npm v9.5+ の provenance 機能で、パッケージのビルド元 GitHub Actions を検証
- 依存パッケージが provenance を提供していれば CI で検証

#### L-6: ECR イメージ脆弱性スキャン
- ECR の画像スキャン機能（Amazon Inspector）を有効化
- Critical/High 脆弱性検出時に CI で deploy をブロック

**実装コスト**: CI ワークフロー更新 + 設定追加、合計 2〜3時間
**対応時期**: Unit-02 コード生成フェーズまでに L-1・L-2・L-3・L-6 を必須、L-4・L-5 は商用化前

---

### 🟢 論点 I: dev 環境の削除保護無効

**現状**:
- dev 環境の RDS は削除保護 `false`
- dev のデータはテストデータ前提

**懸念**:
- 誤操作で削除した場合、dev 環境が消滅
- 復旧に時間がかかり開発ブロック

**検討すべき追加対策**:
- dev も削除保護有効にする(コストゼロ)
- または IAM で `rds:DeleteDBInstance` を開発者から剥奪

---

### 🟢 論点 J: バックアップ・DR 戦略

**現状**:
- RDS 自動バックアップ 7日保持(dev/prod 共通)
- リージョン障害時の対策なし

**懸念**:
- 7日より前のデータ復旧ができない
- ap-northeast-1 全体が障害を起こしたら完全停止
- ポイントインタイムリカバリ(PITR)のテスト手順未定義

**検討すべき追加対策**:
- prod のバックアップ保持を 30日に延長(コスト増は小)
- 月次スナップショットを別リージョン(ap-northeast-3 大阪)にコピー
- 四半期に1回、復旧訓練(dev への復元テスト)

---

### 🟢 論点 K: コンプライアンス要件の明文化

**現状**:
- Security Baseline 拡張を有効化済み
- 「国内データ所在地要件(文科省ガイドライン)」に言及あり

**懸念**:
- 具体的にどのガイドラインのどの項目を満たすのかが未ドキュメント化
- 教育機関向け SaaS として必要な認証(ISMS・P マーク・教育情報セキュリティポリシー策定ガイドライン準拠)が未定義

**検討すべき追加対策**:
- 準拠すべき規格・ガイドラインをリスト化
- 各規格の要求事項と実装のマッピング表を作成
- 外部監査を将来計画に含める

---

## (参考) 改訂前の論点記録

当初記録された論点（改訂1・改訂2 で解消したものの原文）を参考として保持する：

### (参考) 過去の論点 C: Auth.js JWT 失効の不可能性(当初記録)

**現状**:
- Auth.js v4 JWT 戦略を採用 → セッションは DB に保存されない
- JWT 期限(デフォルト 30日)内はトークンが有効

**懸念**:
- 教員が退職した後もトークンが有効な期間が最大30日
- トークン流出時、ブラックリスト化できない
- 「ログアウトしたのに API が通る」シナリオ

**検討すべき追加対策**:
- JWT 有効期限を 8時間(1営業日)に短縮(UX とのトレードオフ)
- Auth.js のセッション戦略を `database` に変更(DB 保存・即時失効可能)
- `tenants.status = 'suspended'` チェックが全 API で強制されているか再確認

### (参考) 過去の論点 F: PII のエッジキャッシュ混入リスク(当初記録)

**現状**:
- `/api/journal/entries` を CloudFront キャッシュ対象
- キャッシュキーに `Authorization` / `Cookie` を含めない
- 公開エントリのみがこのエンドポイントで返される(アプリ側で `WHERE is_public = true`)

**懸念**:
- 万が一アプリのバグで非公開エントリが混入 → エッジキャッシュに乗り、他教員にも配信される
- キャッシュの「毒入れ攻撃」(cache poisoning)

**検討すべき追加対策**:
- レスポンスヘッダーで `Cache-Control: public` を明示的に指定(デフォルトで混乱しないように)
- 公開エントリのみを返すことを統合テストで強制
- CloudFront のレスポンスヘッダーに `Vary: X-Public-Only` のようなマーカーを付けて、カナリアテスト
- エッジキャッシュ TTL を短く(現状30秒)維持

---

## 8a. 運用フェーズで対応する既知項目（2026-04-15 改訂5 で追加）

設計書だけでは解消しない、**実装・運用フェーズで継続的に対応**する必要がある項目。これらは「考慮漏れ」ではなく「運用で担保する既知項目」として明文化する。

### 運用1: インシデント対応 Runbook 整備

**未整備**:
- セキュリティインシデント発生時の初動手順
- JWT 流出検知時の全セッション強制失効手順（技術的には `DELETE FROM sessions WHERE user_id = ?` で即時可能だが、運用手順が未文書化）
- テナントデータ漏えい時の報告プロセス
- 個人情報保護法の 72時間以内報告義務への対応フロー
- ランサムウェア・DDoS 対応手順
- CloudFront・App Runner・RDS 障害時の切り分けフローチャート

**必須項目**:

| カテゴリ | Runbook 項目 | 優先度 |
|---|---|---|
| インシデント | セッション強制失効の手順（全ユーザー / 特定テナント / 特定ユーザー） | P0 |
| インシデント | データ漏えい報告フロー（内部・法務・顧客） | P0 |
| インシデント | WAF 誤検知時の緊急除外ルール追加手順 | P1 |
| インシデント | RDS 復旧手順（PITR 実行・スナップショット復元） | P1 |
| 定期運用 | Secrets Manager ローテーション確認（月次） | P1 |
| 定期運用 | CloudWatch アラート閾値レビュー（四半期） | P2 |
| 定期運用 | IAM ロール信頼ポリシーレビュー（四半期） | P2 |
| 定期運用 | ログ保持期間・コスト監視（月次） | P2 |
| 訓練 | 年次セキュリティ訓練（模擬インシデント対応） | P2 |

**配置先**: `aidlc-docs/operations/runbooks/` （将来の operations フェーズで作成）
**対応時期**: 商用化前に P0/P1 を最低限整備

---

### 運用2: 外部ペネトレーションテスト計画

**未計画**:
- 自社内のセキュリティレビューは完了したが、**第三者視点での検証がない**
- 商用化前の最低1回は外部ペンテストを推奨
- ベンダー選定・予算・期日が未定

**推奨スコープ**:
- ブラックボックステスト（外部攻撃者視点）
- グレーボックステスト（ユーザー権限で内部調査）
- OWASP Top 10 準拠
- AWS 環境のクラウド設定ミス検査（CIS Benchmark）
- ソースコードレビュー（AI 生成コード含む）

**対応時期**:
- Phase 1: 商用化前（Unit-04 完了後）に1回実施
- Phase 2: 年次で継続（ISMS・P マーク認証取得時は必須）

**予算目安**: 150〜400万円（スコープ次第）

**ベンダー候補**:
- 国内: NRI セキュア・LAC・株式会社ラック・SecureSky Technology・トライコーダ等
- 教育機関向け実績のあるベンダーを優先選定

---

### 運用3: セキュリティトレーニング

**未定義**:
- 開発者・運用者の**人的セキュリティリテラシー**
- 技術対策だけでは防げない領域（フィッシング・ソーシャルエンジニアリング）

**必須項目**:

| トレーニング | 対象 | 頻度 |
|---|---|---|
| セキュアコーディング基礎（OWASP Top 10・CWE Top 25） | 全開発者 | 入社時 + 年次 |
| AWS セキュリティベストプラクティス | インフラ担当 | 年次 |
| フィッシング対策・パスワード管理 | 全員 | 年次 |
| インシデント対応演習 | オンコール担当 | 四半期 |
| 個人情報保護法・教育機関向けガイドライン | 全員 | 入社時 + 年次 |

**対応時期**: 商用化前にカリキュラム策定、運用開始時に初回実施

---

### 運用4: 依存パッケージの継続監視

論点 L の実装とは別に、**日常的な監視体制**が必要：

- **Dependabot アラートの定期確認**（週次）
- **npm advisory** の定期購読
- **GitHub Security Advisories** の追従
- **critical 脆弱性通知**を Slack / メールで即時受信

---

### 運用5: アラート通知先とオンコール体制

CloudWatch Alarm・SNS を設定しても、**受信者がいなければ意味がない**。

**必須整備**:
- [ ] SNS トピック `vitanota-alerts` のサブスクリプション設定（管理者メールアドレス）
- [ ] 営業時間外のオンコール担当者アサイン
- [ ] アラート優先度の定義（P0: 即時対応 / P1: 24h 以内 / P2: 翌営業日）
- [ ] エスカレーションフロー（担当者が応答しない場合の次の連絡先）

**対応時期**: 商用化前

---

## 9. セキュリティレビュー サマリー（改訂5 時点）

| 評価 | 件数 | 備考 |
|---|---|---|
| 🟢 既に対策済み（当初） | 多数 | WAF・多層防御・RLS・pino redact・IAM認証・暗号化等 |
| ✅ 2026-04-15 改訂で対応 | **8項目** | C（改訂1）・F（改訂1）・D（改訂2）・E（改訂2）・G（改訂2）・H（改訂2・改訂4）・A（改訂3）・B（改訂3） |
| 🟡 実装フェーズで対応 | **1項目** | L（サプライチェーン攻撃対策、改訂5 で追加） |
| 🟢 将来拡張候補 | 3項目 | I・J・K（商用化計画時に検討） |
| 🔵 運用フェーズで継続対応 | 5項目 | Runbook 整備・外部ペンテスト・セキュリティトレーニング・依存監視・オンコール体制 |
| 🔴 Critical 未対応 | 0 | 即時対応必須な既知の穴はなし |

**構造的に残る唯一のリスク**: App Runner のパブリックエンドポイント（論点 A の基礎条件）。X-CloudFront-Secret 月次ローテーション・直接アクセス検知・Permission Boundary で多層防御しているが、根本解決は将来の App Runner VPC-only 対応 or ECS Fargate 移行待ち。

**全体評価**: Unit-01 + Unit-02 の設計段階で**教育機関向け BtoB SaaS として商用化可能なセキュリティ基盤**を構築。当初の P0/P1 論点は全て設計に反映済み。残存する論点 A・B は運用監視で継続対応、I・J・K は商用化計画時に検討。

---

## 10. 次のアクション(論点整理)

### 実装フェーズのアクション

| 優先度 | アクション | 期日 |
|---|---|---|
| P0 | Unit-02 コード生成時に統合テスト（integration-test-plan.md）を実装 | Unit-02 コード生成フェーズ |
| P0 | Unit-01 インフラ遡及変更をコード・IaC に反映（CloudFront + WAF + sessions テーブル + S3 監査 + Lambda ロール分離 + OIDC 厳密化） | Unit-02 リリース前 |
| P1 | Unit-01 の sessions テーブルマイグレーションを作成 | Unit-02 リリース前 |
| P1 | S3 監査ログバケット・Firehose を prod 環境に構築 | Unit-02 リリース前 |
| P1 | Lambda マイグレーター IAM ロール3分離を構築 | Unit-02 リリース前 |
| P1 | GitHub Actions OIDC トラストポリシー更新 | Unit-02 リリース前 |

### 運用フェーズのアクション

| 優先度 | アクション | 期日 |
|---|---|---|
| P2 | 論点 A 実装: Lambda header-rotator + EventBridge + gitleaks + 直接アクセス検知 | Unit-02 リリース後 |
| P2 | 論点 B 実装: CloudTrail 監査 + RDS 接続元 IP 監視 Lambda + Permission Boundary 全ロール適用 | Unit-02 リリース後 |
| P1 | 論点 L 実装: pnpm audit・Dependabot・Actions SHA 固定・ECR Inspector | Unit-02 コード生成フェーズ |
| P2 | 論点 L 追加: SBOM 生成・npm provenance 検証 | 商用化前 |

### 運用フェーズのアクション（改訂5 追加）

| 優先度 | アクション | 期日 |
|---|---|---|
| P0 | インシデント対応 Runbook P0 項目整備（セッション失効・データ漏えい報告） | 商用化前 |
| P0 | SNS サブスクリプション設定・オンコール体制構築 | 商用化前 |
| P1 | 外部ペネトレーションテスト実施 | 商用化前（Unit-04 完了後） |
| P1 | セキュリティトレーニングカリキュラム策定・初回実施 | 商用化前 |
| P2 | Runbook P1 項目整備（WAF 除外・RDS 復旧・Secrets ローテーション確認） | 商用化後 3ヶ月以内 |
| P2 | 年次セキュリティ訓練（模擬インシデント対応） | 商用化後、年次 |
| P3 | 論点 I: dev 削除保護有効化・IAM 権限剥奪 | 商用化計画時 |
| P3 | 論点 J: prod バックアップ 30日延長・別リージョンスナップショット・復旧訓練 | 商用化計画時 |
| P3 | 論点 K: コンプライアンス要件マッピング表作成・外部監査計画 | 商用化計画時 |

---

## 関連ドキュメント

- `aidlc-docs/construction/unit-01/infrastructure-design/infrastructure-design.md` - Unit-01 インフラ詳細
- `aidlc-docs/construction/unit-01/infrastructure-design/deployment-architecture.md` - Unit-01 デプロイ
- `aidlc-docs/construction/unit-01/nfr-design/nfr-design-patterns.md` - SP-07 Database セッション戦略ほか
- `aidlc-docs/construction/unit-02/infrastructure-design/infrastructure-design.md` - Unit-02 インフラ詳細
- `aidlc-docs/construction/unit-02/infrastructure-design/deployment-architecture.md` - Unit-02 デプロイ
- `aidlc-docs/construction/unit-02/nfr-design/nfr-design-patterns.md` - SP-U02-04 is_public 多層防御ほか
- `aidlc-docs/construction/unit-02/nfr-design/logical-components.md` - Repository 型分離
- `aidlc-docs/construction/unit-02/nfr-design/operational-risks.md` - 運用リスクレジスタ
- `aidlc-docs/construction/unit-02/nfr-design/integration-test-plan.md` - マルチテナント隔離統合テスト計画
