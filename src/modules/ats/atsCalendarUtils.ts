/**
 * ATS Calendar Utilities
 * Helper functions for date calculations, formatting, and calendar logic
 */

import { Interview as APIInterview } from '../../api/ats';

// Extended Interview type for calendar display
export interface Interview extends APIInterview {
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  durationMinutes: number;
}

// ─── Date Formatting ──────────────────────────────────────────────────────────

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTime(time: string): string {
  return time.slice(0, 5); // HH:mm
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
}

// ─── Week/Month Calculations ──────────────────────────────────────────────────

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as first day
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

// ─── Time Slot Calculations ───────────────────────────────────────────────────

export const START_HOUR = 1; // 01:00
export const END_HOUR = 24; // 24:00
const TOTAL_MINS = (END_HOUR - START_HOUR) * 60;

/**
 * The grid is laid out in fixed pixels rather than percentages so an entry's
 * height is predictable: a 30-minute interview is always HOUR_ROW_HEIGHT / 2
 * tall regardless of how tall the viewport is. The previous percentage model
 * collapsed short interviews to ~20px on a laptop, hiding their labels.
 */
export const HOUR_ROW_HEIGHT = 64;
export const GRID_HEIGHT_PX = (END_HOUR - START_HOUR) * HOUR_ROW_HEIGHT;

/** Shortest entry that can still show one line of text and stay clickable. */
export const MIN_ENTRY_HEIGHT_PX = 30;

/** Interviews realistically sit inside these hours; used to shade the grid. */
export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 20;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The window of hours the weekly grid renders.
 *
 * The grid always spans the whole day: an interview can legitimately be booked at
 * any hour, and hiding empty hours makes the calendar look like it only supports
 * a fixed working window. The full grid is ~1500px tall, so the page scrolls —
 * business hours are tinted (see isBusinessHour) to anchor the eye instead.
 */
export interface HourRange {
  startHour: number;
  endHour: number;
}

export const FULL_DAY_RANGE: HourRange = { startHour: START_HOUR, endHour: END_HOUR };

export function gridHeightPx(range: HourRange): number {
  return (range.endHour - range.startHour) * HOUR_ROW_HEIGHT;
}

/** Distance in px from the top of the grid to the given wall-clock time. */
export function timeToOffsetPx(time: string, startHour: number = START_HOUR): number {
  const mins = timeToMinutes(time) - startHour * 60;
  const clamped = Math.max(0, Math.min(TOTAL_MINS, mins));
  return (clamped / 60) * HOUR_ROW_HEIGHT;
}

export function durationToHeightPx(durationMinutes: number): number {
  const raw = (durationMinutes / 60) * HOUR_ROW_HEIGHT;
  return Math.max(MIN_ENTRY_HEIGHT_PX, raw);
}

export function isBusinessHour(hour: number): boolean {
  return hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

export function getHourLabels(range: HourRange): string[] {
  return Array.from(
    { length: range.endHour - range.startHour + 1 },
    (_, i) => `${String(range.startHour + i).padStart(2, '0')}:00`
  );
}

/**
 * Current time as a px offset, or null when outside the rendered range.
 * Drives the "now" marker in the weekly view.
 */
export function nowOffsetPx(range: HourRange): number | null {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < range.startHour * 60 || mins > range.endHour * 60) return null;
  return ((mins - range.startHour * 60) / 60) * HOUR_ROW_HEIGHT;
}

// ─── Interview Conflict Detection ─────────────────────────────────────────────

export interface InterviewConflict {
  interviewId: number;
  conflictsWith: number[];
}

export function detectConflicts(interviews: Interview[]): InterviewConflict[] {
  const conflicts: InterviewConflict[] = [];
  const interviewsByInterviewer = new Map<number, Interview[]>();

  // Group by interviewer
  for (const interview of interviews) {
    if (!interview.interviewerId) continue;
    if (interview.status === 'cancelled') continue;

    const list = interviewsByInterviewer.get(interview.interviewerId) ?? [];
    list.push(interview);
    interviewsByInterviewer.set(interview.interviewerId, list);
  }

  // Check for overlaps within each interviewer's schedule
  for (const [_, interviewerInterviews] of interviewsByInterviewer) {
    for (let i = 0; i < interviewerInterviews.length; i++) {
      const interview1 = interviewerInterviews[i];
      const start1 = timeToMinutes(interview1.scheduledTime);
      const end1 = start1 + interview1.durationMinutes;

      const conflictsWith: number[] = [];

      for (let j = i + 1; j < interviewerInterviews.length; j++) {
        const interview2 = interviewerInterviews[j];
        
        // Must be same date
        if (interview1.scheduledDate !== interview2.scheduledDate) continue;

        const start2 = timeToMinutes(interview2.scheduledTime);
        const end2 = start2 + interview2.durationMinutes;

        // Check for overlap
        if (start1 < end2 && start2 < end1) {
          conflictsWith.push(interview2.id);
        }
      }

      if (conflictsWith.length > 0) {
        conflicts.push({
          interviewId: interview1.id,
          conflictsWith,
        });
      }
    }
  }

  return conflicts;
}

export function hasConflict(interviewId: number, conflicts: InterviewConflict[]): boolean {
  return conflicts.some(
    (c) => c.interviewId === interviewId || c.conflictsWith.includes(interviewId)
  );
}

// ─── Filter Logic ─────────────────────────────────────────────────────────────

export interface InterviewFilter {
  positionId: number | null;
  interviewerId: number | null;
}

