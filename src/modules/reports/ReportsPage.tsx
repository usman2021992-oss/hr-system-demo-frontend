import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { TimePicker } from '../../components/ui/TimePicker';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Company } from '../../types';
import { getCompanies } from '../../api/companies';
import { getAvatarUrl } from '../../api/client';
import { 
  Settings, Download, Play, Pause, Trash2, FileText, CheckSquare, Square,
  Clock, Calendar, AlertTriangle, FileSignature, Users, UserCheck, 
  Sparkles, GraduationCap, Activity, FileCheck, Check, Info, UserPlus,
  ChevronDown, ChevronRight, ChevronUp, Send
} from 'lucide-react';
import {
  getReportOwners,
  getReportConfigurations,
  saveReportConfiguration,
  sendReportNow,
  downloadLastReport,
  getReportHistory,
  downloadArchivedReport,
  deleteArchivedReport,
  getReportPreview,
  ReportOwner,
  ReportConfigData,
  ReportHistoryItem,
  ReportPreview,
  ReportCadence,
} from '../../api/reports';

/** Archive shows this many rows before "Load more" appears. */
const ARCHIVE_PAGE_SIZE = 8;

/** Each cadence gets one colour, used for the card accent and the calendar chip. */
const CADENCE_COLOR: Record<ReportCadence, string> = {
  monthly: '#7C3AED',
  weekly: '#0284C7',
  daily: '#DC2626',
};

const SECTIONS_BY_ROLE: Record<'admin' | 'hr', string[]> = {
  admin: ['workforce', 'shifts', 'anomalies', 'leave', 'contracts', 'ats'],
  hr: ['attendance', 'anomalies', 'shifts', 'leave', 'onboarding', 'trainings', 'medical', 'contracts', 'ats'],
};

const DEFAULT_SECTIONS: Record<string, string[]> = {
  admin_monthly: ['workforce', 'shifts', 'anomalies', 'leave', 'contracts', 'ats'],
  admin_weekly: ['shifts', 'anomalies', 'leave'],
  hr_monthly: ['workforce', 'leave', 'trainings', 'medical', 'contracts'],
  hr_weekly: ['attendance', 'anomalies', 'shifts', 'leave', 'onboarding'],
  anomaly_daily: ['ats'],
};

const DEFAULT_TIME: Record<string, string> = {
  admin_monthly: '07:00',
  admin_weekly: '07:00',
  hr_monthly: '08:00',
  hr_weekly: '07:00',
  anomaly_daily: '08:00',
};

const DEFAULT_DAY: Record<string, number> = {
  admin_monthly: 1,
  admin_weekly: 1,
  hr_monthly: 1,
  hr_weekly: 1,
  anomaly_daily: 1,
};

/** A report's row in report_configurations, merged with its registry definition. */
interface ReportRow {
  reportId: string;
  cadence: ReportCadence;
  ownerUserId: number;
  storeId: number | null;
  status: 'attivo' | 'sospeso' | 'errore';
  day: number;
  time: string;
  recipients: string[];
  sections: string[];
  runCount: number;
  lastGenerated: string | null;
  /**
   * Sections THIS report can actually render, from the server registry. The
   * checkbox list used to come from the user's role, so it offered sections the
   * generator had no branch for — they saved without complaint and produced an
   * empty PDF. Optional so an older cached response still renders.
   */
  supportedSections?: string[];
  /** False for the daily alert: it renders no period comparison. */
  comparesPeriods?: boolean;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

function formatDateTime(value: string | null, lang: string): string {
  if (!value) return lang === 'it' ? 'Mai generato' : 'Never generated';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(',', ' ·');
}

/** Next scheduled run, given the cadence. Daily reports run Monday to Friday. */
function nextRun(cadence: ReportCadence, day: number, time: string, lang: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  if (cadence === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  } else {
    const safeDay = ((day - 1) % 7) + 1;
    const todayIso = now.getDay() === 0 ? 7 : now.getDay();
    let until = (safeDay - todayIso + 7) % 7;
    if (until === 0 && next <= now) until = 7;
    next.setDate(now.getDate() + until);
  }

  return new Intl.DateTimeFormat(lang, {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(next).replace(',', ' ·');
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({ name, filename, color }: { name: string; filename: string | null; color: string }) {
  const url = getAvatarUrl(filename);
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  return (
    <div style={{
      width: 42, height: 42, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: url ? 'transparent' : `${color}18`,
      border: `2px solid ${color}35`,
      color, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)',
    }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report card
// ---------------------------------------------------------------------------

function ReportCard({ report, onToggle, onConfigure, onDownload, onSendNow, ownerName }: {
  report: ReportRow;
  onToggle: () => void;
  onConfigure: () => void;
  onDownload: () => void;
  onSendNow: () => void;
  ownerName: string;
}) {
  const { t, i18n } = useTranslation();
  const { isMobile } = useBreakpoint();
  const isIt = i18n.language === 'it';
  const color = CADENCE_COLOR[report.cadence];
  const active = report.status === 'attivo';

  const [hoverInfo, setHoverInfo] = useState(false);
  const [hoverConf, setHoverConf] = useState(false);
  const [hoverDown, setHoverDown] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const cadenceLabel = { monthly: isIt ? 'Mensile' : 'Monthly', weekly: isIt ? 'Settimanale' : 'Weekly', daily: isIt ? 'Giornaliero' : 'Daily' }[report.cadence];
  const title = t(`reports.data.${report.reportId}.name`, cadenceLabel);

  const getFrequencyLabel = () => {
    const days = isIt
      ? ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
      : ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const safeDay = ((report.day - 1) % 7) + 1;
    if (report.cadence === 'daily') return isIt ? 'Ogni giorno feriale' : 'Every weekday';
    return `${days[safeDay]} ${report.time}`;
  };

  return (
    <Card padding="none" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', borderTop: `3px solid ${color}`, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Title + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0, minWidth: 0 }}>
            {title}
          </h4>
          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 8.5, fontWeight: 800, background: `${color}14`, color, border: `1px solid ${color}30`, letterSpacing: '0.05em' }}>
            {cadenceLabel.toUpperCase()}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
            color: active ? '#15803D' : '#B45309',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#15803D' : '#B45309' }} />
            {active ? (isIt ? 'Attivo' : 'Active') : (isIt ? 'In pausa' : 'Paused')}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Facts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'var(--surface-warm)', borderRadius: 6, padding: '6px 10px', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-disabled)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{isIt ? 'Frequenza' : 'Frequency'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getFrequencyLabel()}</div>
          </div>
          <div style={{ background: 'var(--surface-warm)', borderRadius: 6, padding: '6px 10px', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-disabled)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{isIt ? 'Prossimo invio' : 'Next run'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active ? nextRun(report.cadence, report.day, report.time, i18n.language) : '—'}</div>
          </div>
          <div style={{ background: 'var(--surface-warm)', borderRadius: 6, padding: '6px 10px', minWidth: 0, gridColumn: 'span 2' }}>
            <div style={{ fontSize: 9, color: 'var(--text-disabled)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{isIt ? 'Ultimo report' : 'Last report'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatDateTime(report.lastGenerated, i18n.language)}</div>
          </div>
        </div>

        {/* Divider */}
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0 10px' }} />

        {/* Recipients */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: 'var(--text-disabled)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            {isIt ? 'Destinatari' : 'Recipients'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {report.recipients.slice(0, 3).map(email => (
              <span key={email} style={{ fontSize: 10.5, padding: '2px 8px', background: 'var(--surface-warm)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {email}
              </span>
            ))}
            {report.recipients.length > 3 && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: color }}>
                +{report.recipients.length - 3}
              </span>
            )}
            {report.recipients.length === 0 && (
              <span style={{ fontSize: 10.5, fontStyle: 'italic', color: 'var(--text-disabled)' }}>
                {isIt ? 'Nessun destinatario' : 'No recipients'}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center', width: '100%' }}>
          <button onClick={onToggle} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-body)', border: 'none', color: '#FFF',
            background: active ? '#B45309' : '#15803D',
            whiteSpace: 'nowrap',
          }}>
            {active ? <Pause size={13} /> : <Play size={13} />}
            {active ? (isIt ? 'Pausa' : 'Pause') : (isIt ? 'Attiva' : 'Activate')}
          </button>

          <button onClick={onSendNow} title={isIt ? 'Invia report via email ora' : 'Send report email now'} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-body)', border: '1px solid var(--accent)', color: 'var(--accent)',
            background: 'rgba(201,151,58,0.12)',
            whiteSpace: 'nowrap', transition: 'all 0.15s',
          }}>
            <Send size={13} />
            {isIt ? 'Invia Ora' : 'Send Now'}
          </button>
          
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button 
              onClick={() => setShowInfo(true)}
              onMouseEnter={() => setHoverInfo(true)}
              onMouseLeave={() => setHoverInfo(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: hoverInfo ? 5 : 0,
                padding: '6px 8px', background: 'transparent', color: 'var(--text-secondary)',
                border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'all 0.2s ease-in-out',
                whiteSpace: 'nowrap',
              }}
            >
              <Info size={13} />
              <span style={{
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'max-width 0.2s ease-in-out, opacity 0.2s ease-in-out',
                maxWidth: hoverInfo ? 100 : 0,
                opacity: hoverInfo ? 1 : 0,
              }}>
                {isIt ? 'Info' : 'Info'}
              </span>
            </button>

