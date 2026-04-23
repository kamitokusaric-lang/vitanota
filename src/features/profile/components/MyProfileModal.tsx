// マイプロフィールモーダル (ヘッダー右のユーザー名クリックで開く)
// ニックネーム表示 + 編集 + 保存
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { Modal } from '@/shared/components/Modal';

interface ProfileResponse {
  profile: { nickname: string | null };
}

const fetcher = async (url: string): Promise<ProfileResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

interface MyProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function MyProfileModal({ open, onClose }: MyProfileModalProps) {
  const { data, error, isLoading, mutate } = useSWR(
    open ? '/api/me/profile' : null,
    fetcher,
  );
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setNickname(data?.profile.nickname ?? '');
    setSaveError(null);
  }, [data, open]);

  const handleSave = async () => {
    const trimmed = nickname.trim();
    setSubmitting(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: trimmed ? trimmed : null,
        }),
      });
      if (res.ok) {
        await mutate();
        onClose();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setSaveError(body.message ?? '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="マイプロフィール">
      {isLoading && (
        <div className="py-6 text-center">
          <LoadingSpinner label="読み込み中" />
        </div>
      )}
      {error && !isLoading && (
        <ErrorMessage message="プロフィールの取得に失敗しました" />
      )}
      {data && (
        <div className="space-y-3" data-testid="profile-modal">
          {saveError && <ErrorMessage message={saveError} />}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              ニックネーム
            </label>
            <p className="mb-2 text-xs text-gray-500">
              タイムラインなどで表示される名前です。tenant 内で重複はできません。
            </p>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={50}
              placeholder="未設定"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              data-testid="profile-nickname-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-xs"
            >
              閉じる
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="text-xs"
              data-testid="profile-save-button"
            >
              保存
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
