import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';

const SLIDES = [
  '/concept/page-1.png',
  '/concept/page-2.png',
  '/concept/page-3.png',
  '/concept/page-4.png',
  '/concept/page-5.png',
];

interface AboutVitanotaModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutVitanotaModal({ open, onClose }: AboutVitanotaModalProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIndex((p) => Math.max(0, p - 1));
      else if (e.key === 'ArrowRight')
        setIndex((p) => Math.min(SLIDES.length - 1, p + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-5xl">
      <div className="relative" data-testid="about-vitanota-modal">
        <img
          src={SLIDES[index]}
          alt={`vitanota コンセプトスライド ${index + 1} / ${SLIDES.length}`}
          className="block h-auto w-full"
        />
        <button
          type="button"
          onClick={() => setIndex((p) => Math.max(0, p - 1))}
          disabled={index === 0}
          aria-label="前のスライド"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow transition-opacity disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() =>
            setIndex((p) => Math.min(SLIDES.length - 1, p + 1))
          }
          disabled={index === SLIDES.length - 1}
          aria-label="次のスライド"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow transition-opacity disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-3 flex justify-center gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`スライド ${i + 1} へ`}
            aria-current={i === index ? 'true' : undefined}
            className={`h-2 w-2 rounded-full transition-colors ${
              i === index
                ? 'bg-vn-accent'
                : 'bg-vn-border hover:bg-vn-muted'
            }`}
          />
        ))}
      </div>
    </Modal>
  );
}
