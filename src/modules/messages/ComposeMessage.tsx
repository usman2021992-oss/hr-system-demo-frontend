import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Paperclip, Plus, X, Image as ImageIcon } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { sendMessage } from '../../api/messages';
import { getEmployees } from '../../api/employees';
import { translateApiError } from '../../utils/apiErrors';
import { useAuth } from '../../context/AuthContext';
import apiClient, { getAvatarUrl, getMessageAttachmentUrl } from '../../api/client';
import { Badge } from '../../components/ui/Badge';
import { UserRole } from '../../types';
import { PlatformReferencePicker } from './PlatformReferencePicker';
import { PlatformReference, ReferenceChip, buildReferenceToken } from './platformReference';

interface Props {
  /** Pre-set recipient (reply mode or employee→HR). If omitted, show picker. */
  recipientId?: number;
  recipientName?: string;
  companyId?: number | null;
  /** Optional prefill for reply mode */
  defaultSubject?: string;
  defaultBody?: string;
  onClose: () => void;
  onSent?: (recipientId: number) => void;
}

interface PickableEmployee {
  id: number;
  name: string;
  surname: string;
  role: UserRole;
  email: string;
  avatarFilename?: string | null;
  companyName?: string | null;
  companyId?: number;
}

const ROLE_ORDER: Record<UserRole, number> = {
  admin: 0,
  hr: 1,
  area_manager: 2,
  store_manager: 3,
  employee: 4,
  store_terminal: 5,
};

const ROLE_BADGE_VARIANT: Record<UserRole, 'accent' | 'primary' | 'info' | 'success' | 'warning' | 'neutral'> = {
  admin: 'accent',
  hr: 'info',
  area_manager: 'success',
  store_manager: 'warning',
  employee: 'neutral',
  store_terminal: 'neutral',
};

const AVATAR_COLORS = ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || 'U').toUpperCase();
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  display: 'block', marginBottom: 6,
};

