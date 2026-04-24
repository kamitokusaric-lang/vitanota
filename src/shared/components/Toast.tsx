// シンプルなトースト通知 (自作、ライブラリ不使用)
// 使い方:
//   - _app.tsx 相当の最上位で <ToastProvider> で囲む
//   - 任意の子コンポーネントで useToast() → showToast('保存しました', 'success')
//   - 3 秒後に自動で消える
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type ToastTone = 'info' | 'success' | 'error';

interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (text: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLE: Record<ToastTone, string> = {
  info: 'bg-gray-800 text-white',
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setMessages((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
        data-testid="toast-container"
        role="status"
        aria-live="polite"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={[
              'min-w-[200px] rounded-md px-4 py-2 text-sm shadow-lg',
              TONE_STYLE[m.tone],
            ].join(' ')}
            data-testid={`toast-${m.tone}`}
          >
            {m.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // ToastProvider なしでも動くフォールバック (テスト等)
    return {
      showToast: (text) => {
        // eslint-disable-next-line no-console
        console.log('[toast]', text);
      },
    };
  }
  return ctx;
}
