import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import Modal from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { getCompanyLogoUrl } from "../../api/client";

interface RoleEditModalProps {
  open: boolean;
  onClose: () => void;
  eventKey: string;
  eventTitle: string;
  eventDescription: string;
  currentRoles: string[];
  currentPriority?: string;
  onSave: (roles: string[], priority: string) => Promise<void>;
  companyName?: string;
  companyLogoFilename?: string | null;
  companyOwnerName?: string | null;
  companyOwnerSurname?: string | null;
}

const AVAILABLE_ROLES = [
  { value: "admin", label: "Admin", color: "#C9973A" },
  { value: "hr", label: "HR", color: "#0284C7" },
  { value: "area_manager", label: "Area Manager", color: "#15803D" },
  { value: "store_manager", label: "Store Manager", color: "#7C3AED" },
  { value: "employee", label: "Employee", color: "#64748B" },
];

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent", color: "#DC2626" },
  { value: "high", label: "High", color: "#EA580C" },
  { value: "medium", label: "Medium", color: "#C9973A" },
  { value: "low", label: "Low", color: "#64748B" },
];

export default function RoleEditModal({
  open,
  onClose,
  eventKey,
  eventTitle,
  eventDescription,
  currentRoles,
  currentPriority = "medium",
  onSave,
  companyName,
  companyLogoFilename,
  companyOwnerName,
  companyOwnerSurname,
}: RoleEditModalProps) {
  const { t } = useTranslation();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedPriority, setSelectedPriority] = useState<string>("medium");
  const [saving, setSaving] = useState(false);

  // Initialize state when modal opens or currentRoles change
  useEffect(() => {
    if (open) {
      setSelectedRoles(currentRoles);
      setSelectedPriority(currentPriority);
    }
  }, [open, currentRoles, currentPriority]);

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selectedRoles, selectedPriority);
      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("notifications.editRoles", "Edit notification settings")}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || selectedRoles.length === 0}
          >
            {saving
              ? t("common.saving", "Saving...")
              : t("notifications.saveRoles", "Save settings")}
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 20 }}>
        {/* Company Info Section */}
        {companyName && (
          <div style={{
            padding: '12px',
            background: 'var(--surface-warm)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              background: 'rgba(13,33,55,0.08)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {getCompanyLogoUrl(companyLogoFilename) ? (
                <img
                  src={getCompanyLogoUrl(companyLogoFilename) ?? ''}
                  alt={companyName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>
                  {companyName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {companyName}
              </span>
              {(companyOwnerName || companyOwnerSurname) && (
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                  {companyOwnerName}{companyOwnerSurname ? ` ${companyOwnerSurname}` : ''}
                </span>
              )}
            </span>
          </div>
        )}
        
        {/* Notification Info Section */}
        <div
          style={{
            padding: "12px",
            background: "var(--surface-warm)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <h3
            style={{
              margin: "0 0 4px 0",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {eventTitle}
          </h3>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            {eventDescription}
          </p>
        </div>

        {/* Roles Section */}
        <div>
          <h3
            style={{
              margin: "0 0 8px 0",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {t("notifications.recipientRoles", "Recipient roles")}
          </h3>
          <p
            style={{
              margin: "0 0 12px 0",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            {t(
              "notifications.selectRoles",
              "Select which roles should receive this notification type",
            )}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {AVAILABLE_ROLES.map((role) => {
              const isSelected = selectedRoles.includes(role.value);
              return (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => toggleRole(role.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    border: `2px solid ${isSelected ? role.color : "var(--border)"}`,
                    borderRadius: 8,
                    background: isSelected
                      ? `${role.color}10`
                      : "var(--surface)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? role.color : "var(--text-primary)",
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: `2px solid ${isSelected ? role.color : "var(--border)"}`,
                      background: isSelected ? role.color : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s ease",
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && (
                      <Check size={12} color="#fff" strokeWidth={3} />
                    )}
                  </div>
                  <span>
                    {t(`roles.${role.value}`, role.label)}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedRoles.length === 0 && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "rgba(220,38,38,0.1)",
                border: "1px solid rgba(220,38,38,0.3)",
                borderRadius: 6,
                fontSize: 12,
                color: "#DC2626",
              }}
            >
              {t(
                "notifications.selectAtLeastOneRole",
                "Please select at least one role",
              )}
            </div>
          )}
        </div>

        {/* Priority Section */}
        <div>
          <h3
            style={{
              margin: "0 0 8px 0",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {t("notifications.priority", "Priority")}
          </h3>
          <p
            style={{
              margin: "0 0 12px 0",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            {t(
              "notifications.selectPriority",
              "Set the default priority for this notification type",
            )}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PRIORITY_OPTIONS.map((priority) => {
              const isSelected = selectedPriority === priority.value;
              return (
                <button
                  key={priority.value}
                  type="button"
                  onClick={() => setSelectedPriority(priority.value)}
                  style={{
                    padding: "10px 16px",
                    border: `2px solid ${isSelected ? priority.color : "var(--border)"}`,
                    borderRadius: 8,
                    background: isSelected
                      ? `${priority.color}10`
                      : "var(--surface)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? priority.color : "var(--text-primary)",
                  }}
                >
                  {t(
                    `notifications.priority_${priority.value}`,
                    priority.label,
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
