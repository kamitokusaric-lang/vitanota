# Unit-03 デプロイアーキテクチャ

**作成日**: 2026-04-17

---

## デプロイ手順

Unit-03 のデプロイは以下の順序で実行する。

### Step 1: DB マイグレーション実行

```bash
# 0010: tags テーブルの type/category enum 追加 + is_emotion 削除
pnpm drizzle-kit push

# 0011: 新規システムデフォルトタグの全テナントシード
# (マイグレーションファイルとして実行)
```

**注意点**:
- マイグレーション 0010 は `ALTER TABLE` + `UPDATE` + `DROP COLUMN` を含む
- 既存のアプリケーションコードが `is_emotion` を参照している場合、アプリデプロイ前にコード側の更新が必要
- **推奨デプロイ順序**: コードデプロイ（`is_emotion` → `type` 参照に変更）→ マイグレーション実行
- ただし、コードが両方のカラムに対応できるよう段階的に移行することも可能

### Step 2: アプリケーションデプロイ

```bash
# App Runner への通常デプロイ（既存 CI/CD フロー）
git push origin main
# → GitHub Actions → App Runner 自動デプロイ
```

### Step 3: 動作確認

- [ ] `/dashboard/teacher` ページが表示されること
- [ ] 感情傾向グラフがデータに応じて表示される（またはガイドメッセージ）
- [ ] `/journal` ページ上部にサマリーカードが表示されること
- [ ] タグ選択 UI で感情タグとコンテキストタグがグループ分けされること
- [ ] 他テナントのデータが混入しないこと

---

## 既存アーキテクチャ（変更なし）

```
CloudFront → App Runner (Next.js) → RDS Proxy → RDS PostgreSQL
                                                    ↑
                                              RLS 適用
```

Unit-03 はこの構成に新しいコンポーネントを追加しない。
