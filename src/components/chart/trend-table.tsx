'use client';

import type { ChartGeometry } from '@/lib/trendGeometry';

/**
 * The same values as the chart, as a table.
 *
 * This is the alternative for screen readers, keyboard users, low-bandwidth
 * mode and anyone who cannot read SVG. It is collapsed by default so it does
 * not duplicate the chart visually.
 */
export function TrendTable({
  geometry,
  label,
  summary,
}: {
  geometry: ChartGeometry;
  label: string;
  summary: string;
}) {
  return (
    <details className="mt-2" open={false}>
      <summary className="cursor-pointer text-sm font-semibold">{label}</summary>
      <table className="mt-2 w-full text-sm">
        <caption className="text-left font-semibold">{label}</caption>
        <thead>
          <tr>
            <th scope="col" className="py-1 text-left font-semibold">
              {summary}
            </th>
            <th scope="col" className="py-1 text-right font-semibold">
              US AQI
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {geometry.points.map((point) => (
            <tr key={`${point.time}-${point.usAqi}`}>
              <td className="py-0.5 tabular-nums">{point.time.slice(11, 16)}</td>
              <td className="py-0.5 text-right tabular-nums">
                {Math.round(point.usAqi)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
