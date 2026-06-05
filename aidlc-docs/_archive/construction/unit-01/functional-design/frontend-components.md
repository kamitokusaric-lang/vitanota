# Unit-01 フロントエンドコンポーネント

## コンポーネント一覧

| コンポーネント | ファイルパス | 種別 |
|---|---|---|
| LoginPage | `pages/auth/signin.tsx` | ページ |
| TenantGuard | `src/features/auth/components/TenantGuard.tsx` | HOC |
| RoleGuard | `src/features/auth/components/RoleGuard.tsx` | HOC |
| Layout | `src/shared/components/Layout.tsx` | 共通 |
| Button | `src/shared/components/Button.tsx` | 共通 |
| LoadingSpinner | `src/shared/components/LoadingSpinner.tsx` | 共通 |
| ErrorMessage | `src/shared/components/ErrorMessage.tsx` | 共通 |

---

## LoginPage

**ファイル**: `pages/auth/signin.tsx`

**責務**: Google OAuth ログインのエントリポイント。シンプルなログイン画面。

**Props**:
```typescript
interface LoginPageProps {
  error?: string;  // Auth.js からのエラー（クエリパラメータ）
}
```

**State**: なし（サーバーサイドレンダリング）

**UI 要素**:
- vitanota ロゴ（テキストロゴ、フェーズ1ではシンプルな `h1` タグ）
- サービス説明文: 「教員のウェルネスをサポートするツール」（1行）
- 「Google でログイン」ボタン（`Button` コンポーネント使用）
- エラー表示（エラーがある場合のみ `ErrorMessage` コンポーネント）

**インタラクション**:
- 「Google でログイン」クリック → `signIn('google', { callbackUrl: '/' })` を呼び出す
- ログイン成功 → ロール別リダイレクト（BP-01 参照）
- ログイン失敗 → `error` クエリパラメータ付きで signin ページに戻る

**エラーメッセージマッピング**:
```
'OAuthAccountNotLinked' → 「このメールアドレスは別のログイン方式で登録されています」
'AccessDenied'          → 「アカウントが見つかりません。招待リンクからサインアップしてください」
default                 → 「ログインに失敗しました。再度お試しください」
```

**データフェッチ**: なし（サーバーサイドで Auth.js が処理）

---

## TenantGuard

**ファイル**: `src/features/auth/components/TenantGuard.tsx`

**責務**: 保護されたページに適用する高次コンポーネント（HOC）。セッション・テナント状態を検証する。

**Props**:
```typescript
interface TenantGuardProps {
  children: React.ReactNode;
  session: VitanotaSession | null;
}
```

**State**: なし

**ロジック**:
```
session === null
  → useRouter().push('/auth/signin') → null を返す（リダイレクト中）

session.user.tenantStatus === 'suspended'
  → <TenantSuspendedMessage /> を表示

上記以外
  → children を描画
```

**TenantSuspendedMessage（インライン）**:
- 「このテナントは現在停止中です。管理者にお問い合わせください。」
- ログアウトボタン

**使用箇所**: `getServerSideProps` でセッション取得後、`_app.tsx` または各ページで適用

---

## RoleGuard

**ファイル**: `src/features/auth/components/RoleGuard.tsx`

**責務**: 指定ロールを持つユーザーのみにコンテンツを表示する。

**Props**:
```typescript
interface RoleGuardProps {
  children: React.ReactNode;
  session: VitanotaSession;
  requiredRole: 'teacher' | 'school_admin' | 'system_admin';
  fallback?: React.ReactNode;  // ロール不足時の表示（省略時は null）
}
```

**State**: なし

**ロジック**:
```
session.user.roles.includes(requiredRole)
  → children を描画
  → そうでなければ fallback または null を返す
```

**注記**: API レベルでも必ず同様のロールチェックを行う（フロントのみに依存しない）

---

## Layout（共通）

**ファイル**: `src/shared/components/Layout.tsx`

**責務**: 全保護ページ共通のナビゲーションバー付きレイアウト。

**Props**:
```typescript
interface LayoutProps {
  children: React.ReactNode;
  session: VitanotaSession;
}
```

**State**: なし

**UI 要素**:
- ナビゲーションバー（上部固定）:
  - 左: vitanota ロゴ（テキスト）
  - 中央（複数ロールユーザーの場合のみ）:
    - 「教員ビュー」リンク → `/dashboard/teacher`（teacher ロールを持つ場合）
    - 「管理者ビュー」リンク → `/dashboard/admin`（school_admin ロールを持つ場合）
  - 右: ユーザー名 + 「ログアウト」ボタン
- メインコンテンツエリア: `<main>{children}</main>`

**インタラクション**:
- 「ログアウト」クリック → `signOut({ callbackUrl: '/auth/signin' })`

---

## Button（共通）

**ファイル**: `src/shared/components/Button.tsx`

**責務**: 汎用ボタンコンポーネント。バリアント・ローディング状態・無効状態をサポート。

**Props**:
```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';  // default: 'primary'
  isLoading?: boolean;
  children: React.ReactNode;
}
```

**State**: なし

**UI 要素**:
- ローディング中は `LoadingSpinner` を表示し、テキストを非表示
- 無効状態（`disabled` または `isLoading`）は操作不可・スタイル変更

**バリアントスタイル**:
- primary: 塗りつぶし（メインアクション）
- secondary: ボーダーのみ（サブアクション）
- danger: 赤（削除・警告アクション）

---

## LoadingSpinner（共通）

**ファイル**: `src/shared/components/LoadingSpinner.tsx`

**責務**: ローディング状態を示すスピナーアニメーション。

**Props**:
```typescript
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';  // default: 'md'
  label?: string;              // アクセシビリティ用ラベル（aria-label）
}
```

**State**: なし

**アクセシビリティ**: `role="status"` と `aria-label` を設定

---

## ErrorMessage（共通）

**ファイル**: `src/shared/components/ErrorMessage.tsx`

**責務**: エラーメッセージを表示する汎用コンポーネント。

**Props**:
```typescript
interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;  // リトライボタンを表示する場合
}
```

**State**: なし

**UI 要素**:
- エラーアイコン + メッセージテキスト
- `onRetry` が指定された場合: 「再試行」ボタン

---

## ページルーティングと認証フロー

```
アクセス先               認証要件              セッションなし時
/auth/signin            なし（公開）          そのまま表示
/dashboard/teacher      teacher ロール必須    → /auth/signin
/dashboard/admin        school_admin 必須     → /auth/signin
/admin/tenants          system_admin 必須     → /auth/signin
```

**getServerSideProps パターン（全保護ページ共通）**:
```typescript
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  // ロールチェックは各ページで実施
  return { props: { session } };
};
```

---

## フォームバリデーション（Unit-01 スコープ内）

Unit-01 のフォームはログインボタンのみで、入力フォームを持たない。
バリデーション基盤（Zod スキーマ）は API Routes で使用し、
フロントエンドのフォームバリデーションは Unit-02 以降で実装する。
