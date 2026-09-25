import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Shift, ShiftAttendanceState } from '../../api/shifts';

/**
 * The small mark on a shift that says what actually happened: one tick for
 * clocked in, two for a shift worked to the end, a warning when someone never
 * clocked out or never turned up. Hovering shows the times behind it.
 *
 * A manager reads a whole week's compliance without opening a single record.
 */

export type MarkKind = 'completed' | 'in_progress' | 'incomplete' | 'missed' | 'none';

interface MarkMeta {
  kind: MarkKind;
  /** Bright enough to read on both the dark shift blocks and the pale ones. */
  color: string;
  labelKey: string;
  fallback: string;
}

const META: Record<Exclude<MarkKind, 'none'>, MarkMeta> = {
  completed:   { kind: 'completed',   color: '#34d399', labelKey: 'shifts.attendance.completed',  fallback: 'Worked in full' },
  in_progress: { kind: 'in_progress', color: '#93c5fd', labelKey: 'shifts.attendance.inProgress', fallback: 'On shift now' },
  incomplete:  { kind: 'incomplete',  color: '#fbbf24', labelKey: 'shifts.attendance.incomplete', fallback: 'No clock-out' },
  missed:      { kind: 'missed',      color: '#f87171', labelKey: 'shifts.attendance.missed',     fallback: 'Nothing recorded' },
};

/**
 * Which mark a shift deserves.
 *
 * `onLeave` suppresses the "nothing recorded" warning: an approved absence is
 * not a missed shift, and flagging it would train people to ignore the flag.
 */
export function resolveMark(
  shift: Pick<Shift, 'attendanceState'>,
  options: { onLeave?: boolean } = {},
): MarkMeta | null {
  const state = shift.attendanceState as ShiftAttendanceState | undefined;
  if (!state) return null;
  if (state === 'missed' && options.onLeave) return null;
  if (state === 'completed' || state === 'in_progress' || state === 'incomplete' || state === 'missed') {
    return META[state];
  }
  return null; // scheduled, off, cancelled — nothing to say yet
}

/** The store's clock, never the viewer's: a shift is a wall-clock instruction. */
function formatTime(value: string | null | undefined, timezone: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone ?? undefined,
    });
  } catch {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
}

function Tick({ color, double }: { color: string; double: boolean }) {
  return (
    <svg width={double ? 15 : 10} height="9" viewBox={double ? '0 0 15 9' : '0 0 10 9'} fill="none" aria-hidden="true">
      <path d="M1 5.2 3.4 7.6 8.6 1.6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {double && (
        <path d="M6.4 5.2 8.8 7.6 14 1.6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function MissedMark({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M5 1.2 9.2 8.6H0.8L5 1.2Z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 4.2v2" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="5" cy="7.3" r="0.6" fill={color} />
    </svg>
  );
}

interface ShiftAttendanceMarkProps {
  shift: Shift;
  /** The employee has approved leave that day; a missing clock-in is expected. */
  onLeave?: boolean;
}

export default function ShiftAttendanceMark({ shift, onLeave }: ShiftAttendanceMarkProps) {
  const { t, i18n } = useTranslation();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [tooltip, setTooltip] = useState<{ top: number; left: number } | null>(null);

  const meta = resolveMark(shift, { onLeave });
  if (!meta) return null;

  const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';
  const tz = shift.timezone;
  const checkin = formatTime(shift.attendanceCheckinAt, tz, locale);
  const checkout = formatTime(shift.attendanceCheckoutAt, tz, locale);
  const breakStart = formatTime(shift.attendanceBreakStartAt, tz, locale);
  const breakEnd = formatTime(shift.attendanceBreakEndAt, tz, locale);
  const delay = shift.attendanceCheckinDelayMinutes ?? null;

  const label = t(meta.labelKey, meta.fallback);

  // Positioned against the viewport so the card is never clipped by a calendar
  // cell, and only mounted while hovered — a week view holds hundreds of these.
  const openTooltip = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left - 60, window.innerWidth - 230)) });
  };

  const rows: Array<{ label: string; value: string; tone?: string }> = [];
  if (checkin) {
    rows.push({
      label: t('shifts.attendance.in', 'In'),
      value: checkin,
      tone: delay !== null && delay > 5 ? '#fbbf24' : undefined,
    });
  }
  if (breakStart) rows.push({ label: t('shifts.attendance.breakStart', 'Break'), value: breakStart });
  if (breakEnd) rows.push({ label: t('shifts.attendance.breakEnd', 'Back'), value: breakEnd });
  if (checkout) rows.push({ label: t('shifts.attendance.out', 'Out'), value: checkout });

  return (
    <>
      <span
        ref={anchorRef}
        onMouseEnter={openTooltip}
        onMouseLeave={() => setTooltip(null)}
        onFocus={openTooltip}
        onBlur={() => setTooltip(null)}
        tabIndex={0}
        role="img"
        aria-label={label}
        title={label}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginLeft: 'auto', paddingLeft: 4,
          cursor: 'help', lineHeight: 0, outline: 'none',
        }}
      >
        {meta.kind === 'missed'
          ? <MissedMark color={meta.color} />
          : <Tick color={meta.color} double={meta.kind === 'completed'} />}
      </span>

      {tooltip && createPortal(
        <div
          style={{
            position: 'fixed', top: tooltip.top, left: tooltip.left, zIndex: 9600,
            minWidth: 170, maxWidth: 240,
            background: 'var(--surface)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 12px 32px rgba(13,33,55,0.20)',
            padding: '10px 12px', pointerEvents: 'none',
            fontFamily: 'var(--font-body)',
            animation: 'fadeIn 0.12s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
            {label}
          </div>

          {rows.length > 0 ? (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {rows.map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: row.tone ?? 'var(--text-primary)' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
              {t('shifts.attendance.noEvents', 'No clock-in was recorded for this shift.')}
            </div>
          )}

          {delay !== null && delay > 5 && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#b45309', fontWeight: 600 }}>
              {t('shifts.attendance.lateBy', '{{count}} min late', { count: delay })}
            </div>
          )}

          {shift.attendanceHasManualEvent && (
            <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-muted)' }}>
              {t('shifts.attendance.manualEntry', 'Includes an entry added by hand')}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
