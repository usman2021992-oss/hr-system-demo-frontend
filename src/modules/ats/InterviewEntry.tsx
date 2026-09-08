import { useState } from 'react';
import { Phone, Users, MapPin, Video, AlertTriangle, Clock, User, Check, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Interview } from './atsCalendarUtils';
import { getAvatarUrl } from '../../api/client';
import {
  resolveEntryPalette,
  initials,
  fullName,
  formatTime,
  formatDuration,
  timeToMinutes,
  minutesToTime,
} from './atsCalendarUtils';

interface InterviewEntryProps {
  interview: Interview;
  variant: 'weekly' | 'monthly';
  onClick: () => void;
  hasConflict?: boolean;
  showTooltip?: boolean;
  /**
   * Rendered height of the block in the weekly grid. Drives how much detail the
   * card shows — a 30-minute slot only has room for one line.
   */
  heightPx?: number;
}

const INTERVIEW_TYPE_ICONS: Record<string, typeof Phone> = {
  phone: Phone,
  in_person: Users,
  video: Video,
};

/** Below this the card shows a single line; above it, a second detail line. */
const TWO_LINE_THRESHOLD = 46;

export default function InterviewEntry({
  interview,
  variant,
  onClick,
  hasConflict = false,
  showTooltip = true,
  heightPx,
}: InterviewEntryProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(false);
  const [isNearRight, setIsNearRight] = useState(false);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(true);
    const rect = e.currentTarget.getBoundingClientRect();
    // Flip the tooltip when the block sits low or far right, so it never
    // opens off-screen inside the calendar's own scroll container.
    setIsNearBottom(rect.top > window.innerHeight * 0.55);
    setIsNearRight(rect.right > window.innerWidth - 320);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsNearBottom(false);
    setIsNearRight(false);
  };

  const palette = resolveEntryPalette(interview.interviewType, interview.status, hasConflict);
  const TypeIcon = INTERVIEW_TYPE_ICONS[interview.interviewType] || Users;

  const candidateFullName = fullName(interview.candidateName || '', interview.candidateSurname || '');
  const interviewerFullName = interview.interviewerName
    ? fullName(interview.interviewerName, interview.interviewerSurname || '')
    : null;
  const candidateInitials = initials(interview.candidateName || '', interview.candidateSurname || '');
  const avatarUrl = getAvatarUrl(interview.candidateAvatarFilename);

  const isCancelled = interview.status === 'cancelled';
  const isCompleted = interview.status === 'completed';

  const startTime = formatTime(interview.scheduledTime);
  const endTime = minutesToTime(timeToMinutes(interview.scheduledTime) + interview.durationMinutes);

  // Conflict is only worth surfacing while the interview can still be moved.
  const showConflictBadge = hasConflict && !isCancelled && !isCompleted;

  const isWeekly = variant === 'weekly';
  const showSecondLine = isWeekly && (heightPx ?? 0) >= TWO_LINE_THRESHOLD;

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: showSecondLine ? 'column' : 'row',
    alignItems: showSecondLine ? 'stretch' : 'center',
    justifyContent: showSecondLine ? 'flex-start' : undefined,
    gap: showSecondLine ? 2 : 5,
    height: isWeekly ? '100%' : undefined,
    borderRadius: 5,
    borderLeft: `3px solid ${palette.leftBorder}`,
    borderTop: `1px solid ${palette.border}`,
    borderRight: `1px solid ${palette.border}`,
    borderBottom: `1px solid ${palette.border}`,
    background: palette.bg,
    color: palette.text,
    padding: isWeekly ? '3px 6px' : '3px 6px',
    fontSize: '0.7rem',
    fontWeight: 700,
    lineHeight: 1.2,
    cursor: 'pointer',
    transition: 'box-shadow 0.14s ease, filter 0.14s ease',
    boxShadow: palette.glow ?? '0 1px 2px rgba(13, 33, 55, 0.06)',
    overflow: 'hidden',
    opacity: isCancelled ? 0.72 : 1,
  };

  const nameStyle: React.CSSProperties = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textDecoration: isCancelled ? 'line-through' : 'none',
  };

  return (
    <div
      style={{ position: 'relative', height: isWeekly ? '100%' : undefined }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        style={cardStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(13, 33, 55, 0.16)';
          e.currentTarget.style.filter = 'brightness(0.985)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = palette.glow ?? '0 1px 2px rgba(13, 33, 55, 0.06)';
          e.currentTarget.style.filter = '';
        }}
      >
        {/* Primary line: type icon, time, candidate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: showSecondLine ? undefined : 1 }}>
          {isCancelled ? (
            <Ban size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          ) : isCompleted ? (
            <Check size={11} strokeWidth={3} style={{ flexShrink: 0 }} />
          ) : (
            <TypeIcon size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          )}

          <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{startTime}</span>

          <span style={{ ...nameStyle, flex: 1, fontWeight: 600 }}>{candidateFullName}</span>

          {showConflictBadge && (
            <span
              style={{ display: 'inline-flex', flexShrink: 0 }}
              title={t('ats.scheduleConflict', 'Schedule conflict detected')}
            >
              <AlertTriangle size={11} strokeWidth={2.5} />
            </span>
          )}
        </div>

        {/* Secondary line: only when the block is tall enough to earn it */}
        {showSecondLine && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.62rem',
              fontWeight: 600,
              opacity: 0.78,
              minWidth: 0,
            }}
          >
            <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {startTime}–{endTime}
            </span>
            {interview.positionTitle && (
              <>
                <span style={{ opacity: 0.5 }}>•</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {interview.positionTitle}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Hover detail card — matches the Shifts / Leave popover language */}
      {showTooltip && isHovered && (
        <div
          style={{
            position: 'absolute',
            left: isNearRight ? 'auto' : '50%',
            right: isNearRight ? 0 : 'auto',
            transform: isNearRight ? 'none' : 'translateX(-50%)',
            top: isNearBottom ? 'auto' : 'calc(100% + 6px)',
            bottom: isNearBottom ? 'calc(100% + 6px)' : 'auto',
            width: 264,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            boxShadow: '0 18px 44px rgba(13, 33, 55, 0.20)',
            padding: 13,
            zIndex: 99999,
            pointerEvents: 'none',
            animation: 'fadeIn 0.14s ease-out',
          }}
        >
          {/* Header: candidate identity */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 11,
              paddingBottom: 10,
              borderBottom: '1px solid var(--border)',
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={candidateFullName}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${palette.leftBorder}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-mid) 100%)',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {candidateInitials}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 800,
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
                  fontSize: '0.69rem',
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {interview.positionTitle || t('ats.candidate', 'Candidate')}
              </div>
            </div>
          </div>

          {/* Status + type pills */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                borderRadius: 999,
                background: palette.bg,
                border: `1px solid ${palette.border}`,
                color: palette.text,
                fontSize: '0.62rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 0.3,
              }}
            >
              {t(`ats.status.${interview.status}`, interview.status)}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                borderRadius: 999,
                background: 'var(--surface-warm)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: '0.62rem',
                fontWeight: 700,
              }}
            >
              <TypeIcon size={10} strokeWidth={2.5} color={palette.iconColor} />
              {t(`ats.interviewType.${interview.interviewType}`, interview.interviewType)}
            </span>
          </div>

          {/* Detail rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: '0.71rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
              <Clock size={13} color="var(--primary)" strokeWidth={2} style={{ flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {startTime}–{endTime}
              </span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                ({formatDuration(interview.durationMinutes)})
              </span>
            </div>

            {interviewerFullName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                <User size={13} color="var(--accent)" strokeWidth={2} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('ats.interviewer', 'Interviewer')}:{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{interviewerFullName}</strong>
                </span>
              </div>
            )}

            {interview.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                <MapPin size={13} color="var(--primary)" strokeWidth={2} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {interview.location}
                </span>
              </div>
            )}
          </div>

          {showConflictBadge && (
            <div
              style={{
                marginTop: 11,
                padding: '7px 9px',
                borderRadius: 8,
                background: CONFLICT_BANNER_BG,
                border: `1px solid ${CONFLICT_BANNER_BORDER}`,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <AlertTriangle size={14} color="#B4632A" strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.67rem', fontWeight: 800, color: '#7A3D14', lineHeight: 1.3 }}>
                {t('ats.scheduleConflict', 'Schedule conflict detected')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CONFLICT_BANNER_BG = '#FBEFE4';
const CONFLICT_BANNER_BORDER = 'rgba(180, 99, 42, 0.42)';
