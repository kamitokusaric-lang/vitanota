// chip ボタン直下に開く popover の開閉・位置計算・外側クリック/ESC 検出を共通化する hook。
// タスク系のフィルタ (担当者 / タグ / カテゴリ / 期間) と担当者入力で同型のロジックが
// 重複していたため抽出 (描画は各コンポーネントに残し、本 hook は state/ref/style のみ提供)。
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

interface UsePopoverOptions {
  // popover の最小幅 (px)。trigger 幅とこの値の大きい方を採用。既定 200。
  minWidth?: number;
  // 画面下端までに収まるよう maxHeight を付与するか。長いリスト向けに既定 true。
  // 期間フィルタのように高さ固定で良い場合は false。
  maxHeight?: boolean;
}

// trigger 要素はボタン (フィルタ chip) のことが多いが、div の input 風 box の場合もあるため
// 型変数で切り替えられるようにしている (既定はボタン)。
export function usePopover<TTrigger extends HTMLElement = HTMLButtonElement>(
  opts?: UsePopoverOptions,
) {
  const minWidth = opts?.minWidth ?? 200;
  const withMaxHeight = opts?.maxHeight ?? true;

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<TTrigger>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPopoverStyle(null);
      return;
    }
    const r = triggerRef.current.getBoundingClientRect();
    const style: CSSProperties = {
      position: 'fixed',
      top: r.bottom + 4,
      left: r.left,
      minWidth: Math.max(r.width, minWidth),
      zIndex: 60,
    };
    if (withMaxHeight) {
      const margin = 16;
      style.maxHeight = Math.max(160, window.innerHeight - r.bottom - margin);
    }
    setPopoverStyle(style);
  }, [open, minWidth, withMaxHeight]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, wrapRef, triggerRef, popoverRef, popoverStyle };
}
