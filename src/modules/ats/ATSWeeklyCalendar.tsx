import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import InterviewEntry from './InterviewEntry';
import {
  Interview,
  addDays,
  formatDate,
  getHourLabels,
  timeToOffsetPx,
  durationToHeightPx,
  FULL_DAY_RANGE,
  gridHeightPx,
  timeToMinutes,
  resolveEntryPalette,
  fullName,
  CONFLICT_COLORS,
  MIN_ENTRY_HEIGHT_PX,
  groupInterviewsByDate,
  sortInterviewsByTime,
  detectConflicts,
  hasConflict,
  todayString,
  nowOffsetPx,
  isBusinessHour,
  HOUR_ROW_HEIGHT,
} from './atsCalendarUtils';

interface ATSWeeklyCalendarProps {
  interviews: Interview[];
  weekStart: Date;
  onInterviewClick: (interview: Interview) => void;
  onSlotClick?: (date: string, time: string) => void;
}

const TIME_COL_WIDTH = 62;
const HEADER_HEIGHT = 62;
const DAY_MIN_WIDTH = 136;

/**
 * Most columns an overlapping group may be split into. Beyond this each block is
 * too narrow to read, so the remainder collapses into a "+N" stack.
 */
const MAX_OVERLAP_COLUMNS = 3;

