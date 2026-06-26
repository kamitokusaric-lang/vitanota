// マイノート (自分の全投稿)。chimo 2026-06-11 関係図の「個人の作業場」。
// diary 以外も含む全 kind。自分の公開・非公開どちらも (個人面なので)。
// chimo 2026-06-14: 日付ごとにグループ化し、枠なしフラットに表示。各行に種別を表示。
// chimo 2026-06-15: 各行に 鉛筆 (編集) / ゴミ箱 (削除) アイコンを追加。
//   編集フォームは投稿フォームと統一 (chimo 2026-06-15):
//   - diary → DiaryNoteBox を編集モードで開く (mood/本文/気持ちタグ)。
//   - それ以外 (tweet/knowledge + board 4 種) → TodayCaptureBox を編集モードで開く
//     (本文編集。kind は journal 編集 API が書き換えないため据え置き・チップは固定表示)。
//   削除は全種別で可能。
import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Globe, Lock, Pencil, Trash2 } from 'lucide-react';
import { jsonFetcher } from '@/shared/lib/fetcher';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { DiaryNoteBox } from '@/features/journal/components/DiaryNoteBox';
import {
  TodayCaptureBox,
  type CaptureKind,
} from '@/features/journal/components/TodayCaptureBox';
import type { MoodLevel } from '@/features/journal/schemas/journal';
import {
  getMoodIcon,
  getMoodLabel,
  getMoodOption,
} from '@/features/journal/lib/mood-options';
import {
  parseReflection,
  REFLECTION_SECTIONS,
} from '@/features/journal/lib/reflectionTemplate';

interface MyEntry {
  id: string;
  kind: string;
  content: string;
  isPublic: boolean;
  createdAt: string;
  // mine API は mood / 気持ちタグ (emotion_tags) も返す (今まで型で受けていなかった)。
  mood?: MoodLevel | null;
  tags?: Array<{ id: string; name: string; category?: SentimentCategory }>;
}

// 感情カテゴリ (positive/neutral/negative) → 文字色。mood マークと気持ちタグで共通 (chimo 2026-06-26)。
// positive=緑 / neutral=スレート / negative=暖色 (リアクションの意味色分けと一貫)。
type SentimentCategory = 'positive' | 'neutral' | 'negative';
const SENTIMENT_TEXT: Record<SentimentCategory, string> = {
  positive: 'text-vn-green-text',
  neutral: 'text-slate-500',
  negative: 'text-vn-warning-text',
};
function sentimentText(cat: SentimentCategory | undefined | null): string {
  return cat ? SENTIMENT_TEXT[cat] : 'text-gray-500';
}

const KIND_META: Record<string, { label: string; pill: string }> = {
  note: { label: 'ノート', pill: 'bg-vn-muted-bg text-slate-600' },
  // 旧値 (note へ移行済・新規では出ない。万一の残存に備え残置)。
  diary: { label: 'ノート', pill: 'bg-vn-muted-bg text-slate-600' },
  tweet: { label: 'ノート', pill: 'bg-slate-100 text-slate-600' },
  knowledge: { label: 'ノート', pill: 'bg-vn-yellow-bg text-vn-yellow-text' },
  keep: { label: '続けたい', pill: 'bg-vn-green-bg text-vn-green-text' },
  concern: { label: '気になる', pill: 'bg-vn-warning-bg text-vn-warning-text' },
  help: { label: '相談', pill: 'bg-vn-accent-bg text-vn-accent-text' },
  thanks: { label: '感謝', pill: 'bg-vn-pink-bg text-vn-pink-text' },
};

// note 系 (私的記録を集約した kind・旧 diary/tweet/knowledge 含む) は公開先で呼び名が変わる。
// 自分だけ (非公開) = ふりかえり / 職員室に投稿 (公開) = つぶやき (chimo 2026-06-26)。
// つぶやきの pill は右レーンの「つぶやき」チップと同じ青系で揃える (chimo 2026-06-26)。
// board ネイティブ種別 (keep/concern/help/thanks) は KIND_META の名前・色のまま。
const NOTE_FAMILY = new Set(['note', 'diary', 'tweet', 'knowledge']);
function entryMeta(e: MyEntry): { label: string; pill: string } {
  if (NOTE_FAMILY.has(e.kind)) {
    return e.isPublic
      ? { label: 'つぶやき', pill: 'bg-vn-blue-bg text-vn-blue-text' }
      : { label: 'ふりかえり', pill: 'bg-vn-muted-bg text-slate-600' };
  }
  return KIND_META[e.kind] ?? { label: e.kind, pill: 'bg-slate-100 text-slate-600' };
}

