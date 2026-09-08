import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadDocument,
  updateDocumentGeneric,
  DocumentCategory
} from '../../../api/documents';
import { getEmployees } from '../../../api/employees';
import { getCompanies } from '../../../api/companies';
import { Employee, Company } from '../../../types';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { DatePicker } from '../../../components/ui/DatePicker';
import CustomSelect, { SelectOption } from '../../../components/ui/CustomSelect';
import { ModalBackdrop, ModalHeader, inputStyle, labelStyle, IconTag, IconPen, IconTrash } from './DocUtils';
import { getAvatarUrl } from '../../../api/client';
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { translateApiError } from '../../../utils/apiErrors';
import {
  GradientModalHeader,
  IconButton,
  buildCompanyOptions,
  buildEmployeeOptions,
  splitCategoryName,
  joinCategoryName,
  CATEGORY_ICON_CHOICES,
  FileTypeIcon,
  PersonAvatar,
  RoleTag,
} from './DocumentUiKit';

// ── Upload Document Modal ──────────────────────────────────────────────────

// ── Upload Document Modal ──────────────────────────────────────────────────

export const UploadModal: React.FC<{
  employeeId: number;
  employeeName: string;
  onClose: () => void;
  onSuccess: () => void
}> = ({ employeeId, employeeName, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(employeeId, file, { requiresSignature, expiresAt: expiresAt || null });
      showToast(t('documents.uploaded'), 'success');
      onSuccess(); onClose();
    } catch { showToast(t('documents.errorUpload'), 'error'); }
    finally { setUploading(false); }
  };

  return (
    <ModalBackdrop onClose={onClose} width={440}>
      <ModalHeader title={t('documents.uploadTitle')} onClose={onClose} />
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 14px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)', fontWeight: 600 }}>
            👤 {employeeName}
          </div>
          <div>
            <label style={labelStyle}>{t('documents.selectFile')}</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, color: 'var(--text-primary)', width: '100%' }} />
          </div>
          <div>
            <label style={labelStyle}>{t('documents.expiresAtLabel')}</label>
            <DatePicker value={expiresAt} onChange={setExpiresAt} placement="top" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
            <input type="checkbox" checked={requiresSignature} onChange={(e) => setRequiresSignature(e.target.checked)} />
            {t('documents.requiresSignatureLabel')}
          </label>
        </div>

        {/* Modal Footer Bar */}
        <div style={{
          padding: '12px 20px',
          background: 'var(--background)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          flexShrink: 0
        }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={uploading || !file} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: uploading || !file ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: uploading || !file ? 0.6 : 1, boxShadow: '0 2px 8px rgba(13,33,55,0.18)' }}>
            {uploading ? t('documents.uploading') : t('documents.uploadDoc')}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
};

// ── Categories Modal ───────────────────────────────────────────────────────

