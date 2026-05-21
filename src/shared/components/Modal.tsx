// 汎用モーダルダイアログ
// backdrop クリック / Escape で閉じる
// chimo 2026-05-21: createPortal で document.body 直下にレンダリング。
//   親側の backdrop-filter / overflow:hidden 等で生まれる stacking context に
//   阻害されて sticky ヘッダがモーダル前面に被るのを防ぐ。
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
      onClick={onClose}
      data-testid="modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`${maxWidth} max-h-[90vh] w-full overflow-y-auto rounded-vn border border-vn-border bg-white p-6 shadow-lg`}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-content"
      >
        {title && (
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