            <button 
              onClick={onConfigure}
              onMouseEnter={() => setHoverConf(true)}
              onMouseLeave={() => setHoverConf(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: hoverConf ? 5 : 0,
                padding: '6px 8px', background: 'transparent', color: 'var(--text-secondary)',
                border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'all 0.2s ease-in-out',
                whiteSpace: 'nowrap',
              }}
            >
              <Settings size={13} />
              <span style={{
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'max-width 0.2s ease-in-out, opacity 0.2s ease-in-out',
                maxWidth: hoverConf ? 100 : 0,
                opacity: hoverConf ? 1 : 0,
              }}>
                {isIt ? 'Configura' : 'Configure'}
              </span>
            </button>

            <button 
              onClick={onDownload}
              onMouseEnter={() => setHoverDown(true)}
              onMouseLeave={() => setHoverDown(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: hoverDown ? 5 : 0,
                padding: '6px 8px', background: 'transparent', color: 'var(--text-secondary)',
                border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'all 0.2s ease-in-out',
                whiteSpace: 'nowrap',
              }}
            >
              <Download size={13} />
              <span style={{
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'max-width 0.2s ease-in-out, opacity 0.2s ease-in-out',
                maxWidth: hoverDown ? 100 : 0,
                opacity: hoverDown ? 1 : 0,
              }}>
                {isIt ? 'Scarica' : 'Download'}
              </span>
            </button>
          </div>
        </div>
      </div>
      
