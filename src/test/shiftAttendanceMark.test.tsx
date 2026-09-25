import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';
import ShiftAttendanceMark, { resolveMark } from '../modules/shifts/ShiftAttendanceMark';
import { Shift } from '../api/shifts';

function makeShift(patch: Partial<Shift>): Shift {
  return {
    id: 1, companyId: 1, storeId: 1, userId: 5,
    date: '2026-09-24', startTime: '09:00:00', endTime: '17:00:00',
    timezone: 'Europe/Rome',
    breakStart: null, breakEnd: null, breakType: 'fixed', breakMinutes: null,
    isSplit: false, splitStart2: null, splitEnd2: null,
    isOffDay: false, status: 'scheduled', notes: null,
    createdBy: null, createdAt: '', updatedAt: '',
    storeName: 'Roma', userName: 'Mario', userSurname: 'Rossi',
    shiftHours: 8,
    ...patch,
  } as Shift;
}

describe('resolveMark', () => {
  it('marks the four states that have something to say', () => {
    expect(resolveMark(makeShift({ attendanceState: 'completed' }))?.kind).toBe('completed');
    expect(resolveMark(makeShift({ attendanceState: 'in_progress' }))?.kind).toBe('in_progress');
    expect(resolveMark(makeShift({ attendanceState: 'incomplete' }))?.kind).toBe('incomplete');
    expect(resolveMark(makeShift({ attendanceState: 'missed' }))?.kind).toBe('missed');
  });

  it('stays quiet when there is nothing to report', () => {
    expect(resolveMark(makeShift({ attendanceState: 'scheduled' }))).toBeNull();
    expect(resolveMark(makeShift({ attendanceState: 'off' }))).toBeNull();
    expect(resolveMark(makeShift({ attendanceState: 'cancelled' }))).toBeNull();
    expect(resolveMark(makeShift({}))).toBeNull();
  });

  it('does not call an approved absence a missed shift', () => {
    expect(resolveMark(makeShift({ attendanceState: 'missed' }), { onLeave: true })).toBeNull();
    // Leave does not hide a real problem, though.
    expect(resolveMark(makeShift({ attendanceState: 'incomplete' }), { onLeave: true })?.kind).toBe('incomplete');
  });
});

describe('ShiftAttendanceMark', () => {
  const renderMark = (shift: Shift) =>
    render(
      <I18nextProvider i18n={i18n}>
        <ShiftAttendanceMark shift={shift} />
      </I18nextProvider>,
    );

  it('renders nothing for a future shift', () => {
    const { container } = renderMark(makeShift({ attendanceState: 'scheduled' }));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the times in the store timezone, not the viewer one', () => {
    // 07:00Z is 09:00 in Rome; the shift is an instruction in the store's clock.
    renderMark(makeShift({
      attendanceState: 'completed',
      attendanceCheckinAt: '2026-09-24T07:00:00.000Z',
      attendanceCheckoutAt: '2026-09-24T15:00:00.000Z',
      timezone: 'Europe/Rome',
    }));

    fireEvent.mouseEnter(screen.getByRole('img'));
    expect(screen.getByText('09:00')).toBeTruthy();
    expect(screen.getByText('17:00')).toBeTruthy();
  });

  it('opens the timeline on hover and closes it again', () => {
    renderMark(makeShift({
      attendanceState: 'incomplete',
      attendanceCheckinAt: '2026-09-24T07:05:00.000Z',
      attendanceCheckinDelayMinutes: 25,
    }));

    const mark = screen.getByRole('img');
    expect(screen.queryByText(/25/)).toBeNull();

    fireEvent.mouseEnter(mark);
    expect(screen.getByText(/25/)).toBeTruthy();   // the lateness is called out

    fireEvent.mouseLeave(mark);
    expect(screen.queryByText(/25/)).toBeNull();
  });

  it('says so when a shift has no clock-in at all', () => {
    renderMark(makeShift({ attendanceState: 'missed' }));
    fireEvent.mouseEnter(screen.getByRole('img'));
    expect(screen.getByText(/no clock-in|nessuna timbratura/i)).toBeTruthy();
  });

  it('flags an entry that was added by hand', () => {
    renderMark(makeShift({
      attendanceState: 'completed',
      attendanceCheckinAt: '2026-09-24T07:00:00.000Z',
      attendanceCheckoutAt: '2026-09-24T15:00:00.000Z',
      attendanceHasManualEvent: true,
    }));
    fireEvent.mouseEnter(screen.getByRole('img'));
    expect(screen.getByText(/by hand|manualmente/i)).toBeTruthy();
  });
});