export function ComposeMessage({ recipientId, recipientName, companyId, defaultSubject, defaultBody, onClose, onSent }: Props) {
  const { t } = useTranslation();
  const { user, targetCompanyId, allowedCompanyIds } = useAuth();

  const showPicker = recipientId === undefined;

  const [subject, setSubject] = useState(defaultSubject ?? '');
  const [body, setBody] = useState(defaultBody ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attachments & Platform Reference
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [selectedRef, setSelectedRef] = useState<PlatformReference | null>(null);

  // Picker state
  const [employees, setEmployees] = useState<PickableEmployee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [pickedName, setPickedName] = useState<string>('');
  const effectiveCompanyId = companyId ?? targetCompanyId ?? user?.companyId ?? null;
  const shouldFetchAllAccessibleUsers = allowedCompanyIds.length > 1;
  const pickerCompanyId = shouldFetchAllAccessibleUsers ? undefined : effectiveCompanyId ?? undefined;

  useEffect(() => {
    if (!showPicker) return;
    setEmpLoading(true);
    getEmployees({
      limit: shouldFetchAllAccessibleUsers ? 500 : 200,
      status: 'active',
      targetCompanyId: pickerCompanyId,
      includeStoreTerminals: true,
    })
      .then(({ employees: list }) => setEmployees(list))
      .catch(() => {})
      .finally(() => setEmpLoading(false));
  }, [pickerCompanyId, shouldFetchAllAccessibleUsers, showPicker]);

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    if (user?.id === e.id) return false;
    return (
      e.name.toLowerCase().includes(q) ||
      e.surname.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q)
    );
  });

  const selfDisplayName = `${user?.name ?? ''} ${user?.surname ?? ''}`.trim() || (user?.email ?? '—');
  const selfAvatarUrl = getAvatarUrl(user?.avatarFilename);

  const effectiveRecipientId = showPicker ? pickedId : recipientId;
  const effectiveRecipientName = showPicker ? pickedName : (recipientName ?? '');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await apiClient.post('/messages/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedFilename(data.data.filename);
    } catch {
      setError(t('messages.errorUpload', 'Failed to upload attachment'));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSend = async () => {
    if (!effectiveRecipientId) {
      setError(t('messages.errorPickRecipient'));
      return;
    }
    if (!body.trim() && !uploadedFilename) {
      setError(t('messages.errorBodyRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let finalBody = body.trim();
      if (selectedRef) {
        finalBody += `\n\n${buildReferenceToken(selectedRef)}`;
      }

      await sendMessage({
        recipientId: effectiveRecipientId,
        subject: subject.trim() || undefined,
        body: finalBody,
        companyId: shouldFetchAllAccessibleUsers ? undefined : effectiveCompanyId,
        attachmentFilename: uploadedFilename || undefined,
      } as any);
      onSent?.(effectiveRecipientId);
      onClose();
    } catch (err: unknown) {
      setError(translateApiError(err, t, t('messages.errorSend')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('messages.compose')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button loading={saving} onClick={handleSend} disabled={!effectiveRecipientId}>
            {t('messages.send')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <Alert variant="danger" title={t('common.error')} onClose={() => setError(null)}>{error}</Alert>
        )}

        {/* Recipient row */}
        <div>
          <label style={LABEL_STYLE}>{t('messages.recipientLabel')}</label>

          {showPicker ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!!user && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-warm)',
                }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: selfAvatarUrl ? 'transparent' : getAvatarColor(selfDisplayName),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 12,
                    flexShrink: 0,
                  }}>
                    {selfAvatarUrl ? (
                      <img src={selfAvatarUrl} alt={selfDisplayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : getInitials(selfDisplayName)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{selfDisplayName}</span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        borderRadius: 999,
                        padding: '1px 6px',
                        lineHeight: 1.4,
                      }}>
                        {t('messages.meTag')}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.email}
                    </div>
                  </div>
                </div>
              )}

              {/* Search input */}
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
                />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('messages.searchEmployee')}
                  disabled={empLoading || saving}
                  style={{
                    width: '100%', padding: '8px 12px 8px 32px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    fontSize: '13px', fontFamily: 'var(--font-body)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Employee list */}
              {empLoading ? (
                <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
                  <Spinner size="sm" />
                </div>
              ) : (
                <div style={{
                  maxHeight: 180, overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface)',
                }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('common.noResults')}
                    </div>
                  ) : filtered
                    .slice()
                    .sort((a, b) => {
                      const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
                      if (roleDiff !== 0) return roleDiff;
                      const companyDiff = (a.companyName ?? '').localeCompare(b.companyName ?? '');
                      if (companyDiff !== 0) return companyDiff;
                      return `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`);
                    })
                    .map(emp => {
                    const fullName = `${emp.name} ${emp.surname}`;
                    const isPicked = pickedId === emp.id;
                    const avatarUrl = getAvatarUrl(emp.avatarFilename);
                    const roleLabel = t(`roles.${emp.role}`, emp.role);
                    return (
                      <button
                        key={emp.id}
                        onClick={() => { setPickedId(emp.id); setPickedName(fullName); }}
                        style={{
                          width: '100%', textAlign: 'left', border: 'none',
                          padding: '9px 14px', cursor: 'pointer',
                          background: isPicked ? 'var(--accent-light)' : 'transparent',
                          color: isPicked ? 'var(--accent)' : 'var(--text-primary)',
                          fontWeight: isPicked ? 700 : 400,
                          fontSize: 13, fontFamily: 'var(--font-body)',
                          borderBottom: '1px solid var(--border-light)',
                          display: 'flex', alignItems: 'center', gap: 10,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (!isPicked) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-warm)'; }}
                        onMouseLeave={e => { if (!isPicked) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: avatarUrl ? 'transparent' : getAvatarColor(fullName),
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : getInitials(fullName)}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Top Row: Name (left) & Role Tag (top right) */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontWeight: isPicked ? 700 : 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {fullName}
                            </div>
                            <span style={{ flexShrink: 0 }}>
                              <Badge variant={ROLE_BADGE_VARIANT[emp.role]} size="sm">
                                {roleLabel}
                              </Badge>
                            </span>
                          </div>
                          {/* Bottom Row: Email (left) & Company Name (right) */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {emp.email}
                            </div>
                            {emp.companyName ? (
                              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                                {emp.companyName}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {isPicked && <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 800 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {pickedId && (
                <div style={{
                  padding: '7px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-light)', border: '1px solid var(--accent)',
                  fontSize: 12, fontWeight: 700, color: 'var(--accent)',
                }}>
                  ✓ {pickedName}
                </div>
              )}
            </div>
          ) : (
            /* Fixed recipient */
            <div style={{
              padding: '8px 12px', borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-warm)', border: '1px solid var(--border)',
              fontSize: '13px', color: 'var(--text-primary)',
            }}>
              {effectiveRecipientName}
            </div>
          )}
        </div>

        {/* Subject */}
        <div>
          <label style={LABEL_STYLE}>{t('messages.subjectOptional')}</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            disabled={saving}
            placeholder={t('messages.subjectPlaceholder')}
            style={{
              width: '100%', padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontSize: '13px', fontFamily: 'var(--font-body)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Body */}
        <div>
          <label style={LABEL_STYLE}>{t('messages.body')}</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            disabled={saving}
            placeholder={t('messages.bodyPlaceholder')}
            rows={5}
            style={{
              width: '100%', padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontSize: '13px', fontFamily: 'var(--font-body)',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Attachment & Platform Reference Previews */}
        {(uploadedFilename || selectedRef) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {uploadedFilename && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 8,
                background: 'var(--surface-warm)', border: '1px solid var(--border)',
                fontSize: 12, color: 'var(--text-primary)',
              }}>
                <ImageIcon size={14} color="var(--accent)" />
                <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {uploadedFilename}
                </span>
                <button
                  type="button"
                  onClick={() => setUploadedFilename(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {selectedRef && (
              <div style={{ maxWidth: 260, minWidth: 0 }}>
                <ReferenceChip
                  reference={selectedRef}
                  variant="draft"
                  onRemove={() => setSelectedRef(null)}
                  removeDisabled={saving}
                />
              </div>
            )}
          </div>
        )}

        {/* Modal Toolbar: File Input + Plus Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx"
            style={{ display: 'none' }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile || saving}
            title={t('messages.attachFile', 'Attach File or Image')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {uploadingFile ? <Spinner size="sm" /> : <Paperclip size={14} />}
            <span>{t('messages.attach', 'Attach')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRefPicker(true)}
            disabled={saving}
            title={t('messages.attachReference', 'Reference Task/Doc/Shift')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--accent)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <Plus size={14} />
            <span>{t('messages.reference', 'Reference')}</span>
          </button>
        </div>
      </div>

      {showRefPicker && (
        <PlatformReferencePicker
          onSelect={(ref) => setSelectedRef(ref)}
          onClose={() => setShowRefPicker(false)}
        />
      )}
    </Modal>
  );
}
