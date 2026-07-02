// ダッシュボード上部の「タスクを整理する」「手動でタスクを追加する」サブタブ。
//
// 設計の前提 (chimo 2026-05-13):
//   - 手動でタスク追加は AI 機能 ON/OFF に関わらず常時利用可能
//   - AI 整理機能のみ aiChatEnabled で出し分け
//   - aiChatEnabled=false 時: 手動カードのみ (タブ切替リンクなし)
//   - aiChatEnabled=true  時: AI 整理がデフォルト、ヘッダ右リンクで手動に切替可
//
// 旧 TaskBulkCreateForm は廃止、行ごとカテゴリ・タグ・担当者・メモを持つ
// ManualTaskCreateForm に統合済。

import { useState } from 'react';
import { RoughCaptureSection } from '@/features/ai-chat/RoughCaptureSection';
import { ManualTaskCreateForm } from '@/features/ai-chat/ManualTaskCreateForm';

type ActiveTab = 'ai' | 'manual';

export function TaskCreateTabs({
  selfUserId,
  aiChatEnabled,
  initialInput = '',
  autoExtract = false,
  embedded = false,
  onManualSuccess,
}: {
  selfUserId: string;
  aiChatEnabled: boolean;
  // コンパクトバー → モーダル起動時: 文字引き継ぎ / 即整理 / 外枠省略 / 作成後の後処理。
  initialInput?: string;
  autoExtract?: boolean;
  embedded?: boolean;
  onManualSuccess?: () => void;
}) {
  // aiChatEnabled=false なら強制的に manual のみ。state の初期値も manual。
  const [active, setActive] = useState<ActiveTab>(
    aiChatEnabled ? 'ai' : 'manual',
  );

  if (aiChatEnabled && active === 'ai') {
    return (
      <RoughCaptureSection
        selfUserId={selfUserId}
        initialInput={initialInput}
        autoExtract={autoExtract}
        embedded={embedded}
        headerRight={
          <button
            type="button"
            onClick={() => setActive('manual')}
            data-testid="task-create-tabs-to-manual"
            className="text-[13px] font-medium text-vn-accent underline underline-offset-2 transition-colors hover:text-vn-accent-hover"
          >
            タスクを手動で追加する
          </button>
        }
      />
    );
  }

  return (
    <section
      className={
        embedded
          ? ''
          : 'mb-5 rounded-[14px] border border-vn-border bg-white px-7 pb-4 pt-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]'
      }
    >
      {(!embedded || aiChatEnabled) && (
        <header className="mb-2 flex items-baseline justify-between">
          {embedded ? (
            <span aria-hidden />
          ) : (
            <h2 className="text-[20px] font-bold leading-[1.4] text-slate-800">
              {aiChatEnabled ? '手動でタスクを追加する' : 'タスクを追加する'}
            </h2>
          )}
          {aiChatEnabled && (
            <button
              type="button"
              onClick={() => setActive('ai')}
              data-testid="task-create-tabs-to-ai"
              className="text-[13px] font-medium text-vn-accent underline underline-offset-2 transition-colors hover:text-vn-accent-hover"
            >
              タスクをAIで整理する
            </button>
          )}
        </header>
      )}
      <ManualTaskCreateForm
        selfUserId={selfUserId}
        onSuccess={() => {
          if (aiChatEnabled) setActive('ai');
          onManualSuccess?.();
        }}
      />
    </section>
  );
}