// 本文表示。3 行日誌テンプレ (ふりかえり) は見出しを太字にして本文と区別する (chimo 2026-06-26)。
// テンプレ以外 (自由記述・つぶやき・board 種別) は従来どおり本文をそのまま表示。
function EntryBody({ entry }: { entry: MyEntry }) {
  const parsed =
    NOTE_FAMILY.has(entry.kind) && !entry.isPublic
      ? parseReflection(entry.content)
      : null;
  if (parsed?.isTemplate) {
    return (
      <div className="mt-1 space-y-2">
        {REFLECTION_SECTIONS.filter((s) => parsed.values[s.key].trim() !== '').map(
          (s) => (
            <div key={s.key}>
              <p className="text-[13px] font-bold text-slate-600">{s.heading}</p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                {parsed.values[s.key]}
              </p>
            </div>
          ),
        )}
      </div>
    );
  }
  return (
    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
      {entry.content}
    </p>
  );
}

const MINE_KEY = '/api/private/journal/entries/mine?page=1&perPage=50';

// ISO → JST の YYYY-MM-DD (グループキー)
function jstDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(iso));
}
// YYYY-MM-DD → 「今日」「昨日」、それ以前は「M月D日」(chimo 2026-06-25)
function dateLabel(key: string): string {
  const now = new Date();
  const todayKey = jstDateKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = jstDateKey(yesterday.toISOString());
  if (key === todayKey) return '今日';
  if (key === yesterdayKey) return '昨日';
  const [, m, d] = key.split('-');
  return `${Number(m)}月${Number(d)}日`;
}
// ISO → JST の HH:MM
function jstTime(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'edit'; entry: MyEntry }
  | { kind: 'confirm-delete'; entryId: string };

