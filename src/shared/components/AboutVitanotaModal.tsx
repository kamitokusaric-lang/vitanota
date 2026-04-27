// vitanota の世界観を 1 枚の図で伝えるモーダル
// ヘッダーの「vitanotaとは」リンクから開く。全ロール共通表示。
import { Modal } from '@/shared/components/Modal';

interface AboutVitanotaModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutVitanotaModal({ open, onClose }: AboutVitanotaModalProps) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-5xl">
      <img
        src="/about-vitanota.png"
        alt="vitanotaが実現したいこと: 先生たちが無理なく働き続けられる学校へ。vitanotaに日々の活動を残す → 他の先生の活動が見える → 声をかけたり手を貸したりする"
        className="block h-auto w-full"
        data-testid="about-vitanota-modal"
      />
    </Modal>
  );
}
