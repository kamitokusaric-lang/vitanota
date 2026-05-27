// 汎用モーダルダイアログ
// 閉じる経路: 右上 × button / Escape
// 2026-05-27 chimo 指示: backdrop クリック閉じを撤廃 (投稿中に外側クリックで誤閉じ問題)。
// chimo 2026-05-21: createPortal で document.body 直下にレンダリング。
//   親側の backdrop-filter / overflow:hidden 等で生まれる stacking context に
//   阻害されて sticky ヘッダがモーダル前面に被るのを防ぐ。
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}: ModalProps) {
  // SSR 安全のため、 client mount を待ってから portal を返す
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    // body スクロール禁止
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      data-testid="modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative ${maxWidth} max-h-[90vh] w-full overflow-y-auto rounded-vn border border-vn-border bg-white p-6 shadow-lg`}
        data-testid="modal-content"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
          data-testid="modal-close-button"
        >
          <X size={20} strokeWidth={2} aria-hidden />
        </button>
        {title && (
          <h2 className="mb-4 pr-8 text-lg font-semibold text-gray-900">{title}</h2>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