export function MyNotesByKind() {
  const { mutate: globalMutate } = useSWRConfig();
  const { data, isLoading } = useSWR<{ entries: MyEntry[] }>(MINE_KEY, jsonFetcher);
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  // マイノート (/mine・no-store) は revalidate で最新化。公開タイムライン (/public) は
  // browser cache で revalidate が stale を返すため触らない:
  //   - 編集の /public 反映は TodayCaptureBox 側で楽観的に更新する。
  //   - 削除はここで /public から楽観的に除去する。
  const revalidateMine = () =>
    globalMutate(
      (key: unknown) =>
        typeof key === 'string' && key.startsWith('/api/private/journal/entries'),
    );

  const handleEditSuccess = async () => {
    setModal({ kind: 'closed' });
    await revalidateMine();
  };

  const handleDeleteSuccess = async (deletedId: string) => {
    setModal({ kind: 'closed' });
    void globalMutate(
      (key: unknown) =>
        typeof key === 'string' && key.startsWith('/api/public/journal/entries'),
      (cur: { entries?: Array<{ id: string }> } | undefined) =>
        cur?.entries
          ? { ...cur, entries: cur.entries.filter((e) => e.id !== deletedId) }
          : cur,
      { revalidate: false },
    );
    await revalidateMine();
  };

  // 日付 (JST) ごとにグループ化。entries は created_at 降順なので挿入順も降順。
  const groups = useMemo(() => {
    const map = new Map<string, MyEntry[]>();
    for (const e of entries) {
      const key = jstDateKey(e.createdAt);
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()];
  }, [entries]);

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-gray-400">読み込み中…</p>;
  }

  if (entries.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">まだありません。</p>;
  }

  return (
    <div className="space-y-5">
      {groups.map(([key, items]) => (
        <div key={key}>
          <h3 className="mb-2 text-base font-bold text-slate-700">{dateLabel(key)}</h3>
          <div className="space-y-2.5">
            {items.map((e) => {
              const meta = entryMeta(e);
              return (
                <div
                  key={e.id}
                  className="rounded-[12px] border border-vn-border bg-vn-surface px-4 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.035)]"
                  data-testid={`my-notes-item-${e.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${meta.pill}`}
                      >
                        {meta.label}
                      </span>
                      {e.isPublic ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Globe size={11} aria-hidden />
                          公開
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5">
                          <Lock size={11} aria-hidden />
                          自分だけ
                        </span>
                      )}
                      <span>{jstTime(e.createdAt)}</span>
                      {(() => {
                        // 気分を時刻の後ろにマーク表示 (本人選択・自分のカードのみ可視)。
                        const MoodIcon = getMoodIcon(e.mood);
                        if (!MoodIcon) return null;
                        const moodLabel = getMoodLabel(e.mood);
                        const cat = getMoodOption(e.mood)?.value as
                          | SentimentCategory
                          | undefined;
                        return (
                          <MoodIcon
                            size={13}
                            className={sentimentText(cat)}
                            aria-label={moodLabel ?? '気分'}
                            data-testid={`my-notes-mood-${e.id}`}
                          />
                        );
                      })()}
                    </div>
                    <MyNoteRowActions
                      entryId={e.id}
                      onEdit={() => setModal({ kind: 'edit', entry: e })}
                      onDelete={() => setModal({ kind: 'confirm-delete', entryId: e.id })}
                    />
                  </div>
                  <EntryBody entry={e} />
                  {e.tags && e.tags.length > 0 && (
                    <div
                      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"
                      data-testid={`my-notes-tags-${e.id}`}
                    >
                      {e.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className={`text-xs font-medium ${sentimentText(tag.category)}`}
                        >
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Modal
        open={modal.kind === 'edit'}
        onClose={() => setModal({ kind: 'closed' })}
        title={
          modal.kind === 'edit' && modal.entry.kind === 'note' && !modal.entry.isPublic
            ? 'メモを編集'
            : '職員室ノートを編集'
        }
        maxWidth="max-w-xl"
      >
        {modal.kind === 'edit' &&
          // 私的 note (倉庫) は mood つきの DiaryNoteBox で編集。公開投稿・board は TodayCaptureBox。
          (modal.entry.kind === 'note' && !modal.entry.isPublic ? (
            <DiaryEditModalBody entry={modal.entry} onSuccess={handleEditSuccess} />
          ) : (
            <TodayCaptureBox
              editId={modal.entry.id}
              initialContent={modal.entry.content}
              initialKind={modal.entry.kind as CaptureKind}
              onSuccess={handleEditSuccess}
            />
          ))}
      </Modal>

      <Modal
        open={modal.kind === 'confirm-delete'}
        onClose={() => setModal({ kind: 'closed' })}
        title="記録を削除しますか?"
      >
        {modal.kind === 'confirm-delete' && (
          <ConfirmDeleteModalBody
            entryId={modal.entryId}
            onSuccess={() => handleDeleteSuccess(modal.entryId)}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>
    </div>
  );
}

// 各行のアクション: 鉛筆 (編集) / ゴミ箱 (削除) アイコン。
// hover / focus で「編集する」「削除する」のツールチップを出す (レーンのリアクションと同型)。
function MyNoteRowActions({
  entryId,
  onEdit,
  onDelete,
}: {
  entryId: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label="編集する"
        className="group/edit relative flex h-7 w-7 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        data-testid={`my-notes-edit-button-${entryId}`}
      >
        <Pencil size={15} strokeWidth={1.75} aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100"
        >
          編集する
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="削除する"
        className="group/delete relative flex h-7 w-7 items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
        data-testid={`my-notes-delete-button-${entryId}`}
      >
        <Trash2 size={15} strokeWidth={1.75} aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/delete:opacity-100 group-focus-visible/delete:opacity-100"
        >
          削除する
        </span>
      </button>
    </div>
  );
}

interface EntryDetailResponse {
  entry: {
    id: string;
    content: string;
    mood: MoodLevel | null;
    tags?: Array<{ id: string }>;
  };
}

// 日々ノートの編集: 既存 entry の詳細 (mood / 気持ちタグ) を fetch → DiaryNoteBox を編集モードで開く。
// (投稿フォームと同一 UI で統一・chimo 2026-06-15)
function DiaryEditModalBody({
  entry,
  onSuccess,
}: {
  entry: MyEntry;
  onSuccess: () => Promise<void>;
}) {
  const { data, error, isLoading } = useSWR(
    `/api/private/journal/entries/${entry.id}`,
    jsonFetcher<EntryDetailResponse>,
  );

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <LoadingSpinner label="読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorMessage message="エントリの取得に失敗しました" />;
  }

  return (
    <DiaryNoteBox
      editId={data.entry.id}
      initialContent={data.entry.content}
      initialMood={data.entry.mood}
      initialTagIds={data.entry.tags?.map((t) => t.id) ?? []}
      onSuccess={onSuccess}
    />
  );
}

// 削除確認モーダル中身。
function ConfirmDeleteModalBody({
  entryId,
  onSuccess,
  onCancel,
}: {
  entryId: string;
  onSuccess: () => Promise<void>;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/private/journal/entries/${entryId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        setError('削除に失敗しました');
        return;
      }
      await onSuccess();
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="my-notes-delete-body">
      <p className="text-sm text-slate-700">
        この操作は取り消せません。削除するとマイノートと職員室ノートの両方から消えます。
      </p>
      {error && <ErrorMessage message={error} />}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          data-testid="my-notes-delete-cancel-button"
        >
          キャンセル
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleConfirm}
          isLoading={isDeleting}
          data-testid="my-notes-delete-confirm-button"
        >
          削除する
        </Button>
      </div>
    </div>
  );
}
