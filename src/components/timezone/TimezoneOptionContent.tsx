import React from 'react';
import { getTimezoneLocalTimeLabel, getUtcOffsetLabel } from '../../utils/timezone';

interface TimezoneOptionContentProps {
  timezone: string;
}

export function TimezoneOptionContent({ timezone }: TimezoneOptionContentProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minWidth: 0 }}>
      <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{timezone}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{getUtcOffsetLabel(timezone)}</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
          {getTimezoneLocalTimeLabel(timezone)}
        </span>
      </div>
    </div>
  );
}