      {showInfo && (
        <InfoModal
          report={report}
          ownerName={ownerName}
          onClose={() => setShowInfo(false)}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Owner row: avatar + name on the left, company/store on the right, reports below
// ---------------------------------------------------------------------------

function OwnerSection({ owner, reports, onToggle, onConfigure, onDownload, onSendNow }: {
  owner: ReportOwner;
  reports: ReportRow[];
  onToggle: (r: ReportRow) => void;
  onConfigure: (r: ReportRow) => void;
  onDownload: (r: ReportRow) => void;
  onSendNow: (r: ReportRow) => void;
}) {
  const { i18n } = useTranslation();
  const { isMobile } = useBreakpoint();
  const isIt = i18n.language === 'it';
  const isAdmin = owner.role === 'admin';
  const accent = isAdmin ? '#C9973A' : '#0284C7';

  const roleLabel = isAdmin ? 'Admin' : 'HR';
  const scopeCaption = isAdmin ? (isIt ? 'Azienda' : 'Company') : (isIt ? 'Negozio' : 'Store');
  const activeCount = reports.filter(r => r.status === 'attivo').length;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Owner header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '12px 16px', marginBottom: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: `4px solid ${accent}`, borderRadius: 10,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}>
        {/* Left: who */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Avatar name={owner.name} filename={owner.avatarFilename} color={accent} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                {owner.name}
              </span>
              <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', background: `${accent}18`, color: accent }}>
                {roleLabel}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {activeCount}/{reports.length} {isIt ? 'report attivi' : 'reports active'}
            </div>
          </div>
        </div>

        {/* Right: scope */}
        <div style={{ textAlign: isMobile ? 'left' : 'right', minWidth: 0 }}>
          <div style={{ fontSize: 9.5, color: 'var(--text-disabled)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {scopeCaption}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {owner.scopeLabel}
          </div>
        </div>
      </div>

      {/* Reports for this owner */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(reports.length, 3)}, 1fr)`,
        gap: 14,
      }}>
        {reports.map(r => (
          <ReportCard
            key={r.reportId}
            report={r}
            onToggle={() => onToggle(r)}
            onConfigure={() => onConfigure(r)}
            onDownload={() => onDownload(r)}
            onSendNow={() => onSendNow(r)}
            ownerName={`${owner.name} · ${owner.scopeLabel}`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configure modal — schedule, recipients, sections. Nothing else.
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SECTION_ICONS: Record<string, React.ReactNode> = {
  attendance: <UserCheck size={14} style={{ color: 'var(--text-secondary)' }} />,
  anomalies: <AlertTriangle size={14} style={{ color: 'var(--text-secondary)' }} />,
  shifts: <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />,
  leave: <Clock size={14} style={{ color: 'var(--text-secondary)' }} />,
  onboarding: <UserPlus size={14} style={{ color: 'var(--text-secondary)' }} />,
  trainings: <GraduationCap size={14} style={{ color: 'var(--text-secondary)' }} />,
  medical: <Activity size={14} style={{ color: 'var(--text-secondary)' }} />,
  contracts: <FileSignature size={14} style={{ color: 'var(--text-secondary)' }} />,
  workforce: <Users size={14} style={{ color: 'var(--text-secondary)' }} />,
  ats: <Sparkles size={14} style={{ color: 'var(--text-secondary)' }} />,
};

const getSectionDetailText = (sec: string, isIt: boolean, preview: any): string => {
  const highlights = preview?.highlights;
  switch (sec) {
    case 'attendance':
      return isIt
        ? `Includi il riepilogo delle presenze. Turni completati registrati: ${highlights?.completedShifts ?? 0}.`
        : `Include attendance summary. Completed shifts logged: ${highlights?.completedShifts ?? 0}.`;
    case 'anomalies':
      return isIt
        ? `Mostra le anomalie e i ritardi dei dipendenti. Rilevate: ${highlights?.anomalies ?? 0} anomalie.`
        : `Show employee anomalies and delays. Detected: ${highlights?.anomalies ?? 0} anomalies.`;
    case 'shifts':
      return isIt
        ? `Analisi dei turni di lavoro pianificati (${highlights?.scheduledShifts ?? 0}) e tasso di completamento del ${highlights?.completionRate ?? 0}%.`
        : `Analysis of scheduled shifts (${highlights?.scheduledShifts ?? 0}) and a completion rate of ${highlights?.completionRate ?? 0}%.`;
    case 'leave':
      return isIt
        ? `Visualizza richieste di ferie/permessi in sospeso. Richieste attuali: ${highlights?.pendingLeave ?? 0}.`
        : `View pending leave and time-off requests. Current requests: ${highlights?.pendingLeave ?? 0}.`;
    case 'workforce':
      return isIt
        ? `Stato dell'organico aziendale. Dipendenti totali attivi: ${highlights?.headcount ?? 0}.`
        : `Company headcount status. Total active employees: ${highlights?.headcount ?? 0}.`;
    case 'onboarding':
      return isIt
        ? "Monitoraggio e progresso dei nuovi inserimenti in azienda."
        : "Monitoring and progress of new company hires.";
    case 'trainings':
      return isIt
        ? "Rapporto sulla conformità e scadenze dei corsi di formazione."
        : "Compliance and deadlines report for training courses.";
    case 'medical':
      return isIt
        ? "Scadenze e idoneità delle visite mediche del personale."
        : "Deadlines and fitness status of personnel medical checks.";
    case 'contracts':
      return isIt
        ? "Avvisi e scadenze dei contratti di lavoro in scadenza."
        : "Alerts and deadlines for expiring employment contracts.";
    case 'ats':
      return isIt
        ? "Stato della pipeline di ricerca e selezione candidati (ATS)."
        : "Status of the recruitment and candidate selection pipeline (ATS).";
    default:
      return "";
  }
};

function InfoModal({ report, ownerName, onClose }: {
  report: ReportRow;
  ownerName: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isIt = i18n.language === 'it';
  const color = CADENCE_COLOR[report.cadence];
  
  const cadenceLabel = { monthly: isIt ? 'Mensile' : 'Monthly', weekly: isIt ? 'Settimanale' : 'Weekly', daily: isIt ? 'Giornaliero' : 'Daily' }[report.cadence];
  const title = t(`reports.data.${report.reportId}.name`, cadenceLabel);
  const desc = t(`reports.data.${report.reportId}.desc`, '');

  const scheduleHint = (() => {
    const days = isIt
      ? ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
      : ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (report.cadence === 'daily') return isIt ? `Ogni giorno feriale alle ${report.time}` : `Every weekday at ${report.time}`;
    if (report.cadence === 'weekly') return isIt ? `Ogni ${days[report.day]} alle ${report.time}` : `Every ${days[report.day]} at ${report.time}`;
    return isIt ? `Il giorno ${report.day} del mese alle ${report.time}` : `Day ${report.day} of the month at ${report.time}`;
  })();

  return ReactDOM.createPortal(
    <div
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, padding: 16, zIndex: 1100,
        background: 'rgba(13,33,55,0.6)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 500,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
          animation: 'popIn 0.22s cubic-bezier(0.16,1,0.3,1)',
          border: '1px solid var(--border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Color stripe banner at the top */}
        <div style={{ height: 5, background: color, width: '100%' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-warm)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 9.5, padding: '2px 6px', borderRadius: 4, fontWeight: 800, background: `${color}18`, color, border: `1px solid ${color}30`, letterSpacing: '0.04em' }}>
                {cadenceLabel.toUpperCase()}
              </span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </h2>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>{isIt ? 'Panoramica dettagliata del report automatico' : 'Detailed overview of this automated report'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '70vh', overflowY: 'auto' }}>
          
          {/* Description Section */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--surface-warm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', flexShrink: 0 }}>
              <FileText size={15} />
            </div>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 3 }}>
                {isIt ? 'Descrizione' : 'Description'}
              </label>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                {desc}
              </div>
            </div>
          </div>

          {/* Owner & Schedule Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, background: 'var(--surface-warm)', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
            <div>
              <label style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 2 }}>
                {isIt ? 'Assegnatario' : 'Owner'}
              </label>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600 }}>
                {ownerName}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 2 }}>
                {isIt ? 'Pianificazione invio' : 'Delivery Schedule'}
              </label>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} style={{ color: 'var(--text-disabled)' }} />
                {scheduleHint}
              </div>
            </div>
          </div>

          {/* Recipients Badge Block */}
          <div>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
              {isIt ? 'Destinatari e-mail' : 'Email Recipients'}
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {report.recipients.map(email => (
                <span key={email} style={{ fontSize: 11, padding: '4px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {email}
                </span>
              ))}
              {report.recipients.length === 0 && (
                <span style={{ fontSize: 11.5, fontStyle: 'italic', color: 'var(--text-disabled)' }}>
                  {isIt ? 'Nessun destinatario configurato (solo archiviazione)' : 'No recipients configured (archive only)'}
                </span>
              )}
            </div>
          </div>

          {/* Included Sections */}
          <div>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
              {isIt ? 'Sezioni dettagliate incluse nel PDF' : 'Detailed Sections Included in PDF'}
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {report.sections.map(sec => (
                <span key={sec} style={{ fontSize: 11.5, padding: '4px 10px', background: `${color}0D`, border: `1.5px solid ${color}22`, borderRadius: 6, color: 'var(--text-secondary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {SECTION_ICONS[sec] || '📂'}
                  {t(`reports.sections.${sec}`, sec)}
                </span>
              ))}
              {report.sections.length === 0 && (
                <span style={{ fontSize: 11.5, fontStyle: 'italic', color: 'var(--text-disabled)' }}>
                  {isIt ? 'Nessuna sezione di dettaglio selezionata' : 'No detail sections selected'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--surface-warm)' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', background: 'var(--primary)', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {isIt ? 'Chiudi' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root') || document.body
  );
}

function SectionInfoModal({ section, color, preview, onClose }: {
  section: string;
  color: string;
  preview: any;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isIt = i18n.language === 'it';
  const highlights = preview?.highlights;

  const getSectionDetails = () => {
    switch (section) {
      case 'attendance': {
        const compl = highlights?.completedShifts ?? 0;
        const sched = highlights?.scheduledShifts ?? 0;
        const rate = sched > 0 ? Math.round((compl / sched) * 100) : 0;
        return {
          formula: "Attendance Rate = (Completed Shifts / Scheduled Shifts) × 100",
          logic: isIt
            ? "Mette in relazione i turni effettivamente completati (con doppi timbraggi validi) rispetto alla pianificazione originaria caricata in calendario."
            : "Compares shifts actually completed (with valid check-in and check-out punches) against the original scheduler entries.",
          inputs: [
            { label: isIt ? 'Turni Pianificati' : 'Scheduled Shifts', value: sched },
            { label: isIt ? 'Turni Completati' : 'Completed Shifts', value: compl },
            { label: isIt ? 'Tasso di Presenza' : 'Attendance Rate', value: `${rate}%` }
          ],
          result: `${compl} / ${sched} (${rate}%)`
        };
      }
      case 'anomalies': {
        const anom = highlights?.anomalies ?? 0;
        const prev = highlights?.previousAnomalies ?? 0;
        const diff = anom - prev;
        return {
          formula: "Anomalies = Late Checkins + Early Checkouts + Missing Punches",
          logic: isIt
            ? "Rileva anomalie temporali basate sulle tolleranze dei turni. Confronta i dati correnti con il periodo di riferimento precedente per calcolare la variazione delta."
            : "Detects timing discrepancies based on shift tolerances. Compares current period anomalies with the previous period to show delta trends.",
          inputs: [
            { label: isIt ? 'Anomalie Periodo Corrente' : 'Current Period Anomalies', value: anom },
            { label: isIt ? 'Anomalie Periodo Precedente' : 'Previous Period Anomalies', value: prev },
            { label: isIt ? 'Variazione (Delta)' : 'Variation (Delta)', value: `${diff > 0 ? '+' : ''}${diff}` }
          ],
          result: String(anom)
        };
      }
      case 'shifts': {
        const rate = highlights?.completionRate ?? 0;
        const compl = highlights?.completedShifts ?? 0;
        const sched = highlights?.scheduledShifts ?? 0;
        return {
          formula: "Coverage Rate = (Covered Shifts / Required Shifts) × 100",
          logic: isIt
            ? "Calcola la percentuale di turni coperti da contratti attivi rispetto al fabbisogno impostato per ciascun punto vendita."
            : "Calculates the percentage of shift slots filled by active staff assignments compared to the required slots for each location.",
          inputs: [
            { label: isIt ? 'Fabbisogno Turni' : 'Required Shifts', value: sched },
            { label: isIt ? 'Turni Assegnati' : 'Assigned Shifts', value: compl },
            { label: isIt ? 'Tasso di Copertura' : 'Coverage Rate', value: `${rate}%` }
          ],
          result: `${rate}%`
        };
      }
      case 'leave': {
        const pending = highlights?.pendingLeave ?? 0;
        return {
          formula: "Pending Requests = Sum(Awaiting HR / Admin Approval)",
          logic: isIt
            ? "Aggrega tutte le richieste di ferie, permessi, malattia e congedi inserite dai dipendenti che non sono ancora state approvate o rifiutate."
            : "Aggregates all time-off, sick leave, and vacation requests entered by employees that have not yet been approved or rejected.",
          inputs: [
            { label: isIt ? 'Richieste in Sospeso' : 'Pending Requests', value: pending },
            { label: isIt ? 'Stato Monitoraggio' : 'Monitoring Status', value: isIt ? 'Attivo' : 'Active' }
          ],
          result: String(pending)
        };
      }
      case 'workforce': {
        const headcount = highlights?.headcount ?? 0;
        return {
          formula: "Active Headcount = Count(Employees with Active Contract)",
          logic: isIt
            ? "Rileva il numero di dipendenti attivi con un contratto di lavoro in vigore durante il periodo selezionato."
            : "Counts the unique number of active employees with a valid employment contract in force during the selected period.",
          inputs: [
            { label: isIt ? 'Organico Attivo' : 'Active Headcount', value: headcount },
            { label: isIt ? 'Variazioni Dipendenti' : 'Staff Changes', value: isIt ? 'Tracciato' : 'Tracked' }
          ],
          result: String(headcount)
        };
      }
      case 'ats': {
        return {
          formula: "Recruitment Pipeline = Open Positions + Active Candidates",
          logic: isIt
            ? "Estrae metriche dal sistema ATS: avanzamento candidati per stage (screening, colloquio telefonico, di persona, offerta)."
            : "Extracts metrics from the recruitment ATS system: candidate flow across screening, interviews, offers, and hiring.",
          inputs: [
            { label: isIt ? 'Posizioni Aperte' : 'Open Positions', value: isIt ? 'Attivo' : 'Active' },
            { label: isIt ? 'Monitoraggio Funnel' : 'Funnel Tracking', value: isIt ? 'Sincronizzato' : 'Synchronized' }
          ],
          result: isIt ? "Pipeline Attiva" : "Active Pipeline"
        };
      }
      default:
        return {
          formula: "Data Section = System Database Query",
          logic: isIt
            ? "Modulo informativo per il riepilogo e monitoraggio delle scadenze e adempimenti periodici dell'azienda."
            : "Information module for summarizing and tracking periodic deadlines, compliance checks, and requirements.",
          inputs: [
            { label: isIt ? 'Stato Modulo' : 'Module Status', value: isIt ? 'Attivo' : 'Active' }
          ],
          result: isIt ? "Attivo" : "Active"
        };
    }
  };

  const details = getSectionDetails();

  return ReactDOM.createPortal(
    <div
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, padding: 16, zIndex: 1200,
        background: 'rgba(13,33,55,0.6)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 460,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          animation: 'popIn 0.2s cubic-bezier(0.16,1,0.3,1)',
          border: '1px solid var(--border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-warm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: `${color}14`, color, border: `1px solid ${color}22` }}>
              {SECTION_ICONS[section] || '📂'}
            </span>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', display: 'block' }}>
                {t(`reports.sections.${section}`, section)}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--text-disabled)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isIt ? 'Dettagli Calcolo e Formula' : 'Calculation & Formula Details'}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', padding: 6, borderRadius: '50%', display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          
          {/* Formula Card */}
          <div style={{ borderLeft: `3px solid ${color}`, background: `${color}06`, padding: '12px 14px', borderRadius: '0 8px 8px 0' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              {isIt ? 'Formula Matematica / Logica' : 'Mathematical Formula / Logic'}
            </div>
            <code style={{ fontSize: 12, fontFamily: 'Consolas, Monaco, monospace', color: 'var(--text-primary)', fontWeight: 600 }}>
              {details.formula}
            </code>
          </div>

          {/* Logic Explanation */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              {isIt ? 'Come viene calcolato' : 'How it is calculated'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {details.logic}
            </div>
          </div>

          {/* Grid Inputs Table */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              {isIt ? 'Componenti del Calcolo' : 'Calculation Components'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {details.inputs.map((inp, idx) => (
                <div key={idx} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '9px 12px',
                  background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-warm)',
                  borderBottom: idx < details.inputs.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 12.5
                }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{inp.label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{inp.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Final Value Highlight Box */}
          <div style={{ background: 'var(--surface-warm)', border: '1px solid var(--border)', padding: '14px 18px', borderRadius: 10, textAlign: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 2 }}>
              {isIt ? 'Valore finale nel report di anteprima' : 'Final value in preview report'}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--font-display)' }}>
              {details.result}
            </span>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--surface-warm)' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'var(--primary)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#FFF', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {isIt ? 'Chiudi' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root') || document.body
  );
}

function ConfigModal({ report, ownerName, companyId, onClose, onSave }: {
  report: ReportRow;
  ownerName: string;
  companyId?: number;
  onClose: () => void;
  onSave: (data: Partial<ReportRow>) => void;
}) {
  const { t, i18n } = useTranslation();
  const { isMobile } = useBreakpoint();
  const isIt = i18n.language === 'it';
  const color = CADENCE_COLOR[report.cadence];

  const [recipients, setRecipients] = useState([...report.recipients]);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sections, setSections] = useState(new Set(report.sections));
  const [day, setDay] = useState(report.day);
  const [time, setTime] = useState(report.time);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [activeInfoSection, setActiveInfoSection] = useState<string | null>(null);

  const role: 'admin' | 'hr' = report.reportId.startsWith('admin') ? 'admin' : 'hr';
  // Offer only what this report can draw AND this role may see. Falling back to
  // the role list keeps the dialog working against a server that predates
  // supportedSections.
  const roleSections = SECTIONS_BY_ROLE[role];
  const available = report.supportedSections?.length
    ? roleSections.filter(s => report.supportedSections!.includes(s))
    : roleSections;
  const sortedAvailable = [...available].sort((a, b) => {
    const aSel = sections.has(a) ? 1 : 0;
    const bSel = sections.has(b) ? 1 : 0;
    return bSel - aSel;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Show the user what this report will actually tell them, using their real data.
  useEffect(() => {
    let cancelled = false;
    getReportPreview(report.reportId, companyId, report.ownerUserId)
      .then(p => { if (!cancelled) setPreview(p); })
      .catch(() => { /* preview is a nicety; the form still works without it */ });
    return () => { cancelled = true; };
  }, [report.reportId, report.ownerUserId, companyId]);

  const addRecipient = () => {
    const candidate = newEmail.trim();
    if (!EMAIL_PATTERN.test(candidate)) {
      setEmailError(isIt ? 'Indirizzo email non valido.' : 'Invalid email address.');
      return;
    }
    if (recipients.some(r => r.toLowerCase() === candidate.toLowerCase())) {
      setEmailError(isIt ? 'Destinatario gia presente.' : 'Recipient already added.');
      return;
    }
    setRecipients([...recipients, candidate]);
    setNewEmail('');
    setEmailError('');
  };

  const scheduleHint = (() => {
    const days = isIt
      ? ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
      : ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const safeDay = ((day - 1) % 7) + 1;
    if (report.cadence === 'daily') return isIt ? `Ogni giorno feriale alle ${time}` : `Every weekday at ${time}`;
    return isIt ? `Ogni ${days[safeDay]} alle ${time}` : `Every ${days[safeDay]} at ${time}`;
  })();

  const filteredHighlights = preview ? [
    { key: 'shifts', v: String(preview.highlights.scheduledShifts), l: isIt ? 'Turni pianificati' : 'Shifts scheduled', show: sections.has('shifts') || sections.has('attendance') },
    { key: 'shifts', v: `${preview.highlights.completionRate}%`, l: isIt ? 'Completamento' : 'Completion rate', show: sections.has('shifts') || sections.has('attendance') },
    { key: 'anomalies', v: String(preview.highlights.anomalies), l: isIt ? 'Anomalie' : 'Anomalies', delta: preview.highlights.anomalies - preview.highlights.previousAnomalies, show: sections.has('anomalies') },
    { key: 'leave', v: String(preview.highlights.pendingLeave), l: isIt ? 'Ferie da approvare' : 'Leave to approve', show: sections.has('leave') },
    { key: 'workforce', v: String(preview.highlights.headcount), l: isIt ? 'Organico' : 'Headcount', show: sections.has('workforce') },
    { key: 'shifts', v: String(preview.highlights.completedShifts), l: isIt ? 'Turni completati' : 'Shifts completed', show: sections.has('shifts') || sections.has('attendance') },
    { key: 'ats', v: 'ATS', l: isIt ? 'Pipeline Attiva' : 'Active Pipeline', show: sections.has('ats') }
  ].filter(m => m.show) : [];

  return ReactDOM.createPortal(
    <div
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, padding: 16, zIndex: 1000,
        background: 'rgba(13,33,55,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
          animation: 'popIn 0.22s cubic-bezier(0.16,1,0.3,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}} />

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {t(`reports.data.${report.reportId}.name`, report.reportId)}
            </h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>{ownerName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>
          {/* What this report will say — real numbers from the last period */}
          {preview && (
            <div style={{ background: `${color}0A`, border: `1px solid ${color}28`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color }}>
                  {isIt ? 'Cosa dirà questo report' : 'What this report will say'}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-disabled)', fontWeight: 500 }}>
                  {isIt ? 'Periodo' : 'Period'}: {preview.periodStart} → {preview.periodEnd}
                </div>
              </div>
              
              {filteredHighlights.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10 }}>
                  {filteredHighlights.map(m => (
                    <div key={m.l}>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                        {m.v}
                        {m.delta !== undefined && m.delta !== 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 4, color: m.delta > 0 ? '#DC2626' : '#15803D' }}>
                            {m.delta > 0 ? '+' : ''}{m.delta}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.l}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: 'var(--text-disabled)', textAlign: 'center', padding: '6px 0', fontStyle: 'italic' }}>
                  {isIt ? 'Seleziona le sezioni per visualizzare i dati del periodo.' : 'Select sections to display period data.'}
                </div>
              )}
            </div>
          )}

          {/* Schedule */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              {isIt ? 'Quando inviarlo' : 'When to send it'}
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              {report.cadence !== 'daily' && (
                <select
                  value={((day - 1) % 7) + 1}
                  onChange={e => setDay(Number(e.target.value))}
                  style={{
                    flex: 1, height: 38, padding: '0 10px', border: '1.5px solid var(--border)',
                    borderRadius: 8, fontSize: 13.5, fontFamily: 'var(--font-body)', outline: 'none',
                    background: 'var(--surface)', color: 'var(--text-primary)',
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <option key={d} value={d}>{t(`reports.days.${d}`)}</option>
                  ))}
                </select>
              )}
              <div style={{ flex: 1 }}>
                <TimePicker value={time} onChange={setTime} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span>{scheduleHint}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                {isIt ? 'Prossimo invio' : 'Next run'}: <strong style={{ color: 'var(--accent)' }}>{nextRun(report.cadence, day, time, i18n.language)}</strong>
              </span>
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              {isIt ? 'Chi lo riceve' : 'Who receives it'}
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexDirection: isMobile ? 'column' : 'row' }}>
              <input
                value={newEmail}
                onChange={e => { setNewEmail(e.target.value); setEmailError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
                placeholder="nome@azienda.it"
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13, outline: 'none',
                  border: `1.5px solid ${emailError ? '#DC2626' : 'var(--border)'}`,
                  fontFamily: 'var(--font-body)', background: 'var(--surface)', color: 'var(--text-primary)',
                }}
              />
              <button onClick={addRecipient} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                {isIt ? 'Aggiungi' : 'Add'}
              </button>
            </div>
            {emailError && <div style={{ fontSize: 11, color: '#DC2626', marginBottom: 6, fontWeight: 600 }}>{emailError}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {recipients.length === 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--text-disabled)', fontStyle: 'italic' }}>
                  {isIt ? 'Nessun destinatario: il report verra solo archiviato.' : 'No recipients: the report will only be archived.'}
                </span>
              )}
              {recipients.map((r, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--surface-warm)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {r}
                  <button onClick={() => setRecipients(recipients.filter((_, j) => j !== i))} aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', padding: 0, display: 'flex' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>
              {isIt ? 'Cosa includere' : 'What to include'}
            </label>
            {/* The daily alert renders the chosen sections directly: it has no
                executive summary, no exceptions page, no trends and no period
                comparison. Saying otherwise promised output it never produced. */}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              {report.comparesPeriods === false
                ? (isIt
                    ? 'Avviso giornaliero: contiene solo le sezioni selezionate, senza sintesi direzionale né confronto con il periodo precedente.'
                    : 'Daily alert: contains only the selected sections — no executive summary and no comparison with the previous period.')
                : (isIt
                    ? 'Sintesi, criticita e andamento sono sempre presenti. Scegli i dettagli da aggiungere.'
                    : 'Summary, exceptions and trends are always included. Choose the details to add.')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedAvailable.map(sec => {
                const isSelected = sections.has(sec);
                return (
                  <div key={sec} style={{
                    display: 'flex', flexDirection: 'column', padding: '10px 14px', borderRadius: 8,
                    background: isSelected ? `${color}0C` : 'var(--surface-warm)',
                    border: `1.5px solid ${isSelected ? color + '35' : 'var(--border)'}`,
                    transition: 'all 0.2s ease-in-out',
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="checkbox" checked={isSelected}
                          onChange={() => {
                            const next = new Set(sections);
                            if (next.has(sec)) next.delete(sec); else next.add(sec);
                            setSections(next);
                          }}
                          style={{ accentColor: color, width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {t(`reports.sections.${sec}`, sec)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveInfoSection(sec);
                          }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-disabled)', display: 'flex', alignItems: 'center',
                            padding: 4, borderRadius: '50%',
                            transition: 'color 0.15s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = color}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-disabled)'}
                          title={isIt ? 'Come viene calcolato' : 'How it is calculated'}
                        >
                          <Info size={14} />
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          {SECTION_ICONS[sec] || '📂'}
                        </div>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: isMobile ? 'space-between' : 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: isMobile ? 1 : 'none', padding: '9px 20px', background: 'transparent', color: 'var(--text-secondary)', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {isIt ? 'Annulla' : 'Cancel'}
          </button>
          <button
            onClick={() => onSave({
              day, time,
              recipients: Array.from(new Set(recipients.filter(r => EMAIL_PATTERN.test(r)))),
              sections: Array.from(sections),
            })}
            style={{ flex: isMobile ? 1 : 'none', padding: '9px 20px', background: 'var(--primary)', color: '#FFF', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            {isIt ? 'Salva' : 'Save'}
          </button>
        </div>
      </div>

      {activeInfoSection && (
        <SectionInfoModal
          section={activeInfoSection}
          color={color}
          preview={preview}
          onClose={() => setActiveInfoSection(null)}
        />
      )}
    </div>,
    document.getElementById('modal-root') || document.body
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { isMobile } = useBreakpoint();
  const isIt = i18n.language === 'it';

  const [owners, setOwners] = useState<ReportOwner[]>([]);
  const [configs, setConfigs] = useState<ReportConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ report: ReportRow; ownerName: string } | null>(null);

  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReportHistoryItem | null>(null);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<number>>(new Set());
  const [deleteBulkOpen, setDeleteBulkOpen] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(true);
  
  // The refresh re-fetches the archive; without tracking how many rows are on screen
  // it would silently collapse back to the first page after "Load more".
  const loadedCountRef = useRef(ARCHIVE_PAGE_SIZE);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const isSuperAdmin = !!user?.isSuperAdmin || (user?.role as string) === 'super_admin';
  const companyId = isSuperAdmin ? (selectedCompanyId || undefined) : undefined;

  useEffect(() => {
    if (!isSuperAdmin) return;
    getCompanies()
      .then(list => { setCompanies(list); if (list.length) setSelectedCompanyId(list[0].id); })
      .catch(err => console.error('Failed to load companies:', err));
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    if (isSuperAdmin && !selectedCompanyId) return;
    try {
      const [ownerList, configList, page] = await Promise.all([
        getReportOwners(companyId),
        getReportConfigurations(companyId),
        getReportHistory(companyId, { limit: Math.max(ARCHIVE_PAGE_SIZE, loadedCountRef.current), offset: 0 }),
      ]);
      setOwners(ownerList);
      setConfigs(configList);
      setHistory(page.items);
      setHistoryTotal(page.total);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, selectedCompanyId, companyId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(); }, 15000);
    return () => clearInterval(interval);
  }, [load]);

  /** Merges a registry report with its saved config, falling back to defaults. */
  const rowFor = (owner: ReportOwner, def: ReportOwner['reports'][number]): ReportRow => {
    const saved = configs.find(c => c.reportId === def.reportId && c.ownerUserId === owner.userId);
    return {
      reportId: def.reportId,
      cadence: def.cadence,
      ownerUserId: owner.userId,
      storeId: owner.storeId,
      status: (saved?.status ?? def.defaultStatus) as ReportRow['status'],
      day: saved?.day ?? DEFAULT_DAY[def.reportId] ?? 1,
      time: saved?.time ?? DEFAULT_TIME[def.reportId] ?? '07:00',
      recipients: saved?.recipients ?? [],
      sections: saved?.sections ?? DEFAULT_SECTIONS[def.reportId] ?? [],
      runCount: saved?.runCount ?? 0,
      lastGenerated: saved?.lastGenerated ?? null,
    };
  };

  const persist = async (report: ReportRow, changes: Partial<ReportRow>) => {
    const merged = { ...report, ...changes };
    await saveReportConfiguration(report.reportId, {
      day: merged.day,
      time: merged.time,
      recipients: merged.recipients,
      sections: merged.sections,
      status: merged.status,
      ownerUserId: report.ownerUserId,
      storeId: report.storeId,
    }, companyId);
    await load();
  };

  const handleToggle = async (report: ReportRow) => {
    const activating = report.status !== 'attivo';
    try {
      await persist(report, { status: activating ? 'attivo' : 'sospeso' });
      showToast(
        activating
          ? (isIt ? 'Invio automatico attivato.' : 'Automatic sending activated.')
          : (isIt ? 'Invio automatico messo in pausa.' : 'Automatic sending paused.'),
        'success',
      );
    } catch (err) {
      console.error('Failed to toggle report:', err);
      showToast(isIt ? 'Impossibile aggiornare lo stato.' : 'Failed to update status.', 'error');
    }
  };

  const handleSave = async (changes: Partial<ReportRow>) => {
    if (!editing) return;
    try {
      // Saving pauses the schedule: the user must explicitly re-activate, so a
      // half-finished edit never goes out to real recipients.
      await persist(editing.report, { ...changes, status: 'sospeso' });
      showToast(
        isIt ? 'Salvato. Attiva il report per riprendere gli invii.' : 'Saved. Activate the report to resume sending.',
        'success',
      );
      setEditing(null);
    } catch (err) {
      console.error('Failed to save report:', err);
      showToast(isIt ? 'Errore durante il salvataggio.' : 'Failed to save.', 'error');
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownload = async (report: ReportRow) => {
    try {
      showToast(isIt ? 'Generazione del PDF in corso...' : 'Generating PDF...', 'info');
      const blob = await downloadLastReport(report.reportId, companyId, report.ownerUserId);
      downloadBlob(blob, `${report.reportId}.pdf`);
      showToast(isIt ? 'Report scaricato.' : 'Report downloaded.', 'success');
    } catch (err) {
      console.error('Failed to download report:', err);
      showToast(isIt ? 'Impossibile scaricare il report.' : 'Failed to download report.', 'error');
    }
  };

  const handleSendNow = async (report: ReportRow) => {
    try {
      showToast(isIt ? 'Invio del report in corso...' : 'Sending report email...', 'info');
      const res = await sendReportNow(report.reportId, companyId, report.ownerUserId);
      const emails = res.sentTo ? res.sentTo.join(', ') : '';
      showToast(
        isIt
          ? `Report inviato con successo a ${emails || 'destinatari'}`
          : `Report sent successfully to ${emails || 'recipients'}`,
        'success'
      );
      // `load` already refreshes owners, configurations and history together.
      void load();
    } catch (err: any) {
      console.error('Failed to send report:', err);
      showToast(err?.response?.data?.error ?? (isIt ? 'Impossibile inviare il report.' : 'Failed to send report.'), 'error');
    }
  };

  const handleDownloadArchived = async (item: ReportHistoryItem) => {
    try {
      const blob = await downloadArchivedReport(item.id, companyId);
      downloadBlob(blob, `${item.reportId}-${item.targetDate.slice(0, 10)}.pdf`);
      showToast(isIt ? 'Report scaricato.' : 'Report downloaded.', 'success');
    } catch (err) {
      console.error('Failed to download archived report:', err);
      showToast(isIt ? 'Impossibile scaricare il report.' : 'Failed to download report.', 'error');
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await getReportHistory(companyId, { limit: ARCHIVE_PAGE_SIZE, offset: history.length });
      setHistory(prev => [...prev, ...next.items]);
      setHistoryTotal(next.total);
      loadedCountRef.current = history.length + next.items.length;
    } catch (err) {
      console.error('Failed to load more:', err);
      showToast(isIt ? 'Impossibile caricare altri report.' : 'Unable to load more reports.', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteArchivedReport(target.id, companyId);
      setHistory(prev => prev.filter(i => i.id !== target.id));
      setHistoryTotal(prev => Math.max(0, prev - 1));
      loadedCountRef.current = Math.max(ARCHIVE_PAGE_SIZE, loadedCountRef.current - 1);
      showToast(isIt ? 'Report eliminato.' : 'Report deleted.', 'success');
    } catch (err) {
      console.error('Failed to delete report:', err);
      showToast(isIt ? 'Impossibile eliminare il report.' : 'Unable to delete report.', 'error');
    }
  };

  const handleConfirmDeleteBulk = async () => {
    setDeleteBulkOpen(false);
    const targets = Array.from(selectedArchiveIds);
    if (targets.length === 0) return;
    try {
      showToast(isIt ? 'Eliminazione in corso...' : 'Deleting...', 'info');
      await Promise.all(targets.map(id => deleteArchivedReport(id, companyId)));
      setHistory(prev => prev.filter(i => !selectedArchiveIds.has(i.id)));
      setHistoryTotal(prev => Math.max(0, prev - targets.length));
      loadedCountRef.current = Math.max(ARCHIVE_PAGE_SIZE, loadedCountRef.current - targets.length);
      setSelectedArchiveIds(new Set());
      showToast(isIt ? 'Report selezionati eliminati con successo.' : 'Selected reports deleted successfully.', 'success');
    } catch (err) {
      console.error('Failed to delete reports:', err);
      showToast(isIt ? 'Impossibile eliminare alcuni report.' : 'Unable to delete some reports.', 'error');
      void load();
    }
  };

  const allHistoryIds = history.map(item => item.id);
  const allChecked = history.length > 0 && history.every(item => selectedArchiveIds.has(item.id));

  const handleSelectAllArchive = () => {
    if (allChecked) {
      const next = new Set(selectedArchiveIds);
      history.forEach(item => next.delete(item.id));
      setSelectedArchiveIds(next);
    } else {
      const next = new Set(selectedArchiveIds);
      history.forEach(item => next.add(item.id));
      setSelectedArchiveIds(next);
    }
  };

  const handleSelectOneArchive = (id: number) => {
    const next = new Set(selectedArchiveIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedArchiveIds(next);
  };

  const getReportScheduledWeekdays = (report: ReportRow): number[] => {
    if (report.status !== 'attivo') return [];
    if (report.cadence === 'daily') return [1, 2, 3, 4, 5];
    if (report.cadence === 'weekly') return [report.day];
    const [hours, minutes] = report.time.split(':').map(Number);
    const now = new Date();
    const next = new Date(now);
    const clamp = (y: number, m: number) => Math.min(report.day, new Date(y, m + 1, 0).getDate());
    next.setFullYear(now.getFullYear(), now.getMonth(), clamp(now.getFullYear(), now.getMonth()));
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
      const nextM = now.getMonth() + 1;
      const nextY = nextM > 11 ? now.getFullYear() + 1 : now.getFullYear();
      const nextMClamped = nextM > 11 ? 0 : nextM;
      next.setFullYear(nextY, nextMClamped, clamp(nextY, nextMClamped));
    }
    const dayOfWeek = next.getDay();
    return [dayOfWeek === 0 ? 7 : dayOfWeek];
  };

  const visibleOwners = owners.filter(o => user?.role === 'hr' ? o.userId === user.id : true);
  const allRows = visibleOwners.flatMap(o => o.reports.map(d => rowFor(o, d)));
  const totalActive = allRows.filter(r => r.status === 'attivo').length;
  const totalRuns = allRows.reduce((sum, r) => sum + r.runCount, 0);

  const getEarliestNextRun = () => {
    const activeReports = allRows.filter(r => r.status === 'attivo');
    if (activeReports.length === 0) return '—';
    const dates = activeReports.map(r => {
      const [hours, minutes] = r.time.split(':').map(Number);
      const now = new Date();
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      if (r.cadence === 'daily') {
        if (next <= now) next.setDate(next.getDate() + 1);
        while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
      } else if (r.cadence === 'weekly') {
        const todayIso = now.getDay() === 0 ? 7 : now.getDay();
        let until = (r.day - todayIso + 7) % 7;
        if (until === 0 && next <= now) until = 7;
        next.setDate(now.getDate() + until);
      } else {
        const clamp = (y: number, m: number) => Math.min(r.day, new Date(y, m + 1, 0).getDate());
        next.setFullYear(now.getFullYear(), now.getMonth(), clamp(now.getFullYear(), now.getMonth()));
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
          const nextM = now.getMonth() + 1;
          const nextY = nextM > 11 ? now.getFullYear() + 1 : now.getFullYear();
          const nextMClamped = nextM > 11 ? 0 : nextM;
          next.setFullYear(nextY, nextMClamped, clamp(nextY, nextMClamped));
        }
      }
      return next;
    });
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysIt = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    return isIt ? daysIt[minDate.getDay()] : daysEn[minDate.getDay()];
  };

  return (
    <div className="page-enter" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', margin: 0, letterSpacing: '-0.02em' }}>
            {t('nav.reports')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>
            {isIt
              ? `${totalActive} report attivi su ${allRows.length} · ${totalRuns} generati`
              : `${totalActive} of ${allRows.length} reports active · ${totalRuns} generated`}
          </p>
        </div>

        {isSuperAdmin && companies.length > 0 && user?.role !== 'hr' && (
          <select
            value={selectedCompanyId || ''}
            onChange={e => setSelectedCompanyId(Number(e.target.value))}
            style={{
              padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13,
              fontWeight: 600, outline: 'none', cursor: 'pointer',
            }}
          >
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {loading && (
        <Card padding="md" style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 13 }}>
          {isIt ? 'Caricamento...' : 'Loading...'}
        </Card>
      )}

      {!loading && visibleOwners.length === 0 && (
        <Card padding="md" style={{ textAlign: 'center', color: 'var(--text-disabled)', fontSize: 13 }}>
          {isIt
            ? 'Nessun destinatario configurato. Assegna un Admin o un HR a questa azienda.'
            : 'No report owners configured. Assign an Admin or HR user to this company.'}
        </Card>
      )}

      {/* Top summary stats cards grid (Only for Admins) */}
      {!loading && user?.role !== 'hr' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <Card padding="md" style={{ borderLeft: '4px solid #15803D', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#15803D', fontFamily: 'var(--font-display)' }}>{totalActive}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isIt ? 'Report attivi' : 'Active reports'}
            </div>
          </Card>
          <Card padding="md" style={{ borderLeft: '4px solid #0284C7', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0284C7', fontFamily: 'var(--font-display)' }}>{totalRuns}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isIt ? 'Esecuzioni totali' : 'Total executions'}
            </div>
          </Card>
          <Card padding="md" style={{ borderLeft: '4px solid #C9973A', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#C9973A', fontFamily: 'var(--font-display)' }}>{getEarliestNextRun()}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isIt ? 'Prossimo invio' : 'Next execution'}
            </div>
          </Card>
          <Card padding="md" style={{ borderLeft: '4px solid #7C3AED', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', fontFamily: 'var(--font-display)' }}>{historyTotal} PDF</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isIt ? 'Archivio report' : 'Report archive'}
            </div>
          </Card>
        </div>
      )}

      {/* One section per owner: Admin first, then each HR with their store */}
      {!loading && visibleOwners.map(owner => (
        <OwnerSection
          key={owner.userId}
          owner={owner}
          reports={owner.reports.map(d => rowFor(owner, d))}
          onToggle={handleToggle}
          onConfigure={r => setEditing({ report: r, ownerName: `${owner.name} · ${owner.scopeLabel}` })}
          onDownload={handleDownload}
          onSendNow={handleSendNow}
        />
      ))}

      {/* Execution calendar */}
      {!loading && allRows.length > 0 && (
        <Card padding="md" style={{ marginBottom: 24 }}>
          <div 
            onClick={() => setCalendarExpanded(!calendarExpanded)}
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              cursor: 'pointer', userSelect: 'none' 
            }}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={15} style={{ color: 'var(--text-secondary)' }} />
              {isIt ? 'Calendario di esecuzione' : 'Execution calendar'}
            </h3>
            <div style={{ color: 'var(--text-secondary)' }}>
              {calendarExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          
          {calendarExpanded && (
            <div style={{ 
              marginTop: 14, display: 'flex', gap: 0, overflowX: 'auto', 
              border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-warm)',
              animation: 'slideDown 0.2s ease-out'
            }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayKey, i) => {
                const weekdayNum = i + 1; // 1 = Mon, ..., 7 = Sun
                const scheduledForThisDay = allRows.filter(r => getReportScheduledWeekdays(r).includes(weekdayNum));
                
                return (
                  <div key={dayKey} style={{
                    flex: 1, minWidth: 110, padding: '12px 8px',
                    borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                    textAlign: 'center', minHeight: 140, display: 'flex', flexDirection: 'column'
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-disabled)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {isIt 
                        ? ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'][i]
                        : dayKey}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'flex-start' }}>
                      {scheduledForThisDay.map(r => {
                        const reportColor = CADENCE_COLOR[r.cadence];
                        return (
                          <div 
                            key={`${r.reportId}-${r.ownerUserId}`} 
                            style={{
                              fontSize: 9.5, padding: '5px 8px', background: `${reportColor}0D`,
                              border: `1px solid ${reportColor}35`, borderLeft: `3px solid ${reportColor}`,
                              color: 'var(--text-primary)', borderRadius: 6, fontWeight: 700, 
                              lineHeight: 1.2, textAlign: 'left',
                              display: 'flex', flexDirection: 'column', gap: 2,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t(`reports.data.${r.reportId}.name`, r.reportId)}
                            </span>
                            <span style={{ fontSize: 8.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 500 }}>
                              <Clock size={9} />
                              {r.time}
                            </span>
                          </div>
                        );
                      })}
                      {scheduledForThisDay.length === 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-disabled)', fontStyle: 'italic', marginTop: 16 }}>
                          {isIt ? 'Nessun invio' : 'No runs'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Archive */}
      {!loading && (
        <Card padding="none" style={{ marginTop: 8 }}>
          <div 
            onClick={() => setArchiveExpanded(!archiveExpanded)}
            style={{ 
              padding: '16px 20px', borderBottom: archiveExpanded ? '1px solid var(--border)' : 'none', 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              cursor: 'pointer', userSelect: 'none' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={e => isSelectionMode && e.stopPropagation()}>
              {user?.role !== 'hr' && isSelectionMode && history.length > 0 && archiveExpanded && (
                <button 
                  onClick={handleSelectAllArchive} 
                  style={{ 
                    background: 'none', border: 'none', cursor: 'pointer', 
                    display: 'flex', alignItems: 'center', padding: 4, color: 'var(--text-secondary)' 
                  }}
                  title={isIt ? 'Seleziona tutti' : 'Select all'}
                >
                  {allChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              )}
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={15} style={{ color: 'var(--text-secondary)' }} />
                  {isIt ? 'Archivio report' : 'Report archive'}
                </h3>
                <p style={{ fontSize: 11.5, color: 'var(--text-disabled)', margin: '2px 0 0' }}>
                  {isIt ? 'PDF generati automaticamente' : 'Automatically generated PDFs'}
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
              {/* Select Mode Toggle & Delete Actions */}
              {user?.role !== 'hr' && history.length > 0 && archiveExpanded && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isSelectionMode ? (
                    <>
                      {selectedArchiveIds.size > 0 && (
                        <button 
                          onClick={() => setDeleteBulkOpen(true)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                            background: '#DC2626', color: '#FFF', border: 'none', borderRadius: 6,
                            fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                          }}
                        >
                          <Trash2 size={13} />
                          {isIt ? `Elimina (${selectedArchiveIds.size})` : `Delete (${selectedArchiveIds.size})`}
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          setIsSelectionMode(false);
                          setSelectedArchiveIds(new Set());
                        }}
                        style={{
                          padding: '6px 12px', background: 'transparent', color: 'var(--text-secondary)',
                          border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 11.5,
                          fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                        }}
                      >
                        {isIt ? 'Annulla' : 'Cancel'}
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => setIsSelectionMode(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                        background: 'transparent', color: 'var(--text-secondary)',
                        border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 11.5,
                        fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                      }}
                    >
                      <CheckSquare size={13} />
                      {isIt ? 'Seleziona' : 'Select'}
                    </button>
                  )}
                </div>
              )}
              {historyTotal > 0 && archiveExpanded && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{history.length} / {historyTotal}</span>
              )}
              <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                {archiveExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
          </div>

          {archiveExpanded && (
            <div style={{ animation: 'slideDown 0.2s ease-out' }}>
              {history.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--text-disabled)', fontSize: 13 }}>
                  {isIt
                    ? 'Nessun report generato finora. Attiva un report o scarica un PDF per iniziare.'
                    : 'No reports generated yet. Activate a report or download a PDF to start.'}
                </div>
              ) : (
                history.map((item, i) => {
                  const isChecked = selectedArchiveIds.has(item.id);
                  return (
                    <div 
                      key={item.id} 
                      style={{
                        padding: isMobile ? '12px 16px' : '12px 20px',
                        borderBottom: i < history.length - 1 ? '1px solid var(--surface-warm)' : 'none',
                        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                        alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 14,
                        background: isChecked ? 'rgba(2,132,199,0.03)' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isChecked) e.currentTarget.style.background = 'var(--surface-warm)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isChecked) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        {user?.role !== 'hr' && isSelectionMode && (
                          <button 
                            onClick={() => handleSelectOneArchive(item.id)} 
                            style={{ 
                              background: 'none', border: 'none', cursor: 'pointer', 
                              display: 'flex', alignItems: 'center', padding: 0, 
                              color: isChecked ? 'var(--primary)' : 'var(--text-disabled)' 
                            }}
                          >
                            {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        )}
                        
                        <FileText size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t(`reports.data.${item.reportId}.name`, item.reportId)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-disabled)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{formatDateTime(item.generatedAt, i18n.language)}</span>
                            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-disabled)' }} />
                            <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 9.5 }}>
                              {formatBytes(item.sizeBytes)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => handleDownloadArchived(item)} style={{ padding: '7px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', flex: isMobile ? 1 : 'none' }}>
                          {isIt ? 'Scarica' : 'Download'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {history.length < historyTotal && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--surface-warm)', display: 'flex', justifyContent: 'center' }}>
                  <button onClick={handleLoadMore} disabled={loadingMore} style={{
                    padding: '9px 20px', background: 'transparent', color: 'var(--text-secondary)',
                    border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    cursor: loadingMore ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', opacity: loadingMore ? 0.6 : 1,
                  }}>
                    {loadingMore
                      ? (isIt ? 'Caricamento...' : 'Loading...')
                      : `${isIt ? 'Carica altri' : 'Load more'} (+${Math.min(ARCHIVE_PAGE_SIZE, historyTotal - history.length)})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {editing && (
        <ConfigModal
          report={editing.report}
          ownerName={editing.ownerName}
          companyId={companyId}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        variant="danger"
        title={isIt ? 'Eliminare il report?' : 'Delete report?'}
        message={deleteTarget
          ? (isIt
            ? `Il PDF del ${formatDateTime(deleteTarget.generatedAt, i18n.language)} sara rimosso dall'archivio. Puo essere rigenerato in seguito.`
            : `The PDF from ${formatDateTime(deleteTarget.generatedAt, i18n.language)} will be removed from the archive. It can be regenerated later.`)
          : ''}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={deleteBulkOpen}
        variant="danger"
        title={isIt ? 'Eliminare i report selezionati?' : 'Delete selected reports?'}
        message={isIt
          ? `I ${selectedArchiveIds.size} report selezionati verranno rimossi dall'archivio.`
          : `The ${selectedArchiveIds.size} selected reports will be removed from the archive.`}
        onConfirm={handleConfirmDeleteBulk}
        onCancel={() => setDeleteBulkOpen(false)}
      />
    </div>
  );
}

export default ReportsPage;
