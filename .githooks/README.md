# Git Hooks セットアップ

論点 L-3 (サプライチェーン攻撃対策) のために、開発者ローカルで以下のフックを使用します。

## 有効化

リポジトリのクローン後、1度だけ実行：

```bash
git config core.hooksPath .githooks
```

## 必要なツール

```bash
# macOS
brew install gitleaks

# Linux
# https://github.com/gitleaks/gitleaks/releases から最新版をダウンロード
```

## フック一覧

| フック | 役割 |
|---|---|
| `pre-commit` | gitleaks でシークレット混入を検知 |

## 動作確認

```bash
# テスト用にダミーシークレットを含むファイルを作成して add
echo "AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE" > test-secret.env
git add test-secret.env

# コミット試行 → フックが拒否するはず
git commit -m "test"

# 後始末
git reset HEAD test-secret.env
rm test-secret.env
```

## 誤検知への対応

`.gitleaks.toml` を作成してルールをカスタマイズできます。詳細は gitleaks 公式ドキュメント参照。
