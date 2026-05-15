// CloudWatch Metrics クライアントラッパ。
// AWS/AppRunner Requests を 1 時間粒度で取得する。
//
// 注意: AppRunner Service Name / ID は env 経由で取得 (未設定なら本番 default にフォールバック)。
// env 化は post-mvp-backlog 行き (CDK 側で AppRunner env に追加する PR が別途必要)。
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { logger } from '@/shared/lib/logger';

const APPRUNNER_SERVICE_NAME =
  process.env.APPRUNNER_SERVICE_NAME ?? 'vitanota-prod-app';
const APPRUNNER_SERVICE_ID =
  process.env.APPRUNNER_SERVICE_ID ?? '9063731f9ade45d4a0b679006e5dc3b4';

export interface CloudWatchDataPoint {
  timestamp: Date;
  value: number;
}

let client: CloudWatchClient | null = null;

function getClient(): CloudWatchClient {
  if (!client) {
    client = new CloudWatchClient({
      region: process.env.AWS_REGION ?? 'ap-northeast-1',
    });
  }
  return client;
}

export async function getRequestsHourly(
  start: Date,
  end: Date,
): Promise<CloudWatchDataPoint[]> {
  const cmd = new GetMetricDataCommand({
    StartTime: start,
    EndTime: end,
    MetricDataQueries: [
      {
        Id: 'requests',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/AppRunner',
            MetricName: 'Requests',
            Dimensions: [
              { Name: 'ServiceName', Value: APPRUNNER_SERVICE_NAME },
              { Name: 'ServiceID', Value: APPRUNNER_SERVICE_ID },
            ],
          },
          Period: 3600,
          Stat: 'Sum',
        },
        ReturnData: true,
      },
    ],
    ScanBy: 'TimestampAscending',
  });

  const res = await getClient().send(cmd);
  const result = res.MetricDataResults?.[0];
  if (!result || !result.Timestamps || !result.Values) {
    logger.warn(
      { event: 'access_distribution.cloudwatch.no_data', start, end },
      'No CloudWatch data',
    );
    return [];
  }

  const points: CloudWatchDataPoint[] = [];
  for (let i = 0; i < result.Timestamps.length; i++) {
    points.push({
      timestamp: result.Timestamps[i]!,
      value: result.Values[i] ?? 0,
    });
  }
  return points;
}
