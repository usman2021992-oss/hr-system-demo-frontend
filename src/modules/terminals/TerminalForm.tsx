import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, RefreshCw, Copy, CheckCircle2, KeyRound, ChevronDown, Store as StoreIcon, Trash2, QrCode, Monitor, Smartphone, AlertTriangle } from 'lucide-react';
import { getBrowserTimeZone, getStoreTimezoneTag, getTimezoneLocalTimeLabel, resolveStoreTimezone, viewerDiffersFromStore } from '../../utils/timezone';
import QRCode from 'react-qr-code';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { createTerminal, updateTerminal, deleteTerminal, getStoresWithTerminalStatus, StoreTerminalStatus, Terminal } from '../../api/terminals';
import { generateQrToken, QrTokenResponse } from '../../api/attendance';
import { resetEmployeeDevice } from '../../api/employees';
import { translateApiError } from '../../utils/apiErrors';
import { formatDateTime, localeFor } from '../../utils/date';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';

interface TerminalFormProps {
  open?: boolean;
  terminal?: Terminal | null;
  onSuccess: () => void;
  onCancel: () => void;
  onRefreshList?: () => void;
}

function generateTempPassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#!$%&';
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 20px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
    </div>
  );
}

export function TerminalForm({ open = true, terminal, onSuccess, onCancel, onRefreshList }: TerminalFormProps) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.language);
  const { isMobile } = useBreakpoint();
  const { showToast } = useToast();
  
  const [stores, setStores] = useState<StoreTerminalStatus[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Terminals created before plain_password existed — or through any path that
  // did not store it — have nothing to reveal. Without saying so the field just
  // sits there empty and the eye button looks broken, which is how this was
  // reported. The stored value is the only copy; a hash cannot be turned back.
  const [storedPasswordMissing, setStoredPasswordMissing] = useState(false);
  // Drives the store clock shown on the details card. Minute precision, so a
  // half-minute tick keeps it honest without spinning while the modal is open.
  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localTerminal, setLocalTerminal] = useState<Terminal | null>(null);

  // QR state
  const [qrData, setQrData] = useState<QrTokenResponse | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownStartRef = useRef<number>(0);
  const countdownTotalRef = useRef<number>(0);

  const storePickerRef = useRef<HTMLDivElement | null>(null);

  const isEditMode = !!terminal;
  const selectedStore = stores.find(s => String(s.id) === selectedStoreId);

  const regeneratePassword = useCallback(() => {
    setPassword(generateTempPassword());
    setPasswordError(undefined);
  }, []);

  const loadQrCode = useCallback(async (storeId: number, isAutoRefresh = false) => {
    if (!isAutoRefresh) setLoadingQr(true);
    try {
      const data = await generateQrToken(storeId);
      setQrData(data);
      setSecondsLeft(data.expiresIn);
      countdownStartRef.current = Date.now();
      countdownTotalRef.current = data.expiresIn;
    } catch (err) {
      console.error('Failed to generate preview QR:', err);
      setQrData(null);
    } finally {
      setLoadingQr(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setNowTick(new Date());
    const id = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Must be re-synced on every open, not only when the `terminal` prop
      // changes: the list keeps its selection after closing, so re-opening the
      // same terminal leaves the prop identical. Resetting it below on close
      // without restoring it here left every `localTerminal`-guarded section
      // (device status and record details) blank on the second open.
      setLocalTerminal(terminal || null);
      setLoadingStores(true);
      getStoresWithTerminalStatus()
        .then(data => {
          const list = Array.isArray(data) ? data : [];
          setStores(list);
          if (terminal) {
            setSelectedStoreId(String(terminal.storeId));
            setEmail(terminal.email);
            loadQrCode(terminal.storeId);
          }
        })
        .catch(() => setError(t('common.error')))
        .finally(() => setLoadingStores(false));
      
      if (!terminal) {
        setPassword(generateTempPassword());
        setEmail('');
        setQrData(null);
      } else {
        const stored = terminal.plainPassword ?? '';
        setPassword(stored);
        setStoredPasswordMissing(!stored);
      }
    } else {
      setSelectedStoreId('');
      setEmail('');
      setPassword('');
      setStoredPasswordMissing(false);
      setShowPassword(false);
      setError(null);
      setCreatedCredentials(null);
      setStorePickerOpen(false);
      setPasswordError(undefined);
      setConfirmDelete(false);
      setQrData(null);
      setLocalTerminal(null);
    }
  }, [open, terminal, t, loadQrCode]);

  useEffect(() => {
    if (selectedStoreId && !isEditMode) {
      const selectedStore = stores.find(s => String(s.id) === selectedStoreId);
      if (selectedStore) {
        const sName = (selectedStore.name || '').toLowerCase().replace(/\s+/g, '');
        const cName = (selectedStore.companyName || '').toLowerCase().replace(/\s+/g, '');
        setEmail(`${sName}@${cName}.com`);
      }
      loadQrCode(Number(selectedStoreId));
    } else if (!selectedStoreId) {
      setQrData(null);
    }
  }, [selectedStoreId, isEditMode, stores, loadQrCode]);

  useEffect(() => {
    if (!qrData) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - countdownStartRef.current) / 1000);
      const next = Math.max(0, countdownTotalRef.current - elapsed);
      setSecondsLeft(next);
      if (next <= 15) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        const sid = Number(selectedStoreId) || (localTerminal?.storeId);
        if (sid) {
          loadQrCode(sid, true);
        }
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [qrData, selectedStoreId, localTerminal, loadQrCode]);

  useEffect(() => {
    if (!storePickerOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (storePickerRef.current && !storePickerRef.current.contains(event.target as Node)) {
        setStorePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [storePickerOpen]);

  const handleResetDevice = async () => {
    if (!localTerminal) return;
    setLoading(true);
    setError(null);
    try {
      await resetEmployeeDevice(localTerminal.id);
      showToast(t('deviceReset.successToast'), 'success');
      
      setLocalTerminal(prev => prev ? {
        ...prev,
        deviceRegistered: false,
        deviceResetPending: false,
        deviceRegisteredAt: null,
        deviceMetadata: null,
        lastSeenIp: null,
        lastSeenAt: null
      } : null);

      if (onRefreshList) onRefreshList();
    } catch (err) {
      setError(translateApiError(err, t, t('employees.deviceResetRequestedError')));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedStoreId) {
      setError(t('terminals.fieldRequired'));
      return;
    }
    
    if (!email) {
      setError(t('terminals.fieldRequired'));
      return;
    }

    if (!password) {
      setError(t('terminals.fieldRequired')); 
      return;
    }

    if (password.length < 8) {
      setPasswordError(t('employees.passwordTooShort'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (isEditMode && localTerminal) {
        await updateTerminal(localTerminal.id, { email, password: password || undefined });
        onSuccess();
      } else {
        await createTerminal({
          storeId: Number(selectedStoreId),
          email,
          password,
        });
        setCreatedCredentials({
          name: selectedStore ? selectedStore.name : '',
          email,
          password,
        });
      }
    } catch (err) {
      setError(translateApiError(err, t, t('terminals.errorSave')));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!localTerminal) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await deleteTerminal(localTerminal.id);
      onSuccess();
    } catch (err) {
      setError(translateApiError(err, t, t('common.error')));
      setConfirmDelete(false);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="drawer-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end', background: 'rgba(13, 33, 55, 0.48)', backdropFilter: 'blur(3px)' }} onClick={onCancel}>
      <div className="drawer-panel" style={{ position: 'relative', width: 'min(520px, 100vw)', height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 48px rgba(0,0,0,0.16)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ height: '3px', flexShrink: 0, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)' }} />
        
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', margin: '0 0 3px', letterSpacing: '-0.02em' }}>
              {isEditMode ? t('terminals.editTerminalTitle') : t('terminals.newTerminalTitle')} 
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
              {isEditMode ? t('terminals.editTerminalSubtitle') : t('terminals.readOnlyNotice')}
            </p>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', fontSize: '22px', lineHeight: 1 }}>×</button>
        </div>

        {!createdCredentials ? (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', minHeight: 0 }}>
              {error && (
                <div style={{ marginBottom: '20px' }}>
                  <Alert variant="danger">{error}</Alert>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                
                {/* Store Details Card (Always at top in Edit Mode) */}
                {(() => {
                  const name = selectedStore ? selectedStore.name : (localTerminal ? localTerminal.storeName : '');
                  const code = selectedStore ? selectedStore.code : (stores.find(s => s.id === localTerminal?.storeId)?.code);
                  const company = selectedStore ? selectedStore.companyName : (localTerminal ? localTerminal.companyName : '');
                  const address = selectedStore ? selectedStore.address : (stores.find(s => s.id === localTerminal?.storeId)?.address);
                  const cap = selectedStore ? selectedStore.cap : (stores.find(s => s.id === localTerminal?.storeId)?.cap);
                  const storeTimezone = selectedStore ? selectedStore.timezone : (stores.find(s => s.id === localTerminal?.storeId)?.timezone);

                  if (!name && !company) return null;

                  return (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '12px 14px',
                      background: 'var(--surface-warm)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      fontSize: '12.5px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{name}</span>
                        {code && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--background)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', fontWeight: 600 }}>
                            {code}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🏢</span>
                        <span>{company}</span>
                      </div>
                      {/* Whoever sets a terminal up is often not standing in the shop.
                          The clock-in window is enforced on the STORE's clock, so the
                          store's zone and current time are stated here, and the setter's
                          own clock only when the two disagree. */}
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>🕒</span>
                        <span title={resolveStoreTimezone(storeTimezone)}>
                          {getTimezoneLocalTimeLabel(resolveStoreTimezone(storeTimezone), nowTick)}
                          {' · '}
                          {getStoreTimezoneTag(storeTimezone, nowTick)}
                        </span>
                        {viewerDiffersFromStore(storeTimezone) && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {t('terminals.yourTimeIs', 'your time {{time}} ({{zone}})', {
                              time: getTimezoneLocalTimeLabel(getBrowserTimeZone(), nowTick),
                              zone: getStoreTimezoneTag(getBrowserTimeZone(), nowTick),
                            })}
                          </span>
                        )}
                      </div>
                      {address && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📍</span>
                          <span>{address} {cap ? `(${cap})` : ''}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Store Selection (Only in Create Mode) */}
                {!isEditMode && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {t('terminals.selectStore')}
                    </label>
                    <div style={{ position: 'relative' }} ref={storePickerRef}>
                      <button
                        onClick={() => setStorePickerOpen(!storePickerOpen)}
                        type="button"
                        disabled={loadingStores}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', background: 'var(--surface)',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '14px', color: selectedStore ? 'var(--text-primary)' : 'var(--text-disabled)' }}>
                          {selectedStore 
                            ? `${selectedStore.name} (${selectedStore.companyName})` 
                            : t('terminals.selectStore')}
                        </span>
                        <ChevronDown size={16} color="var(--text-muted)" />
                      </button>

                      {storePickerOpen && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 10,
                          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                          boxShadow: 'var(--shadow-lg)', maxHeight: '250px', overflowY: 'auto', padding: '4px'
                        }}>
                          {stores.map(s => (
                            <button
                              key={s.id}
                              onClick={() => {
                                if (!s.hasTerminal) {
                                  setSelectedStoreId(String(s.id));
                                  setStorePickerOpen(false);
                                  setError(null);
                                }
                              }}
                              disabled={s.hasTerminal}
                              style={{
                                width: '100%', padding: '8px 12px', border: 'none', borderRadius: 'var(--radius-sm)',
                                background: selectedStoreId === String(s.id) ? 'var(--primary-light)' : 'transparent',
                                cursor: s.hasTerminal ? 'not-allowed' : 'pointer', textAlign: 'left',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                gap: '12px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                <div style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  background: s.hasTerminal ? 'rgba(100,116,139,0.1)' : 'var(--accent)',
                                  color: s.hasTerminal ? 'var(--text-disabled)' : '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '13px',
                                  fontWeight: 700,
                                  flexShrink: 0
                                }}>
                                  {s.name.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: s.hasTerminal ? 'var(--text-disabled)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.companyName}</span>
                                </div>
                              </div>
                              <span style={{
                                fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                                background: s.hasTerminal ? 'rgba(21,128,61,0.1)' : 'rgba(100,116,139,0.1)',
                                color: s.hasTerminal ? 'var(--success)' : 'var(--text-muted)', textTransform: 'uppercase',
                                flexShrink: 0
                              }}>
                                {s.hasTerminal ? t('terminals.terminalCreated') : t('terminals.terminalNotCreated')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Device Binding / Registration Details (Only in Edit Mode) */}
                {isEditMode && localTerminal && (
                  <div>
                    <SectionDivider label={t('deviceReset.colDeviceStatus')} />
                    {localTerminal.deviceRegistered ? (
                      <div style={{
                        background: 'var(--surface-warm)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        fontSize: '13px',
                        marginBottom: '8px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.model', 'Device')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {localTerminal.deviceMetadata?.device?.model || localTerminal.deviceMetadata?.model || 'Generic Terminal'}
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>
                              ({localTerminal.deviceMetadata?.os?.name || 'Unknown'} {localTerminal.deviceMetadata?.os?.version || ''})
                            </span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.browser', 'Browser')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {localTerminal.deviceMetadata?.browser?.name || 'Unknown'} {localTerminal.deviceMetadata?.browser?.version || ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.registeredIp', 'Registered IP')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {localTerminal.deviceMetadata?.ipAddress || '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.registeredAt', 'Registered At')}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {localTerminal.deviceRegisteredAt ? new Date(localTerminal.deviceRegisteredAt).toLocaleString() : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.lastSeen', 'Last Active')}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {localTerminal.lastSeenAt ? new Date(localTerminal.lastSeenAt).toLocaleString() : t('deviceReset.neverSeen')}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              IP: {localTerminal.lastSeenIp || '—'}
                            </span>
                            {localTerminal.deviceMetadata?.ipAddress && localTerminal.lastSeenIp && localTerminal.deviceMetadata.ipAddress !== localTerminal.lastSeenIp && (
                              <span style={{
                                background: 'rgba(217,119,6,0.1)',
                                color: '#b45309',
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: '1px solid rgba(217,119,6,0.2)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                marginTop: '2px'
                              }}>
                                <AlertTriangle size={9} />
                                {t('deviceReset.ipChangedWarning')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ marginTop: '6px', borderTop: '1px solid var(--border-light)', paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={handleResetDevice}
                            loading={loading}
                            style={{ gap: '6px' }}
                          >
                            <Smartphone size={14} />
                            {t('deviceReset.resetButton')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: 'var(--surface-warm)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px dashed var(--border)',
                        padding: '20px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                        marginBottom: '8px'
                      }}>
                        <Monitor size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                        <div style={{ fontWeight: 600 }}>{t('deviceRegistration.notRegisteredTitle', 'Terminal Not Registered')}</div>
                        <div style={{ fontSize: '11.5px', marginTop: '4px', opacity: 0.75 }}>
                          {t('deviceRegistration.notRegisteredDesc', 'This terminal is not bound to a device.')}
                        </div>
                        <div style={{ fontSize: '11.5px', marginTop: '10px', opacity: 0.9, lineHeight: 1.5 }}>
                          {t(
                            'terminals.notRegisteredHint',
                            'Credentials have been created, but nobody has signed in on the store device yet. Sign in on that device to complete registration.',
                          )}
                        </div>
                      </div>
                    )}

                    {/* Record metadata — kept next to the device panel because
                        support usually needs "when was this set up, and by whom?"
                        together with "is it working?". */}
                    <div style={{
                      background: 'var(--surface)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border)',
                      padding: '14px 16px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: '12px 20px',
                      fontSize: '12.5px',
                      marginTop: '10px',
                    }}>
                      {[
                        { label: t('common.createdAt', 'Created'), value: formatDateTime(localTerminal.createdAt, locale) },
                        { label: t('common.createdBy', 'Created by'), value: localTerminal.createdByName || '—' },
                        { label: t('common.updatedAt', 'Last updated'), value: formatDateTime(localTerminal.updatedAt, locale) },
                        { label: t('common.updatedBy', 'Updated by'), value: localTerminal.updatedByName || '—' },
                      ].map((item) => (
                        <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {item.label}
                          </span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <SectionDivider label={t('terminals.terminalStep2')} />

                {/* Editable Credentials Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                      {t('terminals.emailLabel')}
                    </label>
                    <Input 
                      type="email"
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="terminal@company.com"
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                      {t('terminals.passwordLabel')}
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          placeholder={isEditMode ? '••••••••' : ''}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (e.target.value.length >= 8) setPasswordError(undefined);
                          }}
                          error={passwordError}
                          style={{ paddingRight: '40px' }}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={!password}
                          title={password
                            ? (showPassword ? t('common.hide', 'Hide') : t('common.show', 'Show'))
                            : t('terminals.passwordNotStoredShort', 'No password stored')}
                          aria-label={showPassword ? t('common.hide', 'Hide') : t('common.show', 'Show')}
                          style={{
                            position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', padding: '4px',
                            cursor: password ? 'pointer' : 'not-allowed',
                            opacity: password ? 1 : 0.4,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <Button variant="secondary" onClick={regeneratePassword} style={{ padding: '0 12px' }} title={t('common.generate')}>
                        <RefreshCw size={16} />
                      </Button>
                    </div>
                    {storedPasswordMissing && !password && (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 7,
                        fontSize: 11.5, lineHeight: 1.45, color: 'var(--text-muted)',
                      }}>
                        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>
                          {t('terminals.passwordNotStored',
                            'This terminal was created before its password was kept on file, so there is nothing to show. Generate a new one to set it.')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* QR Code Preview Section with Countdown */}
                  {(selectedStoreId || (isEditMode && localTerminal)) && (
                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px', background: 'var(--surface-warm)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                      <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', width: '100%', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <QrCode size={14} />
                          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t('qr.title')} Preview
                          </span>
                        </div>
                        {qrData && secondsLeft > 0 && (
                          <span style={{ fontSize: '11px', fontWeight: 600, color: secondsLeft <= 15 ? 'var(--danger)' : 'var(--success)' }}>
                            {secondsLeft}s
                          </span>
                        )}
                      </div>
                      
                      <div style={{ padding: '12px', background: '#fff', borderRadius: 'var(--radius)', border: '1.5px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', opacity: loadingQr ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                        {loadingQr ? (
                          <div style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <RefreshCw size={24} className="animate-spin" color="var(--text-disabled)" />
                          </div>
                        ) : qrData ? (
                          <QRCode value={qrData.token} size={140} fgColor="var(--text-primary)" bgColor="#fff" level="M" />
                        ) : (
                          <div style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>QR not available</span>
                          </div>
                        )}
                      </div>

                      {qrData && (
                        <div style={{ width: '100%', height: '4px', background: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.max(0, (secondsLeft / (qrData.expiresIn || 60)) * 100)}%`,
                            height: '100%',
                            background: secondsLeft <= 15 ? 'var(--danger)' : 'var(--success)',
                            transition: 'width 1s linear'
                          }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-warm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                {isEditMode && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDelete}
                    loading={loading}
                    style={{ border: confirmDelete ? '2px solid var(--danger)' : 'none' }}
                  >
                    <Trash2 size={16} style={{ marginRight: '8px' }} />
                    {confirmDelete ? t('common.confirm') : t('terminals.deleteTerminal')}
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button variant="secondary" onClick={onCancel} disabled={loading}>{t('common.cancel')}</Button>
                <Button onClick={handleSubmit} loading={loading}>
                  {isEditMode ? t('terminals.updateTerminal') : t('common.save')}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(21,128,61,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
                <CheckCircle2 size={32} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>{t('terminals.terminalCreatedTitle')}</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '320px' }}>{t('terminals.terminalCreatedSubtitle')}</p>
              </div>

              <div style={{ width: '100%', background: 'var(--surface-warm)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                    <StoreIcon size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{createdCredentials.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{createdCredentials.email}</div>
                  </div>
                </div>
                <div style={{ height: '1px', background: 'var(--border-light)' }} />
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'block' }}>{t('employees.tempPasswordLabel')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                    <KeyRound size={16} color="var(--accent)" />
                    <code style={{ flex: 1, fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, letterSpacing: '0.05em' }}>{createdCredentials.password}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdCredentials.password);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      style={{ background: copied ? 'rgba(21,128,61,0.1)' : 'var(--accent-light)', border: 'none', borderRadius: '4px', padding: '6px 10px', fontSize: '12px', fontWeight: 600, color: copied ? 'var(--success)' : 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                      {copied ? t('employees.copied') : t('employees.copyPassword')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-warm)', display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={onSuccess}>{t('common.close')}</Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
