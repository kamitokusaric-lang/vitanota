// TypeScript 6 は CSS の side-effect import (例: pages/_app.tsx の
// `import '../src/styles/globals.css'`) に型宣言を要求する (TS2882)。
// Next.js のビルドが実際の CSS バンドルを処理するため、型上は空モジュールで足りる。
declare module '*.css';
