import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Interview } from './atsCalendarUtils';
import InterviewEntry from './InterviewEntry';
import {
  formatDate,
  getDaysInMonth,
  groupInterviewsByDate,
  sortInterviewsByTime,
  detectConflicts,
  hasConflict,
  todayString,
  fullName,
} from './atsCalendarUtils';
import { getAvatarUrl } from '../../api/client';

interface ATSMonthlyCalendarProps {
  interviews: Interview[];
  currentDate: Date;
  onDayClick: (date: string) => void;
  onInterviewClick: (interview: Interview) => void;
}

const MAX_VISIBLE = 4;

export default function ATSMonthlyCalendar({
  interviews,
  currentDate,
  onDayClick,
  onInterviewClick,
}: ATSMonthlyCalendarProps) {
  const { t } = useTranslation();
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [hoveredInterview, setHoveredInterview] = useState<number | null>(null);

  const DAY_LABELS = [
    t('shifts.dayMon', 'Mon'),
    t('shifts.dayTue', 'Tue'),
    t('shifts.dayWed', 'Wed'),
    t('shifts.dayThu', 'Thu'),
    t('shifts.dayFri', 'Fri'),
    t('shifts.daySat', 'Sat'),
    t('shifts.daySun', 'Sun'),
  ];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = todayString();

  // Group interviews by date
  const interviewsByDate = useMemo(() => {
    return groupInterviewsByDate(interviews);
  }, [interviews]);

  // Detect conflicts
  const conflicts = useMemo(() => {
    return detectConflicts(interviews);
  }, [interviews]);

  // Build calendar grid
  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday as first day
    const daysInMonthTotal = getDaysInMonth(year, month);

    const cellArray: (Date | null)[] = [
      ...Array(startOffset).fill(null),
      ...Array.from({ length: daysInMonthTotal }, (_, i) => new Date(year, month, i + 1)),
    ];

    // Pad to complete last row
    while (cellArray.length % 7 !== 0) cellArray.push(null);

    return cellArray;
  }, [year, month]);

  return (
    <div
      style={{
        // Natural height — the page shell owns the vertical scroll, so the month
        // grid is never clipped and there is only one scrollbar on screen.
        overflowX: 'auto',
        width: '100%',
        padding: 16,
        background: 'var(--surface)',
      }}
    >
      <div style={{ minWidth: 860 }}>
        {/* Day headers — sticky so weekday names survive vertical scrolling */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 5,
            marginBottom: 6,
            position: 'sticky',
            // Sticks flush with the scrollport. A negative offset would let the
            // row scroll partly out of view before pinning, clipping the labels.
            top: 0,
            zIndex: 20,
            background: 'var(--surface)',
            paddingTop: 4,
            paddingBottom: 6,
          }}
        >
          {DAY_LABELS.map((label, idx) => (
            <div
              key={label}
              style={{
                textAlign: 'center',
                fontWeight: 800,
                fontSize: '0.68rem',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontFamily: 'var(--font-display)',
                color: idx >= 5 ? 'var(--text-muted)' : 'var(--primary)',
                padding: '5px 0',
                borderRadius: 5,
                background: idx >= 5 ? 'var(--surface-warm)' : 'transparent',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 5,
          }}
        >
          {cells.map((date, idx) => {
            const isWeekendCol = idx % 7 >= 5;

            // Leading/trailing blanks keep the grid rectangular; tint them so the
            // month's real boundaries are obvious at a glance.
            if (!date) {
              return (
                <div
                  key={`empty-${idx}`}
                  style={{
                    minHeight: 108,
                    borderRadius: 7,
                    border: '1px dashed var(--border)',
                    background: 'var(--surface-warm)',
                    opacity: 0.5,
                  }}
                />
              );
            }

            const dateStr = formatDate(date);
            const dayInterviews = sortInterviewsByTime(interviewsByDate.get(dateStr) ?? []);
            const isTodayCell = dateStr === today;
            const isHovered = hoveredDay === dateStr;
            const hasInterviews = dayInterviews.length > 0;

            return (
              <div
                key={dateStr}
                style={{
                  minWidth: 0,
                  minHeight: 108,
                  borderRadius: 7,
                  border: isTodayCell ? '2px solid var(--accent)' : '1px solid var(--border)',
                  padding: 7,
                  cursor: 'pointer',
                  background: isTodayCell
                    ? 'rgba(201, 151, 58, 0.06)'
                    : isWeekendCol
                      ? 'var(--surface-warm)'
                      : 'var(--surface)',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                  position: 'relative',
                  boxShadow: isHovered
                    ? '0 4px 14px rgba(13, 33, 55, 0.12)'
                    : hasInterviews
                      ? 'var(--shadow-xs)'
                      : undefined,
                }}
                onMouseEnter={() => setHoveredDay(dateStr)}
                onMouseLeave={() => setHoveredDay(null)}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    onDayClick(dateStr);
                  }
                }}
              >
                {/* Date number */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    marginBottom: 6,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      fontWeight: isTodayCell ? 700 : 600,
                      color: isTodayCell ? 'var(--accent)' : 'var(--text-primary)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.9rem',
                      lineHeight: 1,
                    }}
                  >
                    {isTodayCell ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          color: '#fff',
                          fontWeight: 700,
                          boxShadow: '0 0 0 3px rgba(201,151,58,0.16)',
                        }}
                      >
                        {date.getDate()}
                      </span>
                    ) : (
                      date.getDate()
                    )}
                  </div>

                  {/* Interview count badge */}
                  {hasInterviews && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 20,
                        height: 20,
                        borderRadius: 999,
                        background: 'var(--primary)',
                        color: '#fff',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        padding: '0 6px',
                      }}
                    >
                      {dayInterviews.length}
                    </div>
                  )}
                </div>

                {/* Interview entries */}
                {hasInterviews && (
                  <div 
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                    onMouseEnter={() => setHoveredDay(null)}
                  >
                    {dayInterviews.slice(0, MAX_VISIBLE).map((interview) => {
                      const hasConflictFlag = hasConflict(interview.id, conflicts);
                      return (
                        <div
                          key={interview.id}
                          onMouseEnter={() => setHoveredInterview(interview.id)}
                          onMouseLeave={() => setHoveredInterview(null)}
                        >
                          <InterviewEntry
                            interview={interview}
                            variant="monthly"
                            onClick={() => onInterviewClick(interview)}
                            hasConflict={hasConflictFlag}
                            showTooltip={hoveredInterview === interview.id}
                          />
                        </div>
                      );
                    })}
                    {dayInterviews.length > MAX_VISIBLE && (
                      <div
                        // Clickable: the cell's own handler ignores clicks on
                        // children, so without this the overflow badge looked
                        // interactive but did nothing.
                        onClick={(e) => {
                          e.stopPropagation();
                          onDayClick(dateStr);
                        }}
                        title={t('ats.viewAllInterviews', 'View all interviews for this day')}
                        style={{
                          fontSize: '0.6rem',
                          fontWeight: 800,
                          color: 'var(--primary)',
                          padding: '2px 6px',
                          marginTop: 1,
                          borderRadius: 4,
                          background: 'var(--surface-warm)',
                          border: '1px dashed var(--border)',
                          textAlign: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        +{dayInterviews.length - MAX_VISIBLE} {t('common.more', 'more')}
                      </div>
                    )}
                  </div>
                )}

                {/* Hover tooltip with full list */}
                {isHovered && hasInterviews && !hoveredInterview && (
                  <div
                    style={{
                      position: 'absolute',
                      top: idx >= cells.length - 7 ? 'auto' : 'calc(100% + 4px)',
                      bottom: idx >= cells.length - 7 ? 'calc(100% + 4px)' : 'auto',
                      right: idx % 7 > 3 ? 0 : 'auto',
                      left: idx % 7 > 3 ? 'auto' : 0,
                      minWidth: 244,
                      maxWidth: 320,
                      // A busy day can hold many interviews; cap the popover and
                      // let it scroll rather than run off the viewport.
                      maxHeight: 280,
                      overflowY: 'auto',
                      borderRadius: 11,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      boxShadow: '0 18px 44px rgba(13, 33, 55, 0.20)',
                      padding: '11px 13px',
                      zIndex: 100,
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: 8,
                        paddingBottom: 6,
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {dayInterviews.length} {t('ats.interviews', 'Interviews')} •{' '}
                      {date.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>

                    {dayInterviews.map((interview, iIdx) => {
                      const candidateFullName = fullName(
                        interview.candidateName || '',
                        interview.candidateSurname || ''
                      );
                      const avatarUrl = getAvatarUrl(interview.candidateAvatarFilename);

                      return (
                        <div
                          key={interview.id}
                          style={{
                            padding: '6px 0',
                            marginBottom: iIdx === dayInterviews.length - 1 ? 0 : 6,
                            borderBottom:
                              iIdx === dayInterviews.length - 1
                                ? 'none'
                                : '1px solid rgba(0,0,0,0.05)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={candidateFullName}
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: '1px solid var(--border)',
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: '50%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-mid) 100%)',
                                  color: '#fff',
                                  fontSize: '0.6rem',
                                  fontWeight: 800,
                                  border: '1px solid var(--border)',
                                }}
                              >
                                {candidateFullName
                                  .split(' ')
                                  .map((w) => w[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </div>
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  color: 'var(--text-primary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {candidateFullName}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.62rem',
                                  color: 'var(--text-muted)',
                                  marginTop: 2,
                                }}
                              >
                                {interview.scheduledTime.slice(0, 5)} •{' '}
                                {interview.positionTitle}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