export default function ATSWeeklyCalendar({
  interviews,
  weekStart,
  onInterviewClick,
  onSlotClick,
}: ATSWeeklyCalendarProps) {
  const { t, i18n } = useTranslation();
  const [hoveredInterviewId, setHoveredInterviewId] = useState<number | string | null>(null);
  const [hoveredOverflow, setHoveredOverflow] = useState<string | null>(null);
  const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';

  const DAY_LABELS = [
    t('shifts.dayMon', 'Mon'),
    t('shifts.dayTue', 'Tue'),
    t('shifts.dayWed', 'Wed'),
    t('shifts.dayThu', 'Thu'),
    t('shifts.dayFri', 'Fri'),
    t('shifts.daySat', 'Sat'),
    t('shifts.daySun', 'Sun'),
  ];

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const today = todayString();

  const interviewsByDate = useMemo(() => groupInterviewsByDate(interviews), [interviews]);
  const conflicts = useMemo(() => detectConflicts(interviews), [interviews]);
  const hasInterviews = interviews.length > 0;

  // Always render the full day — interviews can be booked at any hour, and a
  // trimmed grid reads as though the calendar only supports working hours.
  // The grid is laid out at its natural height and the page provides the scroll.
  const range = FULL_DAY_RANGE;
  const hourLabels = getHourLabels(range);
  const gridHeight = gridHeightPx(range);

  // Only mark "now" when the visible week actually contains today.
  const nowMarker = useMemo(() => {
    const inThisWeek = days.some((d) => formatDate(d) === today);
    return inThisWeek ? nowOffsetPx(range) : null;
  }, [days, today, range]);

  if (!hasInterviews) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '56px 24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ marginBottom: 12, opacity: 0.28 }}>
          <CalendarDays size={34} />
        </div>
        <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
          {t('ats.noInterviewsThisWeek', 'No interviews scheduled this week')}
        </div>
        <div style={{ fontSize: 12, marginTop: 5 }}>
          {t('ats.scheduleInterviewHint', 'Schedule interviews from the Candidates tab')}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        // Natural height: the page shell provides the single vertical scroll.
        // overflowX only engages on screens narrower than the grid itself.
        overflowX: 'auto',
        position: 'relative',
        background: 'var(--surface)',
      }}
    >
      <div style={{ minWidth: TIME_COL_WIDTH + DAY_MIN_WIDTH * 7, position: 'relative' }}>
        {/* ── Header row: sticky so day names stay visible while scrolling ── */}
        <div
          style={{
            display: 'flex',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            boxShadow: '0 1px 3px rgba(13, 33, 55, 0.05)',
          }}
        >
          <div
            style={{
              width: TIME_COL_WIDTH,
              flexShrink: 0,
              height: HEADER_HEIGHT,
              borderRight: '1px solid var(--border)',
              background: 'var(--surface-warm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              position: 'sticky',
              left: 0,
              zIndex: 2,
            }}
          >
            {t('ats.time', 'Time')}
          </div>

          {days.map((day, colIdx) => {
            const dateStr = formatDate(day);
            const isTodayCol = dateStr === today;
            const isWeekend = colIdx >= 5;
            const count = interviewsByDate.get(dateStr)?.length ?? 0;

            return (
              <div
                key={dateStr}
                style={{
                  flex: 1,
                  minWidth: DAY_MIN_WIDTH,
                  height: HEADER_HEIGHT,
                  padding: '7px 8px',
                  borderRight: colIdx < 6 ? '1px solid var(--border)' : 'none',
                  background: isTodayCol
                    ? 'rgba(201, 151, 58, 0.10)'
                    : isWeekend
                      ? 'var(--surface-warm)'
                      : 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: isTodayCol ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {DAY_LABELS[colIdx]}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isTodayCol ? 'var(--accent)' : 'transparent',
                      color: isTodayCol ? '#fff' : 'var(--text-primary)',
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: 'var(--font-display)',
                      boxShadow: isTodayCol ? '0 0 0 3px rgba(201, 151, 58, 0.16)' : undefined,
                    }}
                  >
                    {day.getDate()}
                  </div>

                  {count > 0 && (
                    <span
                      style={{
                        minWidth: 17,
                        height: 17,
                        padding: '0 5px',
                        borderRadius: 999,
                        background: 'var(--primary)',
                        color: '#fff',
                        fontSize: 9.5,
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Body: time gutter + day columns, one shared px-based grid ── */}
        <div style={{ display: 'flex', height: gridHeight }}>
          {/* Time gutter */}
          <div
            style={{
              width: TIME_COL_WIDTH,
              flexShrink: 0,
              borderRight: '1px solid var(--border)',
              background: 'var(--surface-warm)',
              position: 'sticky',
              left: 0,
              zIndex: 20,
            }}
          >
            {hourLabels.slice(0, -1).map((label, i) => {
              const hour = range.startHour + i;
              const business = isBusinessHour(hour);
              return (
                <div
                  key={label}
                  style={{
                    height: HOUR_ROW_HEIGHT,
                    borderBottom: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    paddingRight: 8,
                    paddingTop: 3,
                    fontSize: 10.5,
                    fontWeight: business ? 800 : 600,
                    fontVariantNumeric: 'tabular-nums',
                    color: business ? 'var(--text-secondary)' : 'var(--text-disabled)',
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {days.map((day, colIdx) => {
            const dateStr = formatDate(day);
            const dayInterviews = sortInterviewsByTime(interviewsByDate.get(dateStr) ?? []);
            const isTodayCol = dateStr === today;
            const isWeekend = colIdx >= 5;

            return (
              <div
                key={dateStr}
                style={{
                  flex: 1,
                  minWidth: DAY_MIN_WIDTH,
                  position: 'relative',
                  borderRight: colIdx < 6 ? '1px solid var(--border)' : 'none',
                  background: isTodayCol
                    ? 'rgba(201, 151, 58, 0.035)'
                    : isWeekend
                      ? 'rgba(13, 33, 55, 0.018)'
                      : 'var(--surface)',
                }}
              >
                {/* Hour rows. Off-hours are tinted so the working day reads as
                    the primary band without hiding early/late slots. */}
                {hourLabels.slice(0, -1).map((label, i) => {
                  const hour = range.startHour + i;
                  return (
                    <div
                      key={label}
                      onClick={() => onSlotClick?.(dateStr, `${String(hour).padStart(2, '0')}:00`)}
                      style={{
                        height: HOUR_ROW_HEIGHT,
                        borderBottom: '1px solid var(--border-light)',
                        background: isBusinessHour(hour) ? 'transparent' : 'rgba(13, 33, 55, 0.022)',
                        cursor: onSlotClick ? 'pointer' : 'default',
                      }}
                    />
                  );
                })}

                {/* "Now" marker, today's column only */}
                {isTodayCol && nowMarker !== null && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: nowMarker,
                      height: 0,
                      borderTop: '2px solid var(--accent)',
                      zIndex: 9,
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: -4,
                        top: -4,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                      }}
                    />
                  </div>
                )}

                {/* Interview blocks, tiled side by side when they overlap */}
                {(() => {
                  const clusters: Interview[][] = [];
                  let currentCluster: Interview[] = [];
                  let clusterEndMins = -1;

                  for (const item of dayInterviews) {
                    const startMins = timeToMinutes(item.scheduledTime);
                    const endMins = startMins + Math.max(item.durationMinutes, 30);

                    if (currentCluster.length === 0) {
                      currentCluster.push(item);
                      clusterEndMins = endMins;
                    } else if (startMins < clusterEndMins) {
                      currentCluster.push(item);
                      clusterEndMins = Math.max(clusterEndMins, endMins);
                    } else {
                      clusters.push(currentCluster);
                      currentCluster = [item];
                      clusterEndMins = endMins;
                    }
                  }
                  if (currentCluster.length > 0) clusters.push(currentCluster);

                  return clusters.flatMap((cluster, clusterIdx) => {
                    // Tiling every overlapping interview would shrink each block
                    // past legibility — 9 at once leaves ~15px per column. Cap the
                    // columns and move the remainder into a "+N" stack that lists
                    // them on hover, so nothing becomes unreachable.
                    const isOverflowing = cluster.length > MAX_OVERLAP_COLUMNS;
                    const totalCols = isOverflowing ? MAX_OVERLAP_COLUMNS : cluster.length;
                    const shown = isOverflowing
                      ? cluster.slice(0, MAX_OVERLAP_COLUMNS - 1)
                      : cluster;
                    const hidden = isOverflowing ? cluster.slice(MAX_OVERLAP_COLUMNS - 1) : [];

                    const colLeft = (i: number) => `calc(${(i / totalCols) * 100}% + 3px)`;
                    const colWidth = `calc(${100 / totalCols}% - ${totalCols > 1 ? 5 : 6}px)`;

                    const blocks = shown.map((interview, colIndex) => {
                      const top = timeToOffsetPx(interview.scheduledTime, range.startHour);
                      const height = durationToHeightPx(interview.durationMinutes);
                      const hasConflictFlag = hasConflict(interview.id, conflicts);
                      const isRaised = hoveredInterviewId === interview.id;

                      return (
                        <div
                          key={interview.id}
                          style={{
                            position: 'absolute',
                            left: colLeft(colIndex),
                            width: colWidth,
                            top,
                            height,
                            zIndex: isRaised ? 10000 : 10 + colIndex,
                          }}
                          onMouseEnter={() => setHoveredInterviewId(interview.id)}
                          onMouseLeave={() => setHoveredInterviewId(null)}
                        >
                          <InterviewEntry
                            interview={interview}
                            variant="weekly"
                            onClick={() => onInterviewClick(interview)}
                            hasConflict={hasConflictFlag}
                            heightPx={height}
                          />
                        </div>
                      );
                    });

                    if (!hidden.length) return blocks;

                    // The stack spans the hidden interviews' combined time range.
                    const stackTop = Math.min(...hidden.map((i) => timeToOffsetPx(i.scheduledTime, range.startHour)));
                    const stackBottom = Math.max(
                      ...hidden.map(
                        (i) => timeToOffsetPx(i.scheduledTime, range.startHour) + durationToHeightPx(i.durationMinutes),
                      ),
                    );
                    const stackKey = `${dateStr}-c${clusterIdx}`;
                    const isOpen = hoveredOverflow === stackKey;
                    const anyConflict = hidden.some((i) => hasConflict(i.id, conflicts));

                    blocks.push(
                      <div
                        key={stackKey}
                        style={{
                          position: 'absolute',
                          left: colLeft(totalCols - 1),
                          width: colWidth,
                          top: stackTop,
                          height: Math.max(MIN_ENTRY_HEIGHT_PX, stackBottom - stackTop),
                          zIndex: isOpen ? 10001 : 12,
                        }}
                        onMouseEnter={() => setHoveredOverflow(stackKey)}
                        onMouseLeave={() => setHoveredOverflow(null)}
                      >
                        <div
                          style={{
                            height: '100%',
                            borderRadius: 5,
                            border: `1px dashed ${anyConflict ? CONFLICT_COLORS.leftBorder : 'var(--border)'}`,
                            borderLeft: `3px solid ${anyConflict ? CONFLICT_COLORS.leftBorder : 'var(--primary)'}`,
                            background: anyConflict ? CONFLICT_COLORS.bg : 'var(--surface-warm)',
                            color: anyConflict ? CONFLICT_COLORS.text : 'var(--primary)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            padding: '2px 3px',
                          }}
                        >
                          <span>+{hidden.length}</span>
                          {stackBottom - stackTop > 44 && (
                            <span style={{ fontSize: '0.56rem', fontWeight: 700, opacity: 0.75 }}>
                              {t('common.more', 'more')}
                            </span>
                          )}
                        </div>

                        {isOpen && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: '100%',
                              marginLeft: 6,
                              width: 250,
                              maxHeight: 260,
                              overflowY: 'auto',
                              borderRadius: 11,
                              border: '1px solid var(--border)',
                              background: 'var(--surface)',
                              boxShadow: '0 18px 44px rgba(13, 33, 55, 0.20)',
                              padding: '9px 10px',
                              zIndex: 100000,
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                color: 'var(--text-primary)',
                                paddingBottom: 6,
                                marginBottom: 5,
                                borderBottom: '1px solid var(--border)',
                              }}
                            >
                              {hidden.length} {t('ats.interviews', 'interviews')}
                            </div>
                            {hidden.map((interview) => {
                              const p = resolveEntryPalette(
                                interview.interviewType,
                                interview.status,
                                hasConflict(interview.id, conflicts),
                              );
                              return (
                                <div
                                  key={interview.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onInterviewClick(interview);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 7,
                                    padding: '5px 6px',
                                    borderRadius: 5,
                                    borderLeft: `3px solid ${p.leftBorder}`,
                                    background: p.bg,
                                    color: p.text,
                                    marginBottom: 4,
                                    cursor: 'pointer',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                    {interview.scheduledTime.slice(0, 5)}
                                  </span>
                                  <span
                                    style={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {fullName(
                                      interview.candidateName || '',
                                      interview.candidateSurname || '',
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>,
                    );

                    return blocks;
                  });
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
