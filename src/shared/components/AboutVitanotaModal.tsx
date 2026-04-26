// vitanota の世界観とこれからの進展を伝えるモーダル
// ヘッダーの「vitanotaとは」リンクから開く。全ロール共通表示。
import { Modal } from '@/shared/components/Modal';

interface AboutVitanotaModalProps {
  open: boolean;
  onClose: () => void;
}

const teacherActions = [
  'その日の気分や出来事を、ひとこと残してみてください',
  '他の先生たちの投稿に、興味を持ってみてください',
  '先生同士で、小さな声かけをしてみてください',
  'うまくいったことを書くことで、学校全体にナレッジを循環させてください',
];

const notDoing = [
  '書いた内容によって評価されることはありません',
  '管理者だけが見える個人情報はありません',
  '書いた内容が、外部の AI で個人として分析されることはありません',
];

export function AboutVitanotaModal({ open, onClose }: AboutVitanotaModalProps) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-xl">
      <div
        className="space-y-10 text-[15px] leading-[1.9] text-gray-700"
        data-testid="about-vitanota-modal"
      >
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-vn-accent">
            About vitanota
          </p>
          <h2 className="text-xl font-semibold leading-snug text-gray-900">
            先生たちが支え合える仕組みづくり
          </h2>
        </header>

        <div className="space-y-5">
          <p>
            学校では、毎日たくさんのことが同時に動いています。目の前のことに向き合いながら、それぞれがいろいろな思いを抱えて過ごしています。
          </p>
          <p>
            vitanota は、その日の気分やちょっとした出来事を、気軽に残しておける場所です。
          </p>
        </div>

        <Section title="先生方にお願いしたいこと">
          <BulletList items={teacherActions} />
        </Section>

        <Section title="しないこと">
          <BulletList items={notDoing} />
        </Section>

        <Section title="これから">
          <p>
            先生たちのフィードバックをもとに、2 週間単位で機能アップデートのサイクルを回していきます。使いながら、気づいたことや感じたことがあれば、ぜひ教えてください。
          </p>
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-vn-accent">
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-gray-300" />
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}
