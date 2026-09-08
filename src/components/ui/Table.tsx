import React from 'react';
import { Spinner } from './Spinner';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  emptyIcon?: React.ReactNode;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  /** When true, removes the outer border/radius so the table can be embedded flush inside a card */
  flush?: boolean;
  /** Custom minimum width for the table. Defaults to '560px' */
  minWidth?: string;
  /** Custom header background color */
  headerBackground?: string;
  /** Custom header text color */
  headerTextColor?: string;
  /** Custom header text transform */
  headerTextTransform?: 'none' | 'capitalize' | 'uppercase' | 'lowercase';
  /** Custom header border bottom style */
  headerBorderBottom?: string;
}

export function Table<T extends object>({
  columns,
  data,
  loading = false,
  emptyText = 'Nessun dato disponibile',
  emptyIcon,
  onSort,
  onRowClick,
  flush = false,
  minWidth = '560px',
  headerBackground,
  headerTextColor,
  headerTextTransform,
  headerBorderBottom,
}: TableProps<T>): React.ReactElement {
  const SortIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 4, opacity: 0.4 }}>
      <path d="M6 9l6-6 6 6M6 15l6 6 6-6"/>
    </svg>
  );

  const EmptyIcon = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <path d="M9 9h6M9 12h4M9 15h2"/>
    </svg>
  );

  return (
    <div style={{
      width: '100%',
      ...(flush ? {} : {
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }),
    }}>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13.5px',
        fontFamily: 'var(--font-body)',
        minWidth: minWidth,
      }}>
        <thead>
          <tr style={{ background: headerBackground ?? 'var(--background)' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align ?? 'left',
                  padding: '12px 16px',
                  fontSize: '11.5px',
                  fontWeight: headerTextColor ? 600 : 600,
                  color: headerTextColor ?? 'var(--text-muted)',
                  textTransform: headerTextTransform ?? 'uppercase',
                  letterSpacing: headerTextTransform === 'none' ? '0.04em' : '0.06em',
                  background: headerBackground ?? 'var(--background)',
                  borderBottom: headerBorderBottom ?? '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                  width: col.width,
                  cursor: col.sortable ? 'pointer' : 'default',
                  userSelect: col.sortable ? 'none' : undefined,
                }}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {col.label}
                  {col.sortable && <SortIcon />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '48px 16px' }}>
                <Spinner size="md" color="var(--accent)" />
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '48px 16px',
                  gap: '12px',
                  color: 'var(--text-muted)',
                }}>
                  {emptyIcon ?? <EmptyIcon />}
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{emptyText}</span>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={onRowClick ? 'tr-hoverable' : ''}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '11px 16px',
                      color: 'var(--text-primary)',
                      borderBottom: rowIndex < data.length - 1 ? '1px solid var(--border-light)' : 'none',
                      verticalAlign: 'middle',
                      textAlign: col.align ?? 'left',
                    }}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default Table;
