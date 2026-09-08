import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckSquare } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  getMyDocuments,
  getEmployeeDocuments,
  getDocumentsGeneric,
  getDeletedDocuments,
  permanentlyDeleteDocument,
  getCategories,
  EmployeeDocument,
  DocumentCategory
} from '../../../api/documents';
import { getCompanies } from '../../../api/companies';
import { Company } from '../../../types';
import { DocumentsTable } from './DocumentsTable';
import { UploadModal, CategoriesModal, EditDocumentModal } from './Modals';
import { IconUpload, IconTrash, IconTag, IconSearch, getCompanyAvatarColor } from './DocUtils';
import { UnifiedUploadWizard } from '../UnifiedUploadModal';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import CustomSelect, { SelectOption } from '../../../components/ui/CustomSelect';
import { getCompanyLogoUrl, getAvatarUrl } from '../../../api/client';

interface DocumentManagerProps {
  employeeId?: number;
  employeeName?: string;
  isTrashEnabled?: boolean;
  showPageHeader?: boolean;
}

export const DocumentManager: React.FC<DocumentManagerProps> = ({
  employeeId,
  employeeName,
  isTrashEnabled = true,
  showPageHeader = false
}) => {
  const { t } = useTranslation();
  const { user, permissions, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();

  const [myDocs, setMyDocs] = useState<EmployeeDocument[]>([]);
  const [teamDocs, setTeamDocs] = useState<EmployeeDocument[]>([]);
  const [trashDocs, setTrashDocs] = useState<EmployeeDocument[]>([]);
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'active' | 'trash'>('active');
  const [searchParams] = useSearchParams();
  const searchParamVal = searchParams.get('search') || '';
  const [search, setSearch] = useState(searchParamVal);
  const [activeTab, setActiveTab] = useState<'my' | 'team'>('team');
  const [selectionMode, setSelectionMode] = useState(false);

  useEffect(() => {
    setSelectionMode(false);
  }, [view, activeTab]);

  useEffect(() => {
    if (searchParamVal) {
      setSearch(searchParamVal);
    }
  }, [searchParamVal]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [editDoc, setEditDoc] = useState<any | null>(null);

  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const canManage = ['admin', 'hr'].includes(user?.role || '') || isSuperAdmin;
  const isEmployee = user?.role === 'employee';
  const isStoreManager = user?.role === 'store_manager';

  const canAccessTeamDocs = !isEmployee && !isStoreManager && (
    canManage || permissions?.team_documents === true
  );

  const showTeamTab = canAccessTeamDocs && !employeeId;

  const activeDocs = showTeamTab
    ? (activeTab === 'my' ? myDocs : teamDocs)
    : myDocs;

  const docs = view === 'trash' ? trashDocs : activeDocs;

  useEffect(() => {
    if (!canAccessTeamDocs && activeTab === 'team') {
      setActiveTab('my');
    }
  }, [canAccessTeamDocs, activeTab]);

  const tRef = React.useRef(t);
  tRef.current = t;
  const showToastRef = React.useRef(showToast);
  showToastRef.current = showToast;

  const load = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      const [allCats, allComps] = await Promise.all([
        getCategories(),
        (isEmployee || isStoreManager) ? Promise.resolve([]) : getCompanies()
      ]);
      setCategories(allCats);
      setCompanies(allComps);

      if (isStoreManager && user?.companyId) {
        setSelectedCompanyId(user.companyId);
      }

      let fetchedMy: EmployeeDocument[] = [];
      let fetchedTeam: EmployeeDocument[] = [];
      let fetchedTrash: EmployeeDocument[] = [];

      const hasTeamPerm = !isStoreManager && (canManage || permissions?.team_documents === true);

      if (employeeId) {
        const [my, trash] = await Promise.all([
          getEmployeeDocuments(employeeId),
          getDeletedDocuments(employeeId)
        ]);
        fetchedMy = my;
        fetchedTrash = trash;
      } else if (isEmployee) {
        const [my, trash] = await Promise.all([
          getMyDocuments(),
          getDeletedDocuments(undefined, 'my')
        ]);
        fetchedMy = my;
        fetchedTrash = trash;
      } else {
        if (hasTeamPerm) {
          const [my, team, trashMy, trashTeam] = await Promise.all([
            getDocumentsGeneric('my'),
            getDocumentsGeneric('team'),
            getDeletedDocuments(undefined, 'my'),
            getDeletedDocuments(undefined, 'team')
          ]);
          fetchedMy = my;
          fetchedTeam = team;
          fetchedTrash = Array.from(new Map([...trashMy, ...trashTeam].map(d => [d.id, d])).values());
        } else {
          const [my, trash] = await Promise.all([
            getDocumentsGeneric('my'),
            getDeletedDocuments(undefined, 'my')
          ]);
          fetchedMy = my;
          fetchedTrash = trash;
        }
      }

      setMyDocs(fetchedMy);
      setTeamDocs(fetchedTeam);
      setTrashDocs(fetchedTrash);
    } catch (err) {
      console.error('Error loading documents:', err);
      showToastRef.current(tRef.current('documents.errorLoad'), 'error');
    } finally {
      setLoading(false);
    }
  }, [
    employeeId,
    isEmployee,
    isStoreManager,
    canManage,
    user?.companyId,
    permissions?.team_documents,
    authLoading
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const getCompanyFileCount = useCallback((compId: number) => {
    const allDocs = [...myDocs, ...teamDocs];
    const uniqueDocs = Array.from(new Map(allDocs.map(d => [d.id, d])).values());
    return uniqueDocs.filter(d => Number(d.companyId) === compId).length;
  }, [myDocs, teamDocs]);

  const selectedCompany = useMemo(() => {
    if (!selectedCompanyId) return null;
    return companies.find(c => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  const companyOptions = useMemo<SelectOption[]>(() => {
    const allOption: SelectOption = {
      value: '',
      label: t('companies.allCompanies', 'All Companies'),
      render: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'rgba(0, 45, 91, 0.08)', color: '#002D5B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 12, flexShrink: 0
          }}>
            🏢
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
              {t('companies.allCompanies', 'All Companies')}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,45,91,0.06)', color: 'var(--primary)', flexShrink: 0 }}>
              {docs.length} {t('documents.filesLabel', 'Files')}
            </span>
          </div>
        </div>
      )
    };

    const companyList = companies.map(company => {
      const fileCount = getCompanyFileCount(company.id);
      const logoUrl = company.logoFilename ? getCompanyLogoUrl(company.logoFilename) : null;
      const initials = (company.name || '').slice(0, 2).toUpperCase();
      const badgeColor = getCompanyAvatarColor(company.name);

      return {
        value: String(company.id),
        label: company.name,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
            {logoUrl ? (
              <img src={logoUrl} alt={company.name} style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 26, height: 26, borderRadius: 6,
                background: badgeColor, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 10, flexShrink: 0
              }}>
                {initials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,45,91,0.06)', color: 'var(--primary)', flexShrink: 0 }}>
                {fileCount} {t('documents.filesLabel', 'Files')}
              </span>
            </div>
          </div>
        )
      };
    });

    return [allOption, ...companyList];
  }, [companies, docs.length, t, getCompanyFileCount]);

  const categoryOptions = useMemo<SelectOption[]>(() => {
    const allCat: SelectOption = {
      value: '',
      label: t('documents.allCategories', 'All Categories')
    };

    const filteredCats = selectedCompanyId !== null
      ? categories.filter(c => c.companyId === selectedCompanyId)
      : categories;

    const catList = filteredCats.map(cat => ({
      value: String(cat.id),
      label: cat.name
    }));

    return [allCat, ...catList];
  }, [categories, selectedCompanyId, t]);

  useEffect(() => {
    if (selectedCategoryId !== null && selectedCompanyId !== null) {
      const exists = categories.some(c => c.id === selectedCategoryId && c.companyId === selectedCompanyId);
      if (!exists) {
        setSelectedCategoryId(null);
      }
    }
  }, [selectedCompanyId, selectedCategoryId, categories]);

  const filteredDocs = docs.filter(d => {
    if (selectedCompanyId !== null) {
      if (Number(d.companyId) !== selectedCompanyId) return false;
    }
    if (selectedCategoryId !== null) {
      if (d.categoryId !== selectedCategoryId) return false;
    }
    const term = search.toLowerCase();
    const name = (d.fileName || d.title || '').toLowerCase();
    const emp = `${d.employeeName || ''} ${d.employeeSurname || ''}`.toLowerCase();
    return name.includes(term) || emp.includes(term);
  });

  const getFilteredCount = (tabDocs: EmployeeDocument[]) => {
    return tabDocs.filter(d => {
      if (selectedCompanyId !== null) {
        if (Number(d.companyId) !== selectedCompanyId) return false;
      }
      if (selectedCategoryId !== null) {
        if (d.categoryId !== selectedCategoryId) return false;
      }
      if (search.trim()) {
        const term = search.toLowerCase();
        const name = (d.fileName || d.title || '').toLowerCase();
        const emp = `${d.employeeName || ''} ${d.employeeSurname || ''}`.toLowerCase();
        return name.includes(term) || emp.includes(term);
      }
      return true;
    }).length;
  };

  useEffect(() => {
    if (search.trim() && showTeamTab && activeTab === 'my') {
      const myCount = getFilteredCount(myDocs);
      const teamCount = getFilteredCount(teamDocs);
      if (myCount === 0 && teamCount > 0) {
        setActiveTab('team');
      }
    }
  }, [search, myDocs, teamDocs, showTeamTab, activeTab, selectedCompanyId, selectedCategoryId]);

  const getCompanyName = (compId: number | null) => {
    if (!compId) return t('companies.allCompanies', 'All Companies');
    return companies.find(c => c.id === compId)?.name || `Company ${compId}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Page Header Alignment ────────────────────────────────────────────── */}
      {showPageHeader && (
        <div style={{
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
          gap: 12,
          flexWrap: 'wrap'
        }}>
          <div>
            <h1 style={{
              fontSize: isMobile ? '20px' : '22px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
              margin: '0 0 3px',
              letterSpacing: '-0.02em'
            }}>
              {t('documents.title')}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {t('documents.subtitle')}
            </p>
          </div>

          <div style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            width: isMobile ? '100%' : 'auto',
            justifyContent: isMobile ? 'flex-start' : 'flex-end'
          }}>
            {!isEmployee && !isStoreManager && canManage && view === 'active' && (
              <>
                <button
                  onClick={() => setShowCategories(true)}
                  style={{
                    background: "var(--surface)",
                    color: "var(--primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "9px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    flexShrink: 0,
                    transition: "border-color 0.15s, box-shadow 0.15s"
                  }}>
                  <IconTag />
                  {t('documents.categories', 'Categories')}
                </button>

                <button
                  onClick={() => setShowUpload(true)}
                  style={{
                    background: "var(--primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius)",
                    padding: "9px 18px",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(13,33,55,0.18)"
                  }}>
                  <IconUpload />
                  {t('documents.uploadDoc', 'Upload Document')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Search & Filter Toolbar ────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 12,
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '10px 12px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
      }}>
        {/* Universal Search Input */}
        <div style={{ flex: 1, position: 'relative', minWidth: isMobile ? '100%' : 220 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none', display: 'flex', alignItems: 'center'
          }}>
            <IconSearch />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('documents.searchPlaceholder', 'Search documents by file name or employee...')}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: 'var(--radius, 8px)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
              transition: 'border-color 0.15s'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Company Dropdown Option on Right */}
        {(!isEmployee && !isStoreManager && companies.length > 0) && (
          <div style={{ width: isMobile ? '100%' : 340, flexShrink: 0 }}>
            <CustomSelect
              value={selectedCompanyId !== null ? String(selectedCompanyId) : ''}
              onChange={(val) => setSelectedCompanyId(val ? Number(val) : null)}
              options={companyOptions}
              placeholder={t('companies.allCompanies', 'All Companies')}
              isClearable={true}
              searchable={true}
              controlMinHeight={38}
            />
          </div>
        )}
      </div>

      {/* ── Main Document Container ─────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg, 14px)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        
        {/* ── Section Header (Tabs & Filters) ────────────────────────────────── */}
        <div style={{
          padding: isMobile ? '12px 14px' : '14px 20px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: 12,
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)'
        }}>
          {/* Integrated Tabs (Team Documents FIRST, My Documents SECOND, Archived/Trash THIRD) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex',
              gap: 4,
              background: 'rgba(0,0,0,0.03)',
              padding: 4,
              borderRadius: 10,
              border: '1px solid var(--border)'
            }}>
              {showTeamTab && (
                <button
                  id="tab-team-documents"
                  onClick={() => { setView('active'); setActiveTab('team'); }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 7,
                    border: 'none',
                    background: (view === 'active' && activeTab === 'team') ? 'var(--surface)' : 'transparent',
                    color: (view === 'active' && activeTab === 'team') ? 'var(--primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    boxShadow: (view === 'active' && activeTab === 'team') ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                  {t('documents.teamDocuments', 'Team Documents')}
                  <span style={{
                    background: (view === 'active' && activeTab === 'team') ? 'var(--primary)' : 'rgba(0,0,0,0.06)',
                    color: (view === 'active' && activeTab === 'team') ? '#fff' : 'var(--text-muted)',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 700
                  }}>
                    {getFilteredCount(teamDocs)}
                  </span>
                </button>
              )}

              <button
                id="tab-my-documents"
                onClick={() => { setView('active'); setActiveTab('my'); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 7,
                  border: 'none',
                  background: (view === 'active' && activeTab === 'my') ? 'var(--surface)' : 'transparent',
                  color: (view === 'active' && activeTab === 'my') ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: (view === 'active' && activeTab === 'my') ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                {t('documents.myDocuments', 'My Documents')}
                <span style={{
                  background: (view === 'active' && activeTab === 'my') ? 'var(--primary)' : 'rgba(0,0,0,0.06)',
                  color: (view === 'active' && activeTab === 'my') ? '#fff' : 'var(--text-muted)',
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700
                }}>
                  {getFilteredCount(myDocs)}
                </span>
              </button>

              {isTrashEnabled && canManage && (
                <button
                  onClick={() => setView('trash')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 7,
                    border: 'none',
                    background: view === 'trash' ? 'var(--surface)' : 'transparent',
                    color: view === 'trash' ? 'var(--primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    boxShadow: view === 'trash' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                  <IconTrash />
                  {t('documents.archivedTrash', 'Archived / Trash')}
                  <span style={{
                    background: view === 'trash' ? 'var(--primary)' : 'rgba(0,0,0,0.06)',
                    color: view === 'trash' ? '#fff' : 'var(--text-muted)',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontSize: 11,
                    fontWeight: 700
                  }}>
                    {getFilteredCount(trashDocs)}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Right Side Controls: Select Multiple, Empty Trash, Admin Pill & Category Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
            {canManage && (
              <button
                onClick={() => setSelectionMode(!selectionMode)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: selectionMode ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: selectionMode ? 'rgba(2,132,199,0.08)' : 'var(--surface)',
                  color: selectionMode ? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'all 0.15s'
                }}
              >
                <CheckSquare size={14} />
                {selectionMode ? t('documents.cancelSelection', 'Cancel selection') : t('documents.selectMultiple', 'Select multiple')}
              </button>
            )}

            {view === 'trash' && canManage && (
              <button
                onClick={() => setShowEmptyTrashModal(true)}
                disabled={trashDocs.length === 0}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(220,38,38,0.3)',
                  background: 'rgba(220,38,38,0.06)',
                  color: '#DC2626',
                  cursor: trashDocs.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: trashDocs.length === 0 ? 0.5 : 1,
                  fontSize: 12,
                  fontWeight: 700,
                  transition: 'all 0.15s'
                }}
              >
                <IconTrash />
                {t('documents.emptyTrash', 'Svuota Cestino')}
              </button>
            )}

            {selectedCompany?.ownerName && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 12px', borderRadius: 20,
                background: 'rgba(0, 45, 91, 0.05)',
                border: '1px solid rgba(0, 45, 91, 0.12)'
              }}>
                {selectedCompany.ownerAvatarFilename ? (
                  <img src={getAvatarUrl(selectedCompany.ownerAvatarFilename) || ''} alt="Admin" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedCompany.ownerName[0].toUpperCase()}
                  </div>
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                  Admin: {selectedCompany.ownerName} {selectedCompany.ownerSurname || ''}
                </span>
              </div>
            )}

            {categories.length > 0 && (
              <div style={{ width: isMobile ? '100%' : 190 }}>
                <CustomSelect
                  value={selectedCategoryId !== null ? String(selectedCategoryId) : ''}
                  onChange={(val) => setSelectedCategoryId(val ? Number(val) : null)}
                  options={categoryOptions}
                  placeholder={t('documents.allCategories', 'All Categories')}
                  isClearable={true}
                  searchable={false}
                  controlMinHeight={36}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Table Area (Padded & Rounded) ──────────────────────────────────── */}
        <div style={{ padding: '16px' }}>
          <div style={{
            borderRadius: '10px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            background: 'var(--surface)'
          }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }}>{t('common.loading')}</div>
            ) : filteredDocs.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500, fontSize: 13 }}>
                {isEmployee ? t('documents.noDocsEmployee', 'No documents available') :
                  isStoreManager ? t('documents.noDocsStoreSM', 'No documents available for you') :
                    t('documents.noDocs', 'No documents found')}
              </div>
            ) : (
              <DocumentsTable
                docs={filteredDocs}
                categories={categories}
                onRefresh={load}
                onEditDoc={setEditDoc}
                isTrash={view === 'trash'}
                selectionMode={selectionMode}
                setSelectionMode={setSelectionMode}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showUpload && (
        <UnifiedUploadWizard
          targetEmployeeId={employeeId}
          targetEmployeeName={employeeName}
          onClose={() => setShowUpload(false)}
          onSuccess={load}
        />
      )}
      {showCategories && <CategoriesModal onClose={() => setShowCategories(false)} />}
      {editDoc && <EditDocumentModal doc={editDoc} onClose={() => setEditDoc(null)} onSuccess={load} />}

      {/* ── Svuota Cestino Confirmation Modal ───────────────────────────── */}
      {showEmptyTrashModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,33,55,0.48)', backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, width: 'min(440px, 92vw)', padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(220,38,38,0.1)', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconTrash />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{t('documents.emptyTrashConfirmTitle', 'Svuota Cestino')}</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{t('documents.emptyTrashWarning', 'Azione irreversibile')}</p>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
              {t('documents.emptyTrashPrompt', 'Sei sicuro di voler svuotare il cestino? Tutti i {{count}} documenti verranno eliminati permanentemente dal database.', { count: trashDocs.length })}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowEmptyTrashModal(false)} disabled={emptyingTrash} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {t('common.cancel', 'Annulla')}
              </button>
              <button
                onClick={async () => {
                  setEmptyingTrash(true);
                  try {
                    for (const doc of trashDocs) {
                      await permanentlyDeleteDocument(doc.id, (doc as any).sourceTable || (doc as any).source || 'employee_documents');
                    }
                    showToast(t('documents.trashEmptiedSuccess', 'Cestino svuotato con successo'), 'success');
                    setShowEmptyTrashModal(false);
                    load();
                  } catch {
                    showToast(t('documents.errorEmptyTrash', 'Errore durante lo svuotamento del cestino'), 'error');
                  } finally {
                    setEmptyingTrash(false);
                  }
                }}
                disabled={emptyingTrash}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: emptyingTrash ? 'not-allowed' : 'pointer' }}
              >
                {emptyingTrash ? t('common.loading', 'Eliminazione...') : t('documents.confirmEmptyTrash', 'Svuota Ora')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

