# Unit-04 デプロイアーキテクチャ

**作成日**: 2026-04-17

---

## デプロイ手順

### Step 1: DB マイグレーション実行

```bash
# ローカル
cat migrations/0012_unit04_alerts.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev

# 本番
# Lambda db-migrator で実行（Unit-02 Step 19 で参考実装済み）
```

### Step 2: アプリケーションデプロイ

```bash
git push origin main
# → GitHub Actions → App Runner 自動デプロイ
```

### Step 3: 動作確認

- [ ] school_admin でログインし `/dashboard/admin` が表示される
- [ ] 全教員のステータスカードが表示される（感情比率バー + 最終記録日）
- [ ] 教員カードクリックで感情傾向グラフが表示される
- [ ] teacher ロールで `/api/admin/teachers` を叩くと 403
- [ ] アラート検知を手動実行できる
- [ ] アラート一覧が表示され、クローズできる
- [ ] 管理者 API のレスポンスに日誌本文が含まれないこと

---

## 既存アーキテクチャ（変更なし）

```
CloudFront → App Runner (Next.js) → RDS Proxy → RDS PostgreSQL
                                                    ↑
                                              RLS 適用
```
