/**
 * Safety net for terminal QR scans that land on an expired session.
 *
 * The QR token lives only in the /presenze/scan URL. If anything on the way to
 * the scan page sends the employee to the login page, the token would be lost
 * and so would the clock-in. capturePendingScan() runs before the app renders
 * (before any authenticated request) and keeps the token for this tab; after
 * login, pendingScanPath() brings the employee back to the scan while the QR
 * is still valid (it lasts about 3 minutes).
 */

const KEY = 'hr_pending_qr_scan';
const SCAN_PATH = '/presenze/scan';
// Not worth sending someone back to a QR with only a few seconds left.
const MIN_REMAINING_MS = 5_000;

function qrExpiryMs(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const exp = (JSON.parse(window.atob(padded)) as { exp?: number }).exp;
    return Number.isFinite(exp) ? Number(exp) * 1000 : null;
  } catch {
    return null;
  }
}

export function capturePendingScan(): void {
  try {
    if (window.location.pathname !== SCAN_PATH) return;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;
    sessionStorage.setItem(KEY, token);
  } catch {
    /* storage unavailable — the ?next= redirect still covers the common case */
  }
}

export function clearPendingScan(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** The scan page to resume, or null when there is none or its QR has expired. */
export function pendingScanPath(): string | null {
  try {
    const token = sessionStorage.getItem(KEY);
    if (!token) return null;
    const exp = qrExpiryMs(token);
    if (exp === null || exp - Date.now() < MIN_REMAINING_MS) {
      clearPendingScan();
      return null;
    }
    return `${SCAN_PATH}?token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}