export function applyFilters(interviews: Interview[], filters: InterviewFilter): Interview[] {
  let filtered = interviews;

  if (filters.positionId !== null) {
    filtered = filtered.filter((i) => i.positionId === filters.positionId);
  }

  if (filters.interviewerId !== null) {
    filtered = filtered.filter((i) => i.interviewerId === filters.interviewerId);
  }

  return filtered;
}

export function getActiveFilterCount(filters: InterviewFilter): number {
  let count = 0;
  if (filters.positionId !== null) count++;
  if (filters.interviewerId !== null) count++;
  return count;
}

// ─── Color Schemes & Palettes ──────────────────────────────────────────────────
//
// The app's design system is a single warm light theme: cream surfaces
// (#FAFAF8 / #F2F0EC), navy primary (#0D2137) and gold accent (#C9973A).
// Fully saturated purple / emerald / blue tints read as foreign against that,
// so each palette here is a desaturated, warm-leaning tint whose ink is dark
// enough to stay legible on both --surface and --surface-warm.

export interface EntryPalette {
  bg: string;
  border: string;
  leftBorder: string;
  text: string;
  iconColor: string;
  glow?: string;
}

export const INTERVIEW_TYPE_PALETTES: Record<string, EntryPalette> = {
  // In-person is the default store interview — anchored to the navy brand hue.
  in_person: {
    bg: '#EDF1F6',
    border: 'rgba(47, 90, 133, 0.20)',
    leftBorder: '#2F5A85',
    text: '#1B3A5B',
    iconColor: '#2F5A85',
  },
  // Warm plum: clearly distinct from navy without introducing a cold hue.
  phone: {
    bg: '#F5EFF6',
    border: 'rgba(122, 84, 128, 0.20)',
    leftBorder: '#7A5480',
    text: '#4E3253',
    iconColor: '#7A5480',
  },
  // Muted teal: separates video from both navy and plum at a glance.
  video: {
    bg: '#E9F3F2',
    border: 'rgba(47, 125, 116, 0.20)',
    leftBorder: '#2F7D74',
    text: '#1C4F49',
    iconColor: '#2F7D74',
  },
};

/**
 * Status palettes override the type palette when the interview is no longer
 * simply "upcoming" — a finished or cancelled interview should recede visually
 * so the eye lands on what still needs action.
 */
export const INTERVIEW_STATUS_COLORS: Record<string, EntryPalette> = {
  scheduled: INTERVIEW_TYPE_PALETTES.in_person,
  completed: {
    bg: '#EDF4EE',
    border: 'rgba(76, 122, 85, 0.20)',
    leftBorder: '#4C7A55',
    text: '#2C4A32',
    iconColor: '#4C7A55',
  },
  cancelled: {
    bg: '#F4F3F0',
    border: 'rgba(154, 150, 141, 0.28)',
    leftBorder: '#9A968D',
    text: '#78736A',
    iconColor: '#9A968D',
  },
  rescheduled: {
    bg: '#FBF4E6',
    border: 'rgba(201, 151, 58, 0.28)',
    leftBorder: '#C9973A',
    text: '#7A5A15',
    iconColor: '#C9973A',
  },
};

/** Burnt orange: reads as a warning beside gold without colliding with it. */
export const CONFLICT_COLORS: EntryPalette = {
  bg: '#FBEFE4',
  border: 'rgba(180, 99, 42, 0.42)',
  leftBorder: '#B4632A',
  text: '#7A3D14',
  iconColor: '#B4632A',
  glow: '0 0 0 1px rgba(180, 99, 42, 0.18), 0 2px 6px rgba(180, 99, 42, 0.18)',
};

/**
 * Single source of truth for how an entry is coloured.
 *
 * Precedence is deliberate: cancelled and completed win over a conflict flag,
 * because flagging an overlap on an interview that is already finished or called
 * off is noise the user cannot act on.
 */
export function resolveEntryPalette(
  interviewType: string,
  status: string,
  hasConflictFlag: boolean,
): EntryPalette {
  if (status === 'cancelled') return INTERVIEW_STATUS_COLORS.cancelled;
  if (status === 'completed') return INTERVIEW_STATUS_COLORS.completed;
  if (hasConflictFlag) return CONFLICT_COLORS;
  if (status === 'rescheduled') return INTERVIEW_STATUS_COLORS.rescheduled;
  return INTERVIEW_TYPE_PALETTES[interviewType] ?? INTERVIEW_TYPE_PALETTES.in_person;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

export function initials(name: string, surname: string): string {
  const n = (name ?? '').trim();
  const s = (surname ?? '').trim();
  if (!n && !s) return 'U';
  if (!s) return n.slice(0, 1).toUpperCase();
  return `${n.slice(0, 1)}${s.slice(0, 1)}`.toUpperCase();
}

export function fullName(name: string, surname: string): string {
  return `${name ?? ''} ${surname ?? ''}`.trim() || 'Unknown';
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${hours}h ${mins}m`;
}

export function todayString(): string {
  return formatDate(new Date());
}

export function isToday(dateStr: string): boolean {
  return dateStr === todayString();
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return formatDate(date1) === formatDate(date2);
}

// ─── Interview Grouping ───────────────────────────────────────────────────────

export function groupInterviewsByDate(interviews: Interview[]): Map<string, Interview[]> {
  const grouped = new Map<string, Interview[]>();
  
  for (const interview of interviews) {
    const dateKey = interview.scheduledDate;
    const list = grouped.get(dateKey) ?? [];
    list.push(interview);
    grouped.set(dateKey, list);
  }

  return grouped;
}

export function sortInterviewsByTime(interviews: Interview[]): Interview[] {
  return [...interviews].sort((a, b) => {
    const timeA = timeToMinutes(a.scheduledTime);
    const timeB = timeToMinutes(b.scheduledTime);
    return timeA - timeB;
  });
}
