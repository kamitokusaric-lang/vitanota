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
}: {
  selfUserId: string;
  aiChatEnabled: boolean;
}) {
  // aiChatEnabled=false なら強制的に manual のみ。state の初期値も manual。
  const [active, setActive] = useState<ActiveTab>(
    aiChatEnabled ? 'ai' : 'manual',
  );

  if (aiChatEnabled && active === 'ai') {
    return (
      <RoughCaptureSection
        selfUserId={selfUserId}
        headerRight={
          <button
            type="button"
            onClick={() => setActive('manual')}
            data-testid="task-create-tabs-to-manual"
            className="inline-flex h-9 items-center rounded-full border border-indigo-300 bg-indigo-50 px-4 text-xs font-bold text-indigo-700 transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-100"
          >
            タスクを手動で追加する
          </button>
        }
      />
    );
  }

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {aiChatEnabled ? '手動でタスクを追加する' : 'タスクを追加する'}
        </h2>
        {aiChatEnabled && (
          <button
            type="button"
            onClick={() => setActive('ai')}
            data-testid="task-create-tabs-to-ai"
            className="inline-flex h-9 items-center rounded-full border border-indigo-300 bg-indigo-50 px-4 text-xs font-bold text-indigo-700 transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-indigo-100"
          >
            タスクをAIで整理する
          </button>
        )}
      </header>
      <ManualTaskCreateForm
        selfUserId={selfUserId}
        onSuccess={() => {
          if (aiChatEnabled) setActive('ai');
        }}
      />
    </section>
  );
}