export const CategoriesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { allowedCompanyIds } = useAuth();

  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🏷️');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<DocumentCategory | null>(null);
  // Shown inline rather than as a toast: a naming conflict needs to stay on
  // screen next to the field the operator has to change.
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [allCats, allComps] = await Promise.all([
        getCategories(true),
        getCompanies(),
      ]);

      setCategories(allCats);
      const filteredComps = allComps.filter(c => allowedCompanyIds.includes(c.id));
      setCompanies(filteredComps);

      if (filteredComps.length === 1 && !selectedCompanyId) {
        setSelectedCompanyId(filteredComps[0].id);
      }
    }
    catch { showToast(t('documents.errorLoad'), 'error'); }
    finally { if (showLoader) setLoading(false); }
  }, [allowedCompanyIds, selectedCompanyId, t, showToast]);

  useEffect(() => { load(true); }, []);

  const companyOptions = useMemo<SelectOption[]>(
    () => buildCompanyOptions(companies, { ownerLabel: t('companies.owner', 'Owner') }),
    [companies, t],
  );

  const selectedCompany = companies.find(c => c.id === selectedCompanyId) ?? null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newName.trim() || !selectedCompanyId) return;
    setSaving(true);
    try {
      await createCategory(joinCategoryName(newIcon, newName), selectedCompanyId);
      setNewName('');
      setNewIcon('🏷️');
      showToast(t('documents.categoryCreated'), 'success');
      await load(false);
    }
    catch (err) {
      // Surface what the server actually said - "this name is already taken"
      // is something the operator can act on; "Error" is not.
      setFormError(translateApiError(err, t) ?? t('common.error'));
    }
    finally { setSaving(false); }
  };

  const handleRename = async (cat: DocumentCategory) => {
    const current = splitCategoryName(cat.name);
    if (!editName.trim() || editName.trim() === current.name) { setEditId(null); return; }
    try {
      const nextName = joinCategoryName(current.icon, editName);
      await updateCategory(cat.id, { name: nextName, companyId: cat.companyId, currentCompanyId: cat.companyId });
      showToast(t('documents.categoryUpdated'), 'success');
      setEditId(null);
      await load(false);
    }
    catch (err) { showToast(translateApiError(err, t) ?? t('common.error'), 'error'); }
  };

  const handleToggle = async (cat: DocumentCategory) => {
    try {
      await updateCategory(cat.id, { isActive: !cat.isActive, companyId: cat.companyId, currentCompanyId: cat.companyId });
      showToast(t('documents.categoryUpdated'), 'success');
      await load(false);
    }
    catch (err) { showToast(translateApiError(err, t) ?? t('common.error'), 'error'); }
  };

  const handleDelete = (cat: DocumentCategory) => {
    setCategoryToDelete(cat);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await deleteCategory(categoryToDelete.id, categoryToDelete.companyId);
      showToast(t('documents.categoryDeleted'), 'success');
      await load(false);
    } catch (error) {
      showToast(translateApiError(error, t) ?? t('common.error'), 'error');
    }
    finally {
      setCategoryToDelete(null);
    }
  };

  const filteredCategories = categories.filter(c => {
    if (showInactive ? c.isActive : !c.isActive) return false;
    if (selectedCompanyId !== null) {
      if (c.companyId !== selectedCompanyId) return false;
    }
    return true;
  });

  const canSubmit = !saving && !!newName.trim() && !!selectedCompanyId;

  return (
    <>
      <ModalBackdrop onClose={onClose} width={640}>
        <GradientModalHeader
          title={t('documents.categoriesTitle')}
          subtitle={selectedCompany ? selectedCompany.name : t('documents.selectCompanyFirst', 'Choose a company to manage its categories')}
          icon={<span>🗂️</span>}
          onClose={onClose}
        />

        <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Company first: a category always belongs to one company, so
              choosing it up front is what makes the list below meaningful. */}
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={labelStyle}>{t('documents.companyLabel')}</label>
              <CustomSelect
                options={companyOptions}
                value={selectedCompanyId ? String(selectedCompanyId) : ''}
                onChange={(val) => { setSelectedCompanyId(val ? Number(val) : null); setFormError(null); }}
                placeholder={t('documents.selectCompany')}
                isClearable={false}
                showCheck={false}
                highlightSelected
              />
            </div>

            <div>
              <label style={labelStyle}>{t('documents.categoryName')}</label>
              {/* Icon picker inside the field on the left, create button on the
                  right - one row instead of three stacked controls. */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div
                  style={{
                    position: 'relative', flex: 1, display: 'flex', alignItems: 'center',
                    border: `1px solid ${formError ? '#DC2626' : 'var(--border)'}`,
                    borderRadius: 8, background: 'var(--background)',
                    opacity: selectedCompanyId ? 1 : 0.6,
                  }}
                >
                  <button
                    type="button"
                    disabled={!selectedCompanyId}
                    onClick={() => setIconPickerOpen(o => !o)}
                    title={t('documents.chooseIcon', 'Choose an icon')}
                    style={{
                      width: 38, height: 38, flexShrink: 0, border: 'none', background: 'transparent',
                      cursor: selectedCompanyId ? 'pointer' : 'not-allowed', fontSize: 17,
                      borderRight: '1px solid var(--border)', borderTopLeftRadius: 8, borderBottomLeftRadius: 8,
                    }}
                  >
                    {newIcon}
                  </button>
                  <input
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setFormError(null); }}
                    placeholder={t('documents.categoryNamePlaceholder')}
                    disabled={!selectedCompanyId}
                    style={{
                      flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                      padding: '9px 12px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit',
                    }}
                  />

                  {iconPickerOpen && (
                    <div
                      style={{
                        position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 5000,
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                        boxShadow: 'var(--shadow-lg)', padding: 8,
                        display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4, width: 260,
                      }}
                    >
                      {CATEGORY_ICON_CHOICES.map(icon => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => { setNewIcon(icon); setIconPickerOpen(false); }}
                          style={{
                            width: 28, height: 28, borderRadius: 6, fontSize: 15, cursor: 'pointer',
                            border: icon === newIcon ? '1px solid var(--primary)' : '1px solid transparent',
                            background: icon === newIcon ? 'rgba(2,132,199,0.1)' : 'transparent',
                          }}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    flexShrink: 0, padding: '0 16px', borderRadius: 8, border: 'none',
                    background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5,
                    boxShadow: canSubmit ? '0 2px 8px rgba(13,33,55,0.18)' : 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {saving ? '…' : `+ ${t('documents.newCategory')}`}
                </button>
              </div>

              {formError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 8, padding: '8px 11px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#B91C1C',
                    display: 'flex', alignItems: 'flex-start', gap: 7,
                  }}
                >
                  <span aria-hidden style={{ flexShrink: 0 }}>⚠</span>
                  <span>{formError}</span>
                </div>
              )}
            </div>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              {t('documents.showInactive')}
            </label>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{filteredCategories.length} {t('documents.categoriesCount')}</span>
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{t('common.loading')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredCategories.map(cat => {
                  const parsed = splitCategoryName(cat.name);
                  const count = cat.documentCount ?? 0;
                  return (
                    <div
                      key={cat.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        opacity: cat.isActive ? 1 : 0.65,
                      }}
                    >
                      <span
                        style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0, fontSize: 17,
                          background: 'var(--background)', border: '1px solid var(--border)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-hidden
                      >
                        {parsed.icon}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editId === cat.id ? (
                          <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => handleRename(cat)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(cat); if (e.key === 'Escape') setEditId(null); }}
                            style={inputStyle}
                          />
                        ) : (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {parsed.name}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {companies.find(c => c.id === cat.companyId)?.name}
                              {!cat.isActive && ` · ${t('documents.inactive', 'Inactive')}`}
                            </div>
                          </>
                        )}
                      </div>

                      {/* What this category actually holds, so deactivating or
                          renaming is not a shot in the dark. */}
                      <span
                        title={t('documents.categoryDocCountTitle', 'Documents in this category')}
                        style={{
                          flexShrink: 0, display: 'inline-flex', alignItems: 'baseline', gap: 4,
                          fontSize: 11, padding: '3px 9px', borderRadius: 999,
                          background: count > 0 ? 'rgba(2,132,199,0.1)' : 'var(--background)',
                          color: count > 0 ? 'var(--primary)' : 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <strong style={{ fontWeight: 800 }}>{count}</strong>
                        <span style={{ fontWeight: 600 }}>{t('documents.documentsLabel', 'Documents')}</span>
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        <IconButton
                          title={t('common.edit')}
                          onClick={() => { setEditId(cat.id); setEditName(splitCategoryName(cat.name).name); }}
                        >
                          <Pencil size={15} />
                        </IconButton>
                        <IconButton
                          title={cat.isActive ? t('common.deactivate') : t('common.activate')}
                          onClick={() => handleToggle(cat)}
                          tone={cat.isActive ? 'muted' : 'success'}
                        >
                          {cat.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                        </IconButton>
                        <IconButton title={t('common.delete')} onClick={() => handleDelete(cat)} tone="danger">
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </div>
                  );
                })}
                {filteredCategories.length === 0 && (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    {selectedCompanyId
                      ? t('documents.noCategories', 'No categories found')
                      : t('documents.selectCompanyFirst', 'Choose a company to manage its categories')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ModalBackdrop>
      <ConfirmModal
        open={!!categoryToDelete}
        title={t('common.delete')}
        message={
          (categoryToDelete?.documentCount ?? 0) > 0
            ? t('documents.deleteCategoryWithDocs', 'This category still contains {{count}} document(s). They will keep the documents but lose the category. Continue?', { count: categoryToDelete?.documentCount ?? 0 })
            : t('documents.deleteCategoryConfirm')
        }
        onConfirm={confirmDelete}
        onCancel={() => setCategoryToDelete(null)}
        variant="danger"
      />
    </>
  );
};

// ── Edit Document Modal ────────────────────────────────────────────────────

export const EditDocumentModal: React.FC<{ doc: any; onClose: () => void; onSuccess: () => void }> = ({ doc, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);

  const fileName = doc.fileName || doc.title || '';
  const lastDot = fileName.lastIndexOf('.');
  const initialTitle = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  const extension = lastDot > 0 ? fileName.substring(lastDot) : '';

  const [title, setTitle] = useState(initialTitle);
  const [employeeId, setEmployeeId] = useState<number | null>(doc.employeeId || doc.employee_id || null);
  const getInitialExpiry = (val: any) => {
    if (!val) return '';
    try {
      const date = new Date(val);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };
  const [expiresAt, setExpiresAt] = useState<string>(() => getInitialExpiry(doc.expiresAt || doc.expires_at));
  const [category, setCategory] = useState<string>(doc.categoryName || doc.category || '');
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [saving, setSaving] = useState(false);

  // Categories of the document’s own company, so an operator can re-file it.
  const documentCompanyId: number | null = doc.companyId ?? doc.company_id ?? null;
  useEffect(() => {
    let cancelled = false;
    getCategories(false)
      .then(all => {
        if (cancelled) return;
        setCategories(documentCompanyId ? all.filter(c => c.companyId === documentCompanyId) : all);
      })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [documentCompanyId]);

  const categoryOptions = useMemo<SelectOption[]>(
    () => categories.map(cat => {
      const parsed = splitCategoryName(cat.name);
      return {
        value: cat.name,
        label: parsed.name,
        render: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden style={{ fontSize: 15 }}>{parsed.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{parsed.name}</span>
          </span>
        ),
      };
    }),
    [categories],
  );

  useEffect(() => {
    setLoadingEmps(true);
    getEmployees({ status: 'active', excludeAdmins: true, limit: 1000 })
      .then(res => setEmployees(res.employees))
      .catch(() => showToast(t('employees.errorLoad'), 'error'))
      .finally(() => setLoadingEmps(false));
  }, [t, showToast]);

  const employeeOptions = useMemo<SelectOption[]>(() => {
    const unassignedOption: SelectOption = {
      value: '',
      label: t('documents.unassigned', 'Unassigned'),
      render: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(201,151,58,0.15)', color: '#C9973A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 11, flexShrink: 0
          }}>
            ⚠
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#C9973A' }}>
              {t('documents.unassigned', 'Unassigned')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('documents.unassignedDesc', 'No employee assigned')}
            </div>
          </div>
        </div>
      )
    };

    const list = employees.map(emp => {
      const fullName = `${emp.name || ''} ${emp.surname || ''}`.trim();
      const avatarUrl = emp.avatarFilename ? getAvatarUrl(emp.avatarFilename) : null;
      const initials = `${(emp.name || '')[0] || ''}${(emp.surname || '')[0] || ''}`.toUpperCase() || 'U';

      return {
        value: String(emp.id),
        label: fullName,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 10, flexShrink: 0
              }}>
                {initials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</span>
                {emp.uniqueId && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--background)', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {emp.uniqueId}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {emp.role ? emp.role : ''}{emp.companyName ? ` · ${emp.companyName}` : ''}
              </div>
            </div>
          </div>
        )
      };
    });

    return [unassignedOption, ...list];
  }, [employees, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await updateDocumentGeneric(doc.id, {
        title: `${title}${extension}`,
        employee_id: employeeId,
        expires_at: expiresAt || null,
        category: category || null
      });
      showToast(t('documents.updated', 'Document updated'), 'success');
      onSuccess(); onClose();
    } catch (err) { showToast(translateApiError(err, t) ?? t('common.error'), 'error'); }
    finally { setSaving(false); }
  };

  return (
    <ModalBackdrop onClose={onClose} width={460}>
      <ModalHeader title={t('documents.editDocument', 'Edit Document')} onClose={onClose} />
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          <div>
            <label style={labelStyle}>{t('documents.fileName')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inputStyle, flex: 1 }} required />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', padding: '0 4px' }}>{extension}</span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>{t('documents.assigned')}</label>
            <CustomSelect
              value={employeeId ? String(employeeId) : ''}
              onChange={(val) => setEmployeeId(val ? Number(val) : null)}
              options={employeeOptions}
              placeholder={t('documents.selectEmployee', 'Select Employee...')}
              disabled={loadingEmps}
              isClearable={true}
              searchable={true}
              menuMaxHeight={240}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('documents.expiresAtLabel')}</label>
            <DatePicker value={expiresAt} onChange={setExpiresAt} placement="bottom" />
          </div>

          <div style={{ position: 'relative', zIndex: 5 }}>
            <label style={labelStyle}>{t('documents.category', 'Category')}</label>
            <CustomSelect
              value={category || null}
              onChange={(val) => setCategory(val ?? '')}
              options={categoryOptions}
              placeholder={categories.length === 0
                ? t('documents.noCategoriesForCompany', 'No categories for this company')
                : t('documents.selectCategory', 'Select a category')}
              disabled={categories.length === 0}
              isClearable
              showCheck={false}
              highlightSelected
            />
          </div>
        </div>

        {/* Modal Footer Bar */}
        <div style={{
          padding: '12px 20px',
          background: 'var(--background)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          flexShrink: 0
        }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t('common.cancel')}</button>
          <button type="submit" disabled={saving || !title.trim()} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: (saving || !title.trim()) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: (saving || !title.trim()) ? 0.6 : 1, boxShadow: '0 2px 8px rgba(13,33,55,0.18)' }}>{saving ? '...' : t('common.save')}</button>
        </div>
      </form>
    </ModalBackdrop>
  );
};

