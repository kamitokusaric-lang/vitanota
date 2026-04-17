import type { AlertListItem } from '../lib/alertService';
import { AlertItem } from './AlertItem';

interface AlertListProps {
  alerts: AlertListItem[];
  onClose: (alertId: string) => void;
  closingId: string | null;
}

export function AlertList({ alerts, onClose, closingId }: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-500" data-testid="alert-list-empty">
        アクティブなアラートはありません
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="alert-list">
      {alerts.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onClose={onClose}
          isClosing={closingId === alert.id}
        />
      ))}
    </div>
  );
}
