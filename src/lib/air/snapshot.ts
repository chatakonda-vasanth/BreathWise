import { overallUsAqi } from './aqi';
import type { AirPoint, AirSnapshot } from '@/lib/shared/types';
import { AIR_SOURCE_LABEL } from '@/lib/shared/constants';
import type { AirPayload } from './upstream';
import { UpstreamError, num } from './upstream';

function toPoint(raw: {
  time: string;
  pm25?: number | null;
  pm10?: number | null;
  no2?: number | null;
  o3?: number | null;
  usAqi?: number | null;
}): AirPoint {
  const pm25 = num(raw.pm25);
  const pm10 = num(raw.pm10);
  const no2 = num(raw.no2);
  const o3 = num(raw.o3);
  const upstream = num(raw.usAqi);
  const usAqi = upstream ?? overallUsAqi({ pm25, pm10, no2, o3 });
  return {
    time: raw.time,
    usAqi,
    pm25,
    pm10,
    no2,
    o3,
  };
}
function hourlyPoints(hourly: AirPayload['hourly']): AirPoint[] {
  return hourly.time.map((time, index) =>
    toPoint({
      time,
      pm25: hourly.pm2_5[index],
      pm10: hourly.pm10[index],
      no2: hourly.nitrogen_dioxide[index],
      o3: hourly.ozone[index],
      usAqi: hourly.us_aqi[index],
    }),
  );
}

/** Index of the current hour, or the last complete day when it is absent. */
function currentIndexFor(points: AirPoint[], hourKey: string): number {
  const found = points.findIndex((point) => point.time.slice(0, 13) === hourKey);
  return found >= 0 ? found : Math.max(0, points.length - 25);
}

/** Build the snapshot shape the app consumes from a validated payload. */
export function toSnapshot(
  payload: AirPayload,
  rounded: { lat: number; lon: number },
): AirSnapshot {
  const { timezone, hourly, current } = payload;
  const currentTime = current?.time ?? hourly.time[0];
  if (!currentTime) throw new UpstreamError();

  const points = hourlyPoints(hourly);
  const currentIndex = currentIndexFor(points, currentTime.slice(0, 13));
  const fallbackPoint = points[currentIndex];
  const currentPoint = current
    ? toPoint({
        time: current.time,
        pm25: current.pm2_5,
        pm10: current.pm10,
        no2: current.nitrogen_dioxide,
        o3: current.ozone,
        usAqi: current.us_aqi,
      })
    : fallbackPoint;
  if (!currentPoint) throw new UpstreamError();

  return {
    lat: rounded.lat,
    lon: rounded.lon,
    timezone: timezone.replace(/[^A-Za-z0-9/_+\-]/g, '').slice(0, 60) || 'UTC',
    fetchedAt: new Date().toISOString(),
    current: currentPoint,
    history: points.slice(Math.max(0, currentIndex - 24), currentIndex),
    forecast: points.slice(currentIndex, currentIndex + 24),
    source: AIR_SOURCE_LABEL,
    isSample: false,
  };
}
