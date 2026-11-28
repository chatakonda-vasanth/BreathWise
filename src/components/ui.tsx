'use client';

import type { SeverityBand } from '@/lib/shared/types';

/**
 * Inline message. `live` turns it into an ARIA live
 * region so a screen reader announces it.
 */
export function Banner({
  tone,
  title,
  live,
  children,
}: {
  tone: 'danger' | 'warn' | 'info';
  title?: string;
  /** Announce the banner to screen readers when it appears. */
  live?: 'polite' | 'assertive';
  children: React.ReactNode;
}) {
  const className =
    tone === 'danger'
      ? 'banner banner-danger'
      : tone === 'warn'
        ? 'banner banner-warn'
        : 'banner banner-info';
  const role =
    tone === 'danger' || live === 'assertive' ? 'alert' : live ? 'status' : undefined;
  return (
    <div
      className={className}
      role={role}
      aria-live={role ? (role === 'alert' ? 'assertive' : 'polite') : undefined}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * Decorative loading block. Hidden from assistive
 * technology; the live status text carries the meaning.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/**
 * Busy card with an accessible label and
 * `aria-busy`, used while air data is in flight.
 */
export function LoadingCard({ label }: { label: string }) {
  return (
    <div className="card" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <Skeleton className="h-6 w-2/3" />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <Skeleton className="mt-3 h-32" />
    </div>
  );
}

/**
 * AQI band chip: colour plus the band name, so
 * colour is never the only indicator.
 */
export function BandChip({
  band,
  label,
  glyph,
}: {
  band: SeverityBand;
  label: string;
  glyph: string;
}) {
  return (
    <span className="band-chip" data-band={band}>
      <span aria-hidden="true">{glyph}</span>
      <span>{label}</span>
    </span>
  );
}

/**
 * Label + control wrapper with hint and error text
 * wired through ids for screen readers.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Section heading that owns the id the
 * section is labelled by.
 */
export function SectionHeading({
  id,
  children,
  level = 2,
}: {
  id: string;
  children: React.ReactNode;
  level?: 2 | 3;
}) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <Tag id={id} className="text-lg font-bold sm:text-xl">
      {children}
    </Tag>
  );
}
