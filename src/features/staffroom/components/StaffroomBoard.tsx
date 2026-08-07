// 「会議で話す」タブ = 学年会 (grade-meeting)。
//
// 2026-08-07 (chimo) にこの面を作り直した:
//   - 「生徒の様子」(朝バトンのクラス別集約) を撤去
//   - 「情報共有」(kind ごとの箱・ナレッジ箱) を撤去
//       → keep/concern/thanks/help の投稿は「職員室で交流する」タブに出続ける
//         (あちらは kind で除外していない)。入口 (TodayCaptureBox) もそのまま。
//   - 週ナビを最上部に置き、学年会をその週に紐づける
//
// この面の役割は「同期 Orient の場」= 学年団が集まって視点を混ぜること。
// 非同期で溜まったものを眺める面ではない。
import { useState } from 'react';
import { GradeMeetingPanel } from '@/features/grade-meeting/components/GradeMeetingPanel';
import {
  StaffroomPeriodFilter,
  getDefaultBoardPeriod,
  type BoardPeriod,
} from './StaffroomPeriodFilter';

export function StaffroomBoard({ todayDate }: { todayDate: string }) {
  // 表示中の週 (既定: 今週)。学年会はこの週に開かれた会を出す。
  const [period, setPeriod] = useState<BoardPeriod>(() => getDefaultBoardPeriod());

  return (
    <div className="space-y-6">
      {/* 週ナビ。前週へ戻れば、その週の学年会がそのまま読める。 */}
      <StaffroomPeriodFilter value={period} onChange={setPeriod} />

      <GradeMeetingPanel todayDate={todayDate} period={period} />
    </div>
  );
}
