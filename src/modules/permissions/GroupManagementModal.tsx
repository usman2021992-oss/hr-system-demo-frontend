import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { translateApiError } from '../../utils/apiErrors';
import { createCompanyGroup, updateCompanyGroup, deleteCompanyGroup, CompanyGroup } from '../../api/companyGroups';

interface GroupManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: CompanyGroup[];
  onGroupsChanged: () => void;
}

export const GroupManagementModal: React.FC<GroupManagementModalProps> = ({
  isOpen,
  onClose,
  groups,
  onGroupsChanged,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const [deletingGroup, setDeletingGroup] = useState<CompanyGroup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      await createCompanyGroup({ name: newGroupName.trim() });
      showToast(t('permissions.groupVisibility.groupCreatedSuccess', { defaultValue: 'Group created successfully.' }), 'success');
      setNewGroupName('');
      onGroupsChanged();
    } catch (err) {
      showToast(translateApiError(err, t, t('common.error')) || t('common.error') || 'Error', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (group: CompanyGroup) => {
    setEditingGroupId(group.id);
    setEditingName(group.name);
  };

  const handleCancelEdit = () => {
    setEditingGroupId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (groupId: number) => {
    if (!editingName.trim()) {
      handleCancelEdit();
      return;
    }
    setSavingId(groupId);
    try {
      await updateCompanyGroup(groupId, { name: editingName.trim() });
      showToast(t('permissions.groupVisibility.groupUpdatedSuccess', { defaultValue: 'Group renamed successfully.' }), 'success');
      setEditingGroupId(null);
      onGroupsChanged();
    } catch (err) {
      showToast(translateApiError(err, t, t('common.error')) || t('common.error') || 'Error', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deletingGroup) return;
    setIsDeleting(true);
    try {
      await deleteCompanyGroup(deletingGroup.id);
      showToast(t('permissions.groupVisibility.groupDeletedSuccess', { defaultValue: 'Group deleted successfully.' }), 'success');
      setDeletingGroup(null);
      onGroupsChanged();
    } catch (err) {
      showToast(translateApiError(err, t, t('common.error')) || t('common.error') || 'Error', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Modal open={isOpen} onClose={onClose} title={t('permissions.groupVisibility.manageGroups', { defaultValue: 'Manage Groups' })}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0' }}>
          
          {/* Create New Group Section */}
          <div style={{
            padding: 16,
            background: 'var(--surface-warm)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              {t('permissions.groupVisibility.createNewGroup', { defaultValue: 'Create New Group' })}
            </h4>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Input
                  label={t('permissions.groupVisibility.newGroupOptionalLabel')}
                  placeholder={t('permissions.groupVisibility.newGroupPlaceholder')}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateGroup(); }}
                  disabled={creating}
                />
              </div>
              <Button loading={creating} disabled={!newGroupName.trim()} onClick={handleCreateGroup}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} />
                  {t('permissions.groupVisibility.createGroupButton')}
                </div>
              </Button>
            </div>
          </div>

          {/* Existing Groups List */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={14} />
              {t('permissions.groupVisibility.existingGroups', { defaultValue: 'Existing Groups' })}
            </h4>
            
            {groups.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                {t('common.noData')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groups.map((group) => {
                  const isEditing = editingGroupId === group.id;
                  const isSaving = savingId === group.id;

                  return (
                    <div
                      key={group.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface)',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      {/* Name / Input */}
                      <div style={{ flex: 1, marginRight: 16 }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveEdit(group.id);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                            autoFocus
                            disabled={isSaving}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              border: '1px solid var(--primary)',
                              borderRadius: 'var(--radius-sm)',
                              outline: 'none',
                              fontSize: 13,
                              color: 'var(--text-primary)',
                            }}
                          />
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {group.name}
                            </div>
                            {group.companies && group.companies.length > 0 ? (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                  {group.companies.length}
                                </span>{' '}
                                {group.companies.length === 1
                                  ? t('common.company', { defaultValue: 'company' })
                                  : t('common.companies', { defaultValue: 'companies' })}
                                : {group.companies.map((c) => c.name).join(', ')}
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {t('permissions.groupVisibility.noCompanies', { defaultValue: 'No companies attached' })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isEditing ? (
                          <>
                            <button
                              title={t('common.save')}
                              disabled={isSaving}
                              onClick={() => handleSaveEdit(group.id)}
                              style={{ padding: 6, color: 'var(--success)', background: 'transparent', border: 'none', cursor: 'pointer', opacity: isSaving ? 0.5 : 1 }}
                            >
                              <Check size={16} />
                            </button>
                            <button
                              title={t('common.cancel')}
                              disabled={isSaving}
                              onClick={handleCancelEdit}
                              style={{ padding: 6, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', opacity: isSaving ? 0.5 : 1 }}
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              title={t('common.edit')}
                              onClick={() => handleStartEdit(group)}
                              style={{ padding: 6, color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              title={t('common.delete')}
                              onClick={() => setDeletingGroup(group)}
                              style={{ padding: 6, color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deletingGroup}
        onCancel={() => setDeletingGroup(null)}
        onConfirm={handleDeleteGroup}
        title={t('permissions.groupVisibility.deleteGroupConfirmTitle', { defaultValue: 'Delete Group?' })}
        message={t('permissions.groupVisibility.deleteGroupConfirmMessage', {
          defaultValue: 'Are you sure you want to delete this group? The associated companies will become isolated, but their permissions and roles will not be deleted.',
        })}
        confirmLabel={t('common.delete')}
        variant="danger"
      />
    </>
  );
};
