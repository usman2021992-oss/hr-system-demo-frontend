import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getEmployees, resetEmployeeDevice } from '../../api/employees';
import { getDeviceHistory, DeviceEvent } from '../../api/device';
import { getCompanies } from '../../api/companies';
import { getStores } from '../../api/stores';
import { useToast } from '../../context/ToastContext';
import { translateApiError } from '../../utils/apiErrors';
import { Employee, UserRole, Company, Store } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { useSocket } from '../../context/SocketContext';
import { Badge } from '../../components/ui/Badge';
import { getAvatarUrl } from '../../api/client';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { DeviceFilterModal } from './DeviceFilterModal';
import {
  Smartphone,
  ShieldAlert,
  CheckCircle2,
  X,
  Clock,
  HelpCircle,
  Globe,
  Monitor,
  Calendar,
  AlertTriangle,
  User,
  Activity,
  Eye,
  RefreshCw,
  Info,
  Filter
} from 'lucide-react';

export default function HrDeviceResetPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [query, setQuery] = useState('');
  
  // Filter lists
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [storesList, setStoresList] = useState<Store[]>([]);

  // Filter selections
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const hasActiveFilters = !!(
    selectedCompanyIds.length > 0 ||
    selectedStoreIds.length > 0 ||
    selectedRole ||
    selectedStatus
  );

  const activeFiltersCount = 
    (selectedCompanyIds.length > 0 ? 1 : 0) +
    (selectedStoreIds.length > 0 ? 1 : 0) +
    (selectedRole ? 1 : 0) +
    (selectedStatus ? 1 : 0);

  const companyOptions = useMemo(() => {
    return companiesList.map((c) => ({
      value: String(c.id),
      label: c.name,
    }));
  }, [companiesList]);

  const storeOptions = useMemo(() => {
    return storesList.map((s) => ({
      value: String(s.id),
      label: s.companyName ? `${s.name} (${s.companyName})` : s.name,
    }));
  }, [storesList]);

  const roleOptions = [
    { value: 'employee', label: t('roles.employee', 'Dipendente') },
    { value: 'store_terminal', label: t('roles.store_terminal', 'Terminale Negozio') },
    { value: 'store_manager', label: t('roles.store_manager', 'Store Manager') },
    { value: 'area_manager', label: t('roles.area_manager', 'Area Manager') },
    { value: 'hr', label: t('roles.hr', 'Human Resources') },
  ];

  const statusOptions = [
    { value: 'registered', label: t('employees.deviceStatusRegistered', 'Registrato') },
    { value: 'unregistered', label: t('employees.deviceStatusNotRegistered', 'Non Registrato') },
  ];

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Selected employee for the details side drawer
  const [selectedDetailsEmp, setSelectedDetailsEmp] = useState<Employee | null>(null);
  const [historyEvents, setHistoryEvents] = useState<DeviceEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Guide Modal states
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [guideCompanyId, setGuideCompanyId] = useState<string>('');

  const loadEmployees = async () => {
    // Include store terminals
    const res = await getEmployees({ limit: 500, status: 'active', includeStoreTerminals: true });
    // Filter to roles that can register devices and perform attendance actions
    const list = (res.employees ?? []).filter(
      (emp) =>
        emp.role === 'employee' ||
        emp.role === 'store_terminal' ||
        emp.role === 'store_manager' ||
        emp.role === 'area_manager' ||
        emp.role === 'hr'
    );
    setEmployees(list);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void getCompanies().then((res) => { if (!cancelled) setCompaniesList(res); }).catch(() => {});
    void getStores().then((res) => { if (!cancelled) setStoresList(res); }).catch(() => {});

    loadEmployees()
      .catch(() => {
        if (!cancelled) setEmployees([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedCompanyIds.length > 0) {
      setGuideCompanyId(selectedCompanyIds[0]);
    } else if (companiesList.length > 0 && !guideCompanyId) {
      setGuideCompanyId(String(companiesList[0].id));
    }
  }, [selectedCompanyIds, companiesList, guideCompanyId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadEmployees().catch(() => {});
    }, 12000);
    return () => window.clearInterval(timer);
  }, []);

  // Sync real-time socket events
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleDeviceRegistered = (data: { userId: number }) => {
      console.log('Real-time: device registered for user', data.userId);
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === data.userId
            ? { ...emp, deviceRegistered: true, deviceResetPending: false, deviceRegisteredAt: new Date().toISOString() }
            : emp
        )
      );
      // Reload details if open for this user
      if (selectedDetailsEmp && selectedDetailsEmp.id === data.userId) {
        void loadEmployees().then(() => {
          setSelectedDetailsEmp((prev) => prev ? { ...prev, deviceRegistered: true, deviceResetPending: false, deviceRegisteredAt: new Date().toISOString() } : null);
        });
      }
    };

    const handleDeviceReset = (data: { userId: number }) => {
      console.log('Real-time: device reset for user', data.userId);
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === data.userId
            ? { ...emp, deviceRegistered: false, deviceResetPending: false, deviceRegisteredAt: null, deviceMetadata: null }
            : emp
        )
      );
      // Reload details if open for this user
      if (selectedDetailsEmp && selectedDetailsEmp.id === data.userId) {
        void loadEmployees().then(() => {
          setSelectedDetailsEmp((prev) => prev ? { ...prev, deviceRegistered: false, deviceResetPending: false, deviceRegisteredAt: null, deviceMetadata: null } : null);
        });
      }
    };

    socket.on('DEVICE_REGISTERED', handleDeviceRegistered);
    socket.on('DEVICE_RESET', handleDeviceReset);

    return () => {
      socket.off('DEVICE_REGISTERED', handleDeviceRegistered);
      socket.off('DEVICE_RESET', handleDeviceReset);
    };
  }, [socket, selectedDetailsEmp]);

  // Load audit history logs when selectedDetailsEmp changes
  useEffect(() => {
    if (!selectedDetailsEmp) {
      setHistoryEvents([]);
      return;
    }
    setLoadingHistory(true);
    getDeviceHistory(selectedDetailsEmp.id)
      .then((data) => {
        setHistoryEvents(data);
      })
      .catch((err) => {
        console.error('Failed to load device history:', err);
      })
      .finally(() => {
        setLoadingHistory(false);
      });
  }, [selectedDetailsEmp]);

  const filteredEmployees = useMemo(() => {
    let result = employees;

    if (selectedCompanyIds.length > 0) {
      result = result.filter((emp) => selectedCompanyIds.includes(String(emp.companyId)));
    }

    if (selectedStoreIds.length > 0) {
      result = result.filter((emp) => selectedStoreIds.includes(String(emp.storeId)));
    }

    if (selectedRole) {
      result = result.filter((emp) => emp.role === selectedRole);
    }

    if (selectedStatus) {
      result = result.filter((emp) => {
        if (selectedStatus === 'registered') {
          return emp.deviceRegistered === true;
        } else {
          return !emp.deviceRegistered;
        }
      });
    }

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((emp) => {
        const full = `${emp.surname ?? ''} ${emp.name ?? ''}`.toLowerCase();
        return (
          full.includes(q) ||
          (emp.uniqueId ?? '').toLowerCase().includes(q) ||
          emp.email.toLowerCase().includes(q) ||
          (emp.storeName ?? '').toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [employees, query, selectedCompanyIds, selectedStoreIds, selectedRole, selectedStatus]);

  useEffect(() => {
    setPage(1);
  }, [query, selectedCompanyIds, selectedStoreIds, selectedRole, selectedStatus]);

  const total = filteredEmployees.length;
  const pages = Math.ceil(total / limit);

  const paginatedEmployees = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredEmployees.slice(start, start + limit);
  }, [filteredEmployees, page, limit]);

  const handleReset = async () => {
    if (!selectedEmployee || submitting) return;
    setSubmitting(true);
    try {
      await resetEmployeeDevice(selectedEmployee.id);
      showToast(t('deviceReset.successToast'), 'success');
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === selectedEmployee.id
            ? { ...emp, deviceRegistered: false, deviceResetPending: false, deviceRegisteredAt: null, deviceMetadata: null }
            : emp
        )
      );
      // If the details drawer is open for this employee, update it
      if (selectedDetailsEmp && selectedDetailsEmp.id === selectedEmployee.id) {
        setSelectedDetailsEmp((prev) => prev ? { ...prev, deviceRegistered: false, deviceResetPending: false, deviceRegisteredAt: null, deviceMetadata: null } : null);
      }
      setSelectedEmployee(null);
      setConfirmOpen(false);
    } catch (err: unknown) {
      showToast(translateApiError(err, t) ?? t('employees.deviceResetRequestedError'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (isoString: string | null | undefined) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px',
        boxShadow: 'var(--shadow-sm)',
        flexWrap: 'wrap',
        marginBottom: 20,
      }}>
        {/* Search Input */}
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <input
            className="field-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('deviceReset.searchPlaceholder', 'Cerca per nome, email, negozio...')}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: 8,
              border: '1.5px solid var(--border)',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box'
            }}
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none'
            }}
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>

        {/* Filter Button */}
        <button
          type="button"
          onClick={() => setShowFilterModal(true)}
          style={{
            background: hasActiveFilters
              ? 'linear-gradient(135deg, var(--accent) 0%, #B48719 100%)'
              : 'var(--surface)',
            color: hasActiveFilters ? '#fff' : 'var(--text-secondary)',
            border: hasActiveFilters ? 'none' : '1px solid var(--border)',
            borderRadius: '8px',
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
            transition: 'all 0.2s',
            boxShadow: hasActiveFilters ? '0 2px 8px rgba(139,105,20,0.24)' : 'none',
            position: 'relative',
            height: '38px',
          }}
        >
          <Filter size={16} />
          <span>{t('deviceReset.filterTitle', 'Filtra Dispositivi')}</span>
          {hasActiveFilters && (
            <span
              style={{
                background: '#dc2626',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 700,
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                border: '2px solid var(--surface)',
              }}
            >
              {activeFiltersCount}
            </span>
          )}
        </button>

        {/* Help/Guide Icon Button */}
        <button
          type="button"
          onClick={() => setGuideModalOpen(true)}
          style={{
            height: '38px',
            width: '38px',
            borderRadius: 8,
            border: '1.5px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 'auto',
            transition: 'background 0.2s, border-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--background-warm)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
          title={t('deviceReset.guideTitle', 'Guida alla Registrazione')}
        >
          <HelpCircle size={20} />
        </button>
      </div>

      <div className="table-scroll" style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', overflowX: 'auto', boxShadow: 'var(--shadow-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 930 }}>
          <thead>
            <tr style={{ background: 'var(--primary)', color: '#fff' }}>
              <th style={thCell}>{t('deviceReset.colName')}</th>
              <th style={thCell}>{t('deviceReset.colUniqueId')}</th>
              <th style={thCell}>{t('deviceReset.colRole')}</th>
              <th style={thCell}>{t('deviceReset.colCompanyStore')}</th>
              <th style={thCell}>{t('deviceReset.colDeviceStatus')}</th>
              <th style={{ ...thCell, textAlign: 'right' }}>{t('deviceReset.colAction')}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEmployees.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '18px 16px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  {t('deviceReset.empty')}
                </td>
              </tr>
            )}
            {paginatedEmployees.map((emp) => {
              const fullName = [emp.surname, emp.name].filter(Boolean).join(' ') || 'Utente';
              const rawInitials = (emp.surname?.[0] ?? '') + (emp.name?.[0] ?? '');
              const initials = (rawInitials || '?').toUpperCase();
              const bg = getAvatarColor(fullName);

              // Detect IP change
              const registeredIp = emp.deviceMetadata?.ipAddress;
              const lastSeenIp = emp.lastSeenIp;
              const isIpChanged = !!registeredIp && !!lastSeenIp && registeredIp !== lastSeenIp;

              return (
                <tr key={emp.id} style={{ transition: 'background 0.12s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={tdCell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '50%',
                        background: emp.avatarFilename ? 'transparent' : bg, color: '#fff', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                        fontFamily: 'var(--font-display)', overflow: 'hidden',
                      }}>
                        {emp.avatarFilename ? (
                          <img
                            src={getAvatarUrl(emp.avatarFilename) ?? ''}
                            alt={fullName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13.5px', lineHeight: 1.3 }}>
                          {fullName}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }} title={emp.email}>
                          {emp.email.length > 20 ? `${emp.email.slice(0, 20)}...` : emp.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={tdCell}>{emp.uniqueId ?? '-'}</td>
                  <td style={tdCell}>
                    <Badge variant={ROLE_BADGE_VARIANT[emp.role]}>
                      {emp.isSuperAdmin ? t('roles.super_admin') : t(`roles.${emp.role}`)}
                    </Badge>
                  </td>
                  <td style={tdCell}>
                    <div>{emp.companyName ?? '-'}</div>
                    <div style={{ fontSize: 12, color: '#9A6808' }}>{emp.storeName ?? '-'}</div>
                  </td>
                  <td style={tdCell}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                      {emp.deviceResetPending ? (
                        <span style={statusChip('#d97706', 'rgba(217,119,6,0.10)')}>{t('employees.deviceStatusResetPending')}</span>
                      ) : emp.deviceRegistered ? (
                        <span style={statusChip('#15803d', 'rgba(21,128,61,0.10)')}>{t('employees.deviceStatusRegistered')}</span>
                      ) : (
                        <span style={statusChip('#6b7280', 'rgba(107,114,128,0.10)')}>{t('employees.deviceStatusNotRegistered')}</span>
                      )}

                      {isIpChanged && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(217,119,6,0.12)',
                          color: '#b45309',
                          fontSize: '10px',
                          fontWeight: 700,
                          border: '1px solid rgba(217,119,6,0.2)'
                        }}>
                          <AlertTriangle size={10} />
                          {t('deviceReset.ipChangedWarning')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={tdCell}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: 'var(--surface)',
                          color: 'var(--text-secondary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onClick={() => setSelectedDetailsEmp(emp)}
                        title={t('deviceReset.colDetails', 'Dettagli')}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={submitting || emp.deviceResetPending === true || !emp.deviceRegistered}
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setConfirmOpen(true);
                        }}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={!emp.deviceRegistered ? t('deviceReset.noDeviceRegistered', 'Nessun dispositivo registrato') : t('deviceReset.resetButton', 'Reset')}
                      >
                        <RefreshCw size={16} className={submitting && selectedEmployee?.id === emp.id ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pages={pages}
        total={total}
        limit={limit}
        onPageChange={setPage}
      />

      <ConfirmModal
        open={confirmOpen}
        title={t('deviceReset.confirmTitle')}
        message={t('deviceReset.confirmMessage', {
          employee:
            selectedEmployee
              ? `${selectedEmployee.name ?? ''} ${selectedEmployee.surname ?? ''}`
              : '',
        })}
        confirmLabel={submitting ? t('common.loading') : t('deviceReset.resetButton')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onCancel={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        onConfirm={() => { void handleReset(); }}
      />

      <DeviceFilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApply={(vals) => {
          setSelectedCompanyIds(vals.company_ids);
          setSelectedStoreIds(vals.store_ids);
          setSelectedRole(vals.role);
          setSelectedStatus(vals.status);
        }}
        initialFilters={{
          company_ids: selectedCompanyIds,
          store_ids: selectedStoreIds,
          role: selectedRole,
          status: selectedStatus,
        }}
        companyOptions={companyOptions}
        storeOptions={storeOptions}
        roleOptions={roleOptions}
        statusOptions={statusOptions}
        showCompanyFilter={companiesList.length > 0}
      />

      {/* Details Side Drawer Component */}
      {selectedDetailsEmp &&
        createPortal(
          <div
            className="drawer-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'rgba(13, 33, 55, 0.48)',
              backdropFilter: 'blur(3px)',
            }}
            onClick={() => setSelectedDetailsEmp(null)}
          >
            <div
              className="drawer-panel"
              style={{
                position: 'relative',
                width: 'min(440px, 100vw)',
                height: '100%',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '-4px 0 48px rgba(0,0,0,0.16)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Top Color Strip */}
              <div
                style={{
                  height: '4px',
                  flexShrink: 0,
                  background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)',
                }}
              />

              {/* Drawer Header */}
              <div
                style={{
                  padding: '20px 24px 18px',
                  borderBottom: '1px solid var(--border)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-display)',
                      margin: '0 0 3px',
                      letterSpacing: '-0.02em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <Smartphone size={20} color="var(--accent)" />
                    {t('deviceReset.detailsTitle')}
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    {t('deviceReset.detailsSubtitle')}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDetailsEmp(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '4px 6px',
                    fontSize: '24px',
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Drawer Body Scroll */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {/* Employee / Terminal Profile Card */}
                <div
                  style={{
                    background: 'var(--background)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '18px',
                    border: '1px solid var(--border)',
                    marginBottom: '24px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        background: selectedDetailsEmp.avatarFilename ? 'transparent' : getAvatarColor([selectedDetailsEmp.surname, selectedDetailsEmp.name].filter(Boolean).join(' ')),
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        fontWeight: 700,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {selectedDetailsEmp.avatarFilename ? (
                        <img
                          src={getAvatarUrl(selectedDetailsEmp.avatarFilename) ?? undefined}
                          alt={selectedDetailsEmp.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        ((selectedDetailsEmp.surname?.[0] ?? '') + (selectedDetailsEmp.name?.[0] ?? '') || '?').toUpperCase()
                      )}
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '16px',
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {[selectedDetailsEmp.surname, selectedDetailsEmp.name].filter(Boolean).join(' ')}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', wordBreak: 'break-all' }}>
                            {selectedDetailsEmp.email}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {/* Copyable ID tag */}
                          {selectedDetailsEmp.uniqueId && (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(selectedDetailsEmp.uniqueId!);
                                showToast(t('common.copied', 'Copiato!'), 'success');
                              }}
                              title={t('common.copy', 'Copia')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                background: 'var(--surface-warm)',
                                border: '1px solid var(--border)',
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border-light)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-warm)')}
                            >
                              ID: {selectedDetailsEmp.uniqueId}
                              <span style={{ fontSize: '9px', opacity: 0.7 }}>📋</span>
                            </button>
                          )}
                          <Badge variant={ROLE_BADGE_VARIANT[selectedDetailsEmp.role]}>
                            {selectedDetailsEmp.isSuperAdmin ? t('roles.super_admin') : t(`roles.${selectedDetailsEmp.role}`)}
                          </Badge>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '6px' }}>
                        🏢 {selectedDetailsEmp.companyName ?? '-'} • 📍 {selectedDetailsEmp.storeName ?? '-'}
                      </div>
                    </div>
                  </div>
                </div>

                <h3 style={sectionHeading}>
                  <Smartphone size={16} />
                  {t('deviceReset.colDeviceStatus')}
                </h3>
                <div style={{ marginBottom: '24px' }}>
                  {selectedDetailsEmp.deviceRegistered ? (
                    <div style={{
                      background: 'var(--background)',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      border: '1px solid var(--border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '12.5px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.model', 'Dispositivo')}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {selectedDetailsEmp.deviceMetadata?.device?.model || selectedDetailsEmp.deviceMetadata?.model || 'Generic Device'} 
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>
                            ({selectedDetailsEmp.deviceMetadata?.os?.name || 'Unknown'} {selectedDetailsEmp.deviceMetadata?.os?.version || ''})
                          </span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.browser', 'Browser')}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {selectedDetailsEmp.deviceMetadata?.browser?.name || 'Unknown'} {selectedDetailsEmp.deviceMetadata?.browser?.version || ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.registeredIp', 'IP Registrato')}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                          {selectedDetailsEmp.deviceMetadata?.ipAddress || '—'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.registeredAt', 'Registrato Il')}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatDate(selectedDetailsEmp.deviceRegisteredAt)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('deviceReset.lastSeen', 'Ultima Attività')}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {selectedDetailsEmp.lastSeenAt ? formatDate(selectedDetailsEmp.lastSeenAt) : t('deviceReset.neverSeen')}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            IP: {selectedDetailsEmp.lastSeenIp || '—'}
                          </span>
                          {selectedDetailsEmp.deviceMetadata?.ipAddress && selectedDetailsEmp.lastSeenIp && selectedDetailsEmp.deviceMetadata.ipAddress !== selectedDetailsEmp.lastSeenIp && (
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
                    </div>
                  ) : (
                    <div style={{
                      padding: '20px',
                      background: 'rgba(107, 114, 128, 0.05)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border)',
                      textAlign: 'center',
                      color: 'var(--text-muted)'
                    }}>
                      <Smartphone size={32} style={{ margin: '0 auto 10px', color: 'var(--text-disabled)' }} />
                      <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        {t('employees.deviceStatusNotRegistered')}
                      </div>
                      <p style={{ margin: 0, fontSize: '12.5px' }}>
                        {t('deviceReset.subtitle')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Audit history events timeline */}
                <h3 style={sectionHeading}>
                  <Activity size={16} />
                  {t('deviceReset.auditHistory')}
                </h3>
                <div>
                  {loadingHistory ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                      <Spinner size="sm" />
                    </div>
                  ) : historyEvents.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                      No history events logged yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '20px', borderLeft: '2px solid var(--border)' }}>
                      {historyEvents.map((evt) => {
                        const iconBg = EVENT_COLORS[evt.eventType] || '#6b7280';
                        return (
                          <div key={evt.id} style={{ position: 'relative' }}>
                            {/* Timeline dot */}
                            <div style={{
                              position: 'absolute',
                              left: '-27px',
                              top: '4px',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: iconBg,
                              border: '3px solid var(--surface)'
                            }} />

                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                  {t(`attendance.event_${evt.eventType}`, EVENT_LABELS[evt.eventType] || evt.eventType)}
                                </strong>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {formatDate(evt.createdAt)}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                IP: {evt.ipAddress || '—'}
                              </div>
                              {evt.userAgent && (
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace', lineBreak: 'anywhere' }}>
                                  {evt.userAgent.length > 80 ? `${evt.userAgent.slice(0, 80)}...` : evt.userAgent}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div
                style={{
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--background)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                  }}
                  onClick={() => setSelectedDetailsEmp(null)}
                >
                  {t('common.close')}
                </button>
                {selectedDetailsEmp.deviceRegistered && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid transparent',
                      cursor: 'pointer',
                      background: 'var(--danger)',
                      color: '#fff',
                    }}
                    onClick={() => {
                      setSelectedEmployee(selectedDetailsEmp);
                      setConfirmOpen(true);
                    }}
                  >
                    {t('deviceReset.resetButton')}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      }
      {/* Centered Guide Modal */}
      <Modal
        open={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
            <Info size={20} />
            <span>{t('deviceReset.guideTitle', 'Guida alla Registrazione dei Dispositivi')}</span>
          </div>
        }
        maxWidth="680px"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
            onClick={() => setGuideModalOpen(false)}
          >
            {t('common.close', 'Chiudi')}
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Company Selector */}
          {companiesList.length > 0 && (
            <div style={{
              background: 'var(--surface-warm)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius)',
              padding: '12px 16px',
            }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                {t('deviceReset.guideSelectCompany', 'Seleziona Azienda per visualizzare gli esempi dinamici:')}
              </label>
              <Select
                value={guideCompanyId}
                onChange={(e) => setGuideCompanyId(e.target.value)}
                style={{
                  border: '1.5px solid var(--border)',
                  borderRadius: 8,
                  fontSize: '14px',
                  width: '100%',
                  height: '38px',
                  padding: '0 10px',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)'
                }}
              >
                {companiesList.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </Select>
            </div>
          )}

          {/* Dynamic Example Guide */}
          {(() => {
            const selectedCompany = companiesList.find(c => String(c.id) === guideCompanyId) || companiesList[0];
            const companySlug = selectedCompany ? selectedCompany.name.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'azienda';
            const tenantUrl = selectedCompany ? `http://${window.location.host}` : 'http://localhost:5173';
            
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', minWidth: 0 }}>
                {/* Column 1: Employee Registration */}
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px',
                  background: 'var(--surface)'
                }}>
                  <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: 'var(--primary)', borderBottom: '2px solid var(--border-light)', paddingBottom: '8px' }}>
                    📱 {t('deviceReset.guideEmployeeHeader', 'Registrazione Dipendente')}
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.4 }}>
                    {t('deviceReset.guideEmployeeDesc', 'I dipendenti devono registrare il proprio smartphone per timbrare tramite codice QR.')}
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={stepNum}>1</div>
                      <div style={{ fontSize: '12.5px' }}>
                        {t('deviceReset.guideEmployeeStep1', 'Apri il browser sullo smartphone e vai alla pagina di login:')}
                        <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: 'var(--background-warm)', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border-light)', color: 'var(--accent)' }}>
                          {tenantUrl}/login
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={stepNum}>2</div>
                      <div style={{ fontSize: '12.5px' }}>
                        {t('deviceReset.guideEmployeeStep2', 'Accedi con le credenziali del dipendente:')}
                        <div style={{ marginTop: '4px', fontSize: '11px', background: 'var(--background-warm)', padding: '6px', borderRadius: 4, border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                          Email: <strong style={{ color: 'var(--text-primary)' }}>m.rossi@{companySlug}.com</strong><br />
                          Password: <strong style={{ color: 'var(--text-primary)' }}>••••••••</strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={stepNum}>3</div>
                      <div style={{ fontSize: '12.5px' }}>
                        {t('deviceReset.guideEmployeeStep3', 'Una volta effettuato l\'accesso, clicca sul banner "Registra Dispositivo" che appare nella dashboard.')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 2: Terminal Registration */}
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px',
                  background: 'var(--surface)'
                }}>
                  <h4 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: 'var(--primary)', borderBottom: '2px solid var(--border-light)', paddingBottom: '8px' }}>
                    🏪 {t('deviceReset.guideTerminalHeader', 'Registrazione Terminale')}
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.4 }}>
                    {t('deviceReset.guideTerminalDesc', 'I terminali fisici dei negozi (PC/Tablet) devono essere autorizzati prima di poter mostrare il QR code.')}
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={stepNum}>1</div>
                      <div style={{ fontSize: '12.5px' }}>
                        {t('deviceReset.guideTerminalStep1', 'Apri il browser sul tablet o PC del negozio e visita:')}
                        <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: 'var(--background-warm)', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border-light)', color: 'var(--accent)' }}>
                          {tenantUrl}/login
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={stepNum}>2</div>
                      <div style={{ fontSize: '12.5px' }}>
                        {t('deviceReset.guideTerminalStep2', 'Accedi con le credenziali del terminale del negozio:')}
                        <div style={{ marginTop: '4px', fontSize: '11px', background: 'var(--background-warm)', padding: '6px', borderRadius: 4, border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                          Email: <strong style={{ color: 'var(--text-primary)' }}>terminal.roma@{companySlug}.com</strong><br />
                          Password: <strong style={{ color: 'var(--text-primary)' }}>••••••••</strong>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={stepNum}>3</div>
                      <div style={{ fontSize: '12.5px' }}>
                        {t('deviceReset.guideTerminalStep3', 'La schermata mostrerà che il terminale non è autorizzato. Clicca sul pulsante "Registra Dispositivo" per associarlo.')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
}

// Styling Constants
const thCell: CSSProperties = {
  padding: '14px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#fff',
};

const tdCell: CSSProperties = {
  padding: '14px 16px',
  verticalAlign: 'middle',
  color: 'var(--text-primary)',
  fontSize: 13,
  borderBottom: '1px solid var(--border-light)',
};

function statusChip(color: string, bg: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px 12px',
    borderRadius: 999,
    border: `1px solid ${color}44`,
    background: bg,
    color,
    fontSize: 11.5,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  };
}

const ROLE_BADGE_VARIANT: Record<UserRole, 'accent' | 'primary' | 'info' | 'success' | 'warning' | 'neutral'> = {
  admin: 'accent',
  hr: 'info',
  area_manager: 'success',
  store_manager: 'warning',
  employee: 'neutral',
  store_terminal: 'neutral',
};

const AVATAR_PALETTE = ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

const stepCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '12px 14px',
  display: 'flex',
  gap: '10px',
  alignItems: 'flex-start',
};

const stepNum: CSSProperties = {
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  background: 'var(--accent)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
  fontWeight: 700,
  flexShrink: 0,
};

const stepText: CSSProperties = {
  margin: 0,
  fontSize: '12px',
  color: 'var(--text-secondary)',
  lineHeight: 1.4,
};

const sectionHeading: CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: '13.5px',
  fontWeight: 700,
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const infoBox: CSSProperties = {
  background: 'var(--background)',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--radius)',
  padding: '10px 12px',
};

const infoLabel: CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginBottom: '2px',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
};

const infoVal: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const EVENT_COLORS: Record<string, string> = {
  registered: '#15803d',
  mismatch_blocked: '#b91c1c',
  admin_bypass: '#0284c7',
  reset: '#4b5563',
  suspicious_ip: '#d97706',
};

const EVENT_LABELS: Record<string, string> = {
  registered: 'Device Registered',
  mismatch_blocked: 'Access Blocked (Mismatch)',
  admin_bypass: 'Admin Bypass Access',
  reset: 'Binding Reset by HR',
  suspicious_ip: 'Suspicious IP Change',
};
