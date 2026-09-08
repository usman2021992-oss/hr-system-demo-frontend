import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface AutomationRolesModalProps {
  open: boolean;
  onClose: () => void;
  companyName: string;
  automationTitle: string;
  automationDescription: string;
  currentRoles: string[];
  onSave: (roles: string[]) => Promise<void>;
}

const ROLE_OPTIONS = [
  { value: 'admin', color: '#C9973A' },
  { value: 'hr', color: '#0284C7' },
  { value: 'area_manager', color: '#15803D' },
  { value: 'store_manager', color: '#7C3AED' },
  { value: 'employee', color: '#64748B' },
];

export default function AutomationRolesModal({
  open,
  onClose,
  companyName,
  automationTitle,
  automationDescription,
  currentRoles,
  onSave,
}: AutomationRolesModalProps) {
  const { t } = useTranslation();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedRoles(currentRoles);
    }
  }, [open, currentRoles]);

  const toggleRole = async (role: string) => {
    if (saving) {
      return;
    }

    const nextRoles = selectedRoles.includes(role)
      ? selectedRoles.filter((item) => item !== role)
      : [...selectedRoles, role];

    setSelectedRoles(nextRoles);
    setSaving(true);
    try {
      await onSave(nextRoles);
    } catch {
      setSelectedRoles(currentRoles);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('notifications.editRoles', 'Edit roles')}
      maxWidth="900px"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {saving ? t('common.saving', 'Saving...') : t('common.close', 'Close')}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 20 }}>
        <div
          style={{
            padding: '12px',
            background: 'var(--surface-warm)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'rgba(13,33,55,0.08)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
              color: 'var(--primary)',
              flexShrink: 0,
            }}
          >
            {companyName.slice(0, 2).toUpperCase()}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{companyName}</span>
        </div>

        <div
          style={{
            padding: '12px',
            background: 'var(--surface-warm)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
        >
          <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {automationTitle}
          </h3>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{automationDescription}</p>
        </div>

        <div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('notifications.recipientRoles', 'Recipient roles')}
          </h3>
          <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {t('notifications.selectRoles', 'Select which roles should receive this notification type')}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ROLE_OPTIONS.map((role) => {
              const isSelected = selectedRoles.includes(role.value);
              return (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => void toggleRole(role.value)}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    border: `2px solid ${isSelected ? role.color : 'var(--border)'}`,
                    borderRadius: 8,
                    background: isSelected ? `${role.color}10` : 'var(--surface)',
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: saving ? 0.75 : 1,
                    transition: 'all 0.2s ease',
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? role.color : 'var(--text-primary)',
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: `2px solid ${isSelected ? role.color : 'var(--border)'}`,
                      background: isSelected ? role.color : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
                  </div>
                  <span>{t(`roles.${role.value}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
