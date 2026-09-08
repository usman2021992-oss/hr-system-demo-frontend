import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { uploadDocumentUnified, updateDocumentGeneric, deleteDocument, getDocumentPreviewUrlGeneric, previewDocumentMatches, cleanupDraftDocuments, MatchPreviewEntry } from '../../api/documents';
import { getEmployees } from '../../api/employees';
import { Employee, Company } from '../../types';
import { createPortal } from 'react-dom';
import { DatePicker } from '../../components/ui/DatePicker';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import { getCompanies } from '../../api/companies';
import { ModalBackdrop, ModalHeader } from './components/DocUtils';
import { CategoriesModal } from './components/Modals';
import { getAvatarUrl } from '../../api/client';
import { formatEmployeeName } from '../../utils/employeeName';
import { translateApiError } from '../../utils/apiErrors';
import { Trash2, Eye } from 'lucide-react';
import { getCategories, DocumentCategory } from '../../api/documents';
import {
  FileTypeIcon,
  formatStyleFor,
  formatFileSize,
  IconButton,
  PersonAvatar,
  CompanyAvatar,
  RoleTag,
  StatusTag,
  TagTone,
  buildCompanyOptions,
  buildEmployeeOptions,
  splitCategoryName,
} from './components/DocumentUiKit';

// ── Components & Icons ──

const IconUpload = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconFile = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" /><polyline points="13 2 13 9 20 9" />
  </svg>
);

const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);



/**
 * Turns a matcher reason code into something an HR operator can act on.
 * These are the explanations shown in the "needs attention" panel, so they
 * describe what to do rather than what the algorithm did.
 */
const describeMatchReason = (
  reason: MatchReason | undefined,
  suggestionCount: number,
  t: TFunction<'translation', undefined>,
): string => {
  switch (reason) {
    case 'duplicate_full_name':
      return t('documents.reasonDuplicateName', 'Multiple employees share this exact full name — manual selection required');
    case 'other_company':
      return t('documents.reasonOtherCompany', 'Employee matched but belongs to a different company');
    case 'surname_only':
      return t('documents.reasonSurnameOnly', 'Surname matched, but first name is missing or non-matching');
    case 'first_name_only':
      return t('documents.reasonFirstNameOnly', 'First name matched, but surname is missing or non-matching');
    case 'not_a_name':
      return t('documents.reasonNotAName', 'Filename contains no recognized person names or tokens');
    case 'no_candidate':
      return t('documents.reasonNoCandidate', 'No matching employee roster entry found for this filename');
    default:
      return suggestionCount > 0
        ? t('documents.reasonNeedsChoice', 'Partial match or multiple candidates — select from suggestions below')
        : t('documents.reasonNoCandidate', 'No matching employee roster entry found for this filename');
  }
};

/** Two-or-three way toggle used for signature / visibility choices. */
const SEGMENT_TONES = {
  neutral: { border: '#64748B', bg: 'rgba(100,116,139,0.1)', fg: '#475569' },
  success: { border: '#10B981', bg: 'rgba(16,185,129,0.1)', fg: '#059669' },
  info: { border: '#0284C7', bg: 'rgba(2,132,199,0.1)', fg: '#0284C7' },
  purple: { border: '#8B5CF6', bg: 'rgba(139,92,246,0.1)', fg: '#7C3AED' },
} as const;

const SegmentButton: React.FC<{
  active: boolean;
  tone?: keyof typeof SEGMENT_TONES;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, tone = 'info', onClick, children }) => {
  const c = SEGMENT_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
        border: active ? `1.5px solid ${c.border}` : '1px solid var(--border)',
        background: active ? c.bg : 'var(--surface)',
        color: active ? c.fg : 'var(--text-muted)',
        fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {children}
    </button>
  );
};

// ── Styles ──

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  animation: 'fadeIn 0.2s ease-out'
};

const modalContentStyle: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 16, padding: 0,
  width: '100%', maxHeight: '90vh', overflow: 'hidden',
  boxShadow: '0 24px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
  animation: 'popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  margin: '0 16px',
  transition: 'max-width 0.25s ease-in-out'
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--background)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none', transition: 'border-color 0.2s'
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block'
};

// ── Types ──

/** Why the system did, or did not, assign a document to somebody. */
export type MatchOutcome = 'assigned' | 'ambiguous' | 'unmatched';
export type MatchReason =
  | 'exact_full_name' | 'exact_full_name_concatenated' | 'unique_id'
  | 'duplicate_full_name' | 'other_company'
  | 'surname_only' | 'first_name_only' | 'no_candidate' | 'not_a_name';

export interface MatchSuggestion {
  id: number;
  name: string;
  surname: string;
  companyId: number | null;
  reason: MatchReason;
}

interface UploadFileItem {
  id: string;
  file: File;
  requiresSignature: boolean;
  expiresAt: string;
  visibility: 'everyone' | 'hr';
  companyId: number | null;
  useGlobal: boolean;
  expanded?: boolean;
  uploaded?: boolean;
  documentId?: number;
  matched?: boolean;
  matchedEmployee?: any;
  /**
   * The match the server already computed when this file was uploaded. Step 3
   * seeds from this rather than asking again, so the common path uses data we
   * know arrived correctly instead of depending on a second round trip.
   */
  matchOutcome?: MatchOutcome;
  matchReason?: MatchReason;
  matchSuggestions?: MatchSuggestion[];
  /** Company the server matched against, so we know when a re-match is needed. */
  matchedForCompanyId?: number | null;
  /**
   * Real byte size. Files extracted from a ZIP never existed as a browser File,
   * so the size comes from the server rather than from `file.size` - which is
   * what used to render every extracted file as "0.00 MB".
   */
  sizeBytes?: number;
  /** Category name applied to this document, if any. */
  category?: string;
}

/** An entry the archive contained but we did not import. */
interface SkippedItem {
  fileName: string;
  size: number;
  /** unsupported_format = never imported; processing_error = this one file failed. */
  reason: 'unsupported_format' | 'processing_error';
  message?: string;
}

interface DuplicateItem {
  fileName: string;
  firstDocumentId: number;
}

interface UnmatchedItem {
  documentId: number;
  fileName: string;
  editableTitle: string;
  fileExtension: string;
  manualEmployeeId: number | null;
  companyId: number | null;
  isAutoMatched?: boolean;
  sizeBytes?: number;
  outcome?: MatchOutcome;
  reason?: MatchReason;
  suggestions?: MatchSuggestion[];
  category?: string;
}

interface UploadedDocDetail {
  documentId: number;
  fileName: string;
  requiresSignature: boolean;
  expiresAt: string;
  visibility: 'everyone' | 'hr';
  companyId: number | null;
  companyName: string;
  assignedEmployeeId: number | null;
  assignedEmployeeName: string;
  fileObject: File;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  targetEmployeeId?: number | null;
  targetEmployeeName?: string | null;
}

export const UnifiedUploadWizard: React.FC<Props> = ({ onClose, onSuccess, targetEmployeeId, targetEmployeeName }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user, allowedCompanyIds = [] } = useAuth();
  const { isMobile } = useBreakpoint();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [uploading, setUploading] = useState(false);

  // Per-file transfer progress for step 1, keyed by a transient upload key.
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [currentUploadName, setCurrentUploadName] = useState<string>('');

  // Archive entries we did not import, surfaced in the problem panel.
  const [skippedFiles, setSkippedFiles] = useState<SkippedItem[]>([]);
  const [duplicateFiles, setDuplicateFiles] = useState<DuplicateItem[]>([]);

  // Clicking an entry in the problem panel highlights and scrolls to its row.
  const [focusedDocId, setFocusedDocId] = useState<number | null>(null);
  const focusedRowRef = useRef<HTMLDivElement | null>(null);

  /**
   * What each filename resolves to when matched against EVERY company the
   * operator can see, keyed by file name. Company-independent, so it is
   * computed once per file set and then reused: it drives both the "these look
   * like another company's employees" warning and the per-company grouping of
   * the document list.
   */
  const [globalMatches, setGlobalMatches] = useState<Map<string, MatchPreviewEntry>>(new Map());
  const [analysedFileKey, setAnalysedFileKey] = useState<string>('');
  const [analysing, setAnalysing] = useState(false);

  /** True while step 3 is matching filenames against the company's employees. */
  const [matching, setMatching] = useState(false);

  /** Category applied to the batch; per-document overrides live on each item. */
  const [globalCategory, setGlobalCategory] = useState<string>('');
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Global Metadata
  const [globalRequiresSignature, setGlobalRequiresSignature] = useState(false);
  const [globalExpiresAt, setGlobalExpiresAt] = useState('');
  const [globalVisibility, setGlobalVisibility] = useState<'everyone' | 'hr'>('everyone');
  const [globalCompanyId, setGlobalCompanyId] = useState<number | null>(user?.companyId || null);
  // Manual Assignment (Step 3)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [unmatchedDocs, setUnmatchedDocs] = useState<UnmatchedItem[]>([]);

  // Confirmation & Draft Cleanup Guard
  const isConfirmedRef = useRef(false);
  const filesRef = useRef(files);
  filesRef.current = files;

  const handleSafeClose = async () => {
    if (!isConfirmedRef.current) {
      const docIds = filesRef.current.filter(f => f.documentId).map(f => f.documentId!);
      if (docIds.length > 0) {
        await cleanupDraftDocuments(docIds);
      }
    }
    onClose();
  };

  useEffect(() => {
    return () => {
      if (!isConfirmedRef.current) {
        const docIds = filesRef.current.filter(f => f.documentId).map(f => f.documentId!);
        if (docIds.length > 0) {
          cleanupDraftDocuments(docIds);
        }
      }
    };
  }, []);

  // Companies List
  const [companies, setCompanies] = useState<Company[]>([]);

  // Uploaded Docs List (Step 4)
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocDetail[]>([]);

  // Preview Modal States (Stable URLs, no blinking)
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState<string>('');
  const [previewDocMimeType, setPreviewDocMimeType] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  const uploadedDocsRef = useRef(uploadedDocs);

  const isHrOrAdmin = user && ['admin', 'hr'].includes(user.role);

  // Keep ref in sync
  useEffect(() => {
    uploadedDocsRef.current = uploadedDocs;
  }, [uploadedDocs]);

  // Clean up any uploaded but unconfirmed documents on unmount
  useEffect(() => {
    return () => {
      if (!isConfirmedRef.current && uploadedDocsRef.current.length > 0) {
        uploadedDocsRef.current.forEach(doc => {
          deleteDocument(doc.documentId).catch(() => {});
        });
      }
    };
  }, []);

  // Return to step 1 if all documents are removed in step 4
  useEffect(() => {
    if (step === 4 && uploadedDocs.length === 0) {
      setStep(1);
    }
  }, [uploadedDocs, step]);

  // Bring the row picked in the problem panel into view.
  useEffect(() => {
    if (focusedDocId == null) return;
    focusedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusedDocId]);

  /**
   * On step 2, work out whether the filenames actually belong to the selected
   * company. Matching is run once with no company scope, so every candidate is
   * visible; we then count where those people actually work.
   */
  useEffect(() => {
    if (step !== 2 || files.length === 0) return;

    // Keyed by file names and globalCompanyId so matching re-evaluates when company changes
    const fileKey = `${files.map(f => f.file.name).join('|')}@comp:${globalCompanyId}`;
    if (analysedFileKey === fileKey) return;

    let cancelled = false;
    const names = files.map(f => ({ documentId: f.documentId, fileName: f.file.name }));

    setAnalysing(true);
    previewDocumentMatches(names, globalCompanyId)
      .then(entries => {
        if (cancelled) return;
        const next = new Map<string, MatchPreviewEntry>();
        for (const entry of entries) next.set(entry.fileName, entry);
        setGlobalMatches(next);
        setAnalysedFileKey(fileKey);
      })
      .catch(() => {
        if (cancelled) return;
        setGlobalMatches(new Map());
        setAnalysedFileKey(fileKey);
      })
      .finally(() => { if (!cancelled) setAnalysing(false); });

    return () => { cancelled = true; };
  }, [step, files, globalCompanyId, analysedFileKey]);

  // Categories of the selected company, for the batch category selector.
  useEffect(() => {
    if (!globalCompanyId) { setCategories([]); return; }
    let cancelled = false;
    getCategories(false)
      .then(all => { if (!cancelled) setCategories(all.filter(c => c.companyId === globalCompanyId)); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [globalCompanyId]);

  // Fetch initial data
  useEffect(() => {
    setLoadingEmps(true);
    Promise.all([
      getEmployees({ status: 'active', excludeAdmins: false, limit: 1000 }).then(res => setEmployees(res.employees)),
      getCompanies().then(res => setCompanies(res))
    ])
      .catch(() => {})
      .finally(() => setLoadingEmps(false));
  }, []);

  const associatedCompanies = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin' || user.isSuperAdmin) return companies;
    return companies.filter(c => c.id === user.companyId || allowedCompanyIds.includes(c.id));
  }, [companies, user, allowedCompanyIds]);

  // Auto-select company if only one is available
  useEffect(() => {
    if (associatedCompanies.length === 1 && !globalCompanyId) {
      handleGlobalCompany(associatedCompanies[0].id);
    }
  }, [associatedCompanies, globalCompanyId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    // Validation
    for (const f of selectedFiles) {
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
      const isArchive = ['.zip', '.rar', '.7z'].includes(ext);
      const maxSize = isArchive ? 50 * 1024 * 1024 : 10 * 1024 * 1024;

      if (f.size > maxSize) {
        showToast(isArchive ? `${f.name}: Archive size exceeds maximum limit (50MB).` : `${f.name}: File size exceeds maximum limit (10MB).`, 'error');
        return;
      }
    }

    // Adding files must not destroy work already done. Anything previously
    // selected stays; the operator removes files explicitly if they want to.
    const inputEl = e.target;
    setUploadProgress({});

    setUploading(true);
    // Keep the progress panel on screen long enough to be read. A fast local
    // upload otherwise flashes and disappears, which looks like nothing
    // happened at all.
    const startedAt = Date.now();
    const MIN_PROGRESS_MS = 2000;

    const items: UploadFileItem[] = [];
    const collectedSkipped: SkippedItem[] = [];
    const collectedDuplicates: DuplicateItem[] = [];
    const defaultCompId = globalCompanyId || (associatedCompanies.length === 1 ? associatedCompanies[0].id : (user?.companyId || null));

    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
      const isArchive = ['.zip', '.rar', '.7z'].includes(ext);
      const progressKey = `${f.name}-${i}`;
      setCurrentUploadName(f.name);

      if (isArchive) {
        try {
          const response = await uploadDocumentUnified(f, {
            requiresSignature: globalRequiresSignature,
            expiresAt: globalExpiresAt || null,
            visibleToRoles: globalVisibility === 'hr' ? ['admin', 'hr'] : ['admin', 'hr', 'area_manager', 'store_manager', 'employee'],
            employeeId: targetEmployeeId,
            companyId: defaultCompId,
            extractZip: true,
            onProgress: (percent) => setUploadProgress(prev => ({ ...prev, [progressKey]: percent }))
          });
          setUploadProgress(prev => ({ ...prev, [progressKey]: 100 }));

          if (response && response.isZip && Array.isArray(response.files)) {
            for (const extFile of response.files) {
              items.push({
                id: `zip-ext-${extFile.documentId}-${Date.now()}-${Math.random()}`,
                // Placeholder File carrying the real name; the true byte size
                // comes from the server via sizeBytes.
                file: new File([], extFile.fileName),
                sizeBytes: extFile.size ?? 0,
                requiresSignature: globalRequiresSignature,
                expiresAt: globalExpiresAt,
                visibility: globalVisibility,
                companyId: defaultCompId,
                useGlobal: true,
                expanded: false,
                uploaded: true,
                documentId: extFile.documentId,
                matched: extFile.matched,
                matchedEmployee: extFile.employee,
                matchOutcome: extFile.outcome,
                matchReason: extFile.reason,
                matchSuggestions: extFile.suggestions ?? [],
                matchedForCompanyId: defaultCompId,
              });
            }
            if (Array.isArray(response.skipped)) collectedSkipped.push(...response.skipped);
            if (Array.isArray(response.failed)) collectedSkipped.push(...response.failed);
            if (Array.isArray(response.duplicates)) collectedDuplicates.push(...response.duplicates);
          } else {
            items.push({
              id: `${f.name}-${i}-${Date.now()}`,
              file: f,
              sizeBytes: f.size,
              requiresSignature: globalRequiresSignature,
              expiresAt: globalExpiresAt,
              visibility: globalVisibility,
              companyId: defaultCompId,
              useGlobal: true,
              expanded: false
            });
          }
        } catch (err: any) {
          showToast(err?.message || `${t('documents.errorUpload')} (${f.name})`, 'error');
          setUploading(false);
          setCurrentUploadName('');
          return;
        }
      } else {
        items.push({
          id: `${f.name}-${i}-${Date.now()}`,
          file: f,
          sizeBytes: f.size,
          requiresSignature: globalRequiresSignature,
          expiresAt: globalExpiresAt,
          visibility: globalVisibility,
          companyId: defaultCompId,
          useGlobal: true,
          expanded: false
        });
        setUploadProgress(prev => ({ ...prev, [progressKey]: 100 }));
      }
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_PROGRESS_MS) {
      await new Promise(resolve => setTimeout(resolve, MIN_PROGRESS_MS - elapsed));
    }

    // Merge with anything already selected instead of replacing it, so
    // "Add more files" adds rather than starts over.
    setFiles(prev => [...prev, ...items]);
    setSkippedFiles(prev => [...prev, ...collectedSkipped]);
    setDuplicateFiles(prev => [...prev, ...collectedDuplicates]);
    setUploading(false);
    setCurrentUploadName('');

    // Allow re-selecting the same file after removing it.
    inputEl.value = '';

    if (items.length === 0) {
      // Everything in the selection was unsupported - say so instead of moving
      // on to an empty configuration step.
      showToast(t('documents.allFilesSkipped', 'No supported documents were found in the selection.'), 'error');
      return;
    }
    setStep(2);
  };

  /** Remove one file from the selection, deleting it server-side if uploaded. */
  const handleRemoveSelectedFile = async (item: UploadFileItem) => {
    if (item.uploaded && item.documentId) {
      try { await deleteDocument(item.documentId); } catch { /* already gone */ }
      setUnmatchedDocs(prev => prev.filter(d => d.documentId !== item.documentId));
      setUploadedDocs(prev => prev.filter(d => d.documentId !== item.documentId));
    }
    setFiles(prev => prev.filter(f => f.id !== item.id));
  };

  const handleClearSelection = async () => {
    const uploadedIds = files.filter(f => f.uploaded && f.documentId).map(f => f.documentId!);
    await Promise.all(uploadedIds.map(id => deleteDocument(id).catch(() => {})));
    setFiles([]);
    setUnmatchedDocs([]);
    setUploadedDocs([]);
    setSkippedFiles([]);
    setDuplicateFiles([]);
  };

  // Global Settings Handlers
  const handleGlobalSignature = (val: boolean) => {
    setGlobalRequiresSignature(val);
    setFiles(prev => prev.map(item => item.useGlobal ? { ...item, requiresSignature: val } : item));
  };

  const handleGlobalExpiry = (val: string) => {
    setGlobalExpiresAt(val);
    setFiles(prev => prev.map(item => item.useGlobal ? { ...item, expiresAt: val } : item));
  };

  const handleGlobalVisibility = (val: 'everyone' | 'hr') => {
    setGlobalVisibility(val);
    setFiles(prev => prev.map(item => item.useGlobal ? { ...item, visibility: val } : item));
  };

  const handleGlobalCompany = (val: number | null) => {
    setGlobalCompanyId(val);
    // Categories belong to a company, so the old company's category has to come
    // off every item too - otherwise the save fails with INVALID_CATEGORY.
    setFiles(prev => prev.map(item => item.useGlobal
      ? { ...item, companyId: val, category: undefined }
      : { ...item, category: item.companyId === val ? item.category : undefined }));
    // Any assignment suggested for the previous company is no longer valid.
    setUnmatchedDocs(prev => prev.map(doc => doc.companyId === val
      ? doc
      : { ...doc, companyId: val, manualEmployeeId: null, isAutoMatched: false, category: undefined }));
    // A different company means a different employee pool and a different set
    // of categories, so neither the previous fit analysis nor the chosen
    // category can be carried over.
    setGlobalCategory('');
  };

  const handleGlobalCategory = (val: string) => {
    setGlobalCategory(val);
    setFiles(prev => prev.map(item => item.useGlobal ? { ...item, category: val } : item));
  };

  // Individual Settings Handlers
  const updateIndividualItem = (id: string, updates: Partial<UploadFileItem>) => {
    setFiles(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const toggleItemGlobal = (id: string, useGlobal: boolean) => {
    setFiles(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          useGlobal,
          requiresSignature: useGlobal ? globalRequiresSignature : item.requiresSignature,
          expiresAt: useGlobal ? globalExpiresAt : item.expiresAt,
          visibility: useGlobal ? globalVisibility : item.visibility,
          companyId: useGlobal ? globalCompanyId : item.companyId
        };
      }
      return item;
    }));
  };

  const toggleExpandItem = (id: string) => {
    setFiles(prev => prev.map(item => item.id === id ? { ...item, expanded: !item.expanded } : item));
  };

  /**
   * Match a batch of documents against the employees of their company.
   *
   * Deliberately a plain async function called at the moment the operator moves
   * forward, not a useEffect: an effect has to guess *when* to run from a
   * dependency array, and a re-render mid-flight cancels the in-flight request,
   * which is how matches silently stopped appearing at all. Here the trigger is
   * explicit and there is nothing to cancel.
   */
  const runMatching = async (docs: UnmatchedItem[]): Promise<UnmatchedItem[]> => {
    if (docs.length === 0) return docs;

    // Documents can carry their own company override, so match per company.
    const byCompany = new Map<number | null, UnmatchedItem[]>();
    for (const doc of docs) {
      const list = byCompany.get(doc.companyId) ?? [];
      list.push(doc);
      byCompany.set(doc.companyId, list);
    }

    const results = new Map<number, MatchPreviewEntry>();
    for (const [companyId, group] of byCompany) {
      const entries = await previewDocumentMatches(
        group.map(d => ({ documentId: d.documentId, fileName: `${d.editableTitle}${d.fileExtension}` })),
        companyId,
      );
      for (const entry of entries) {
        if (entry.documentId != null) results.set(entry.documentId, entry);
      }
    }

    return docs.map(doc => {
      const entry = results.get(doc.documentId);
      if (!entry) return doc;

      // A manual choice the operator already made survives only while that
      // person still belongs to this document's company.
      const manualStillValid = doc.manualEmployeeId != null
        && !doc.isAutoMatched
        && employees.some(e => e.id === doc.manualEmployeeId && (!doc.companyId || e.companyId === doc.companyId));

      const autoId = entry.outcome === 'assigned' && entry.employee ? entry.employee.id : null;

      return {
        ...doc,
        outcome: entry.outcome,
        reason: entry.reason as MatchReason,
        suggestions: (entry.suggestions ?? []) as MatchSuggestion[],
        manualEmployeeId: manualStillValid ? doc.manualEmployeeId : autoId,
        isAutoMatched: manualStillValid ? false : autoId != null,
      };
    });
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;

    if (isHrOrAdmin) {
      for (const item of files) {
        if (!item.companyId) {
          showToast(t('companies.selectCompany', 'Please select a company for document') + `: ${item.file.name}`, 'error');
          return;
        }
      }
    }

    setUploading(true);
    const updatedFiles = [...files];
    const docList: UnmatchedItem[] = [];

    // Step 2 only uploads and stores metadata. Employee matching happens once,
    // on entering step 3, against whichever company is selected at that moment -
    // see the matching effect below. Keeping the two apart is what makes
    // changing the company in step 2 reliably re-run the match.
    for (let i = 0; i < updatedFiles.length; i++) {
      const item = updatedFiles[i];
      try {
        const visibleToRoles = item.visibility === 'hr'
          ? ['admin', 'hr']
          : ['admin', 'hr', 'area_manager', 'store_manager', 'employee'];

        type MatchSeed = Pick<UploadFileItem, 'matchOutcome' | 'matchReason' | 'matchSuggestions' | 'matchedEmployee' | 'matchedForCompanyId'>;

        const toEntry = (documentId: number, fileName: string, sizeBytes?: number, seedOverride?: MatchSeed): UnmatchedItem => {
          const lastDot = fileName.lastIndexOf('.');
          const previous = unmatchedDocs.find(d => d.documentId === documentId);
          const seed: MatchSeed = seedOverride ?? item;
          // Going Back to step 2 and forward again must not discard work: a
          // manual assignment survives while the company is unchanged. If the
          // company changed, it is dropped and re-derived by runMatching.
          const keepManual = previous
            && previous.companyId === item.companyId
            && !previous.isAutoMatched
            && previous.manualEmployeeId != null;

          // Seed from the match the server already returned at upload time.
          // Only valid while the document is still filed under the company it
          // was matched against; otherwise runMatching recomputes it.
          const seedValid = seed.matchedForCompanyId === item.companyId && !!seed.matchOutcome;
          const seedAutoId = seedValid && seed.matchOutcome === 'assigned' && seed.matchedEmployee
            ? seed.matchedEmployee.id as number
            : null;

          return {
            documentId,
            fileName,
            editableTitle: previous ? previous.editableTitle : (lastDot > 0 ? fileName.substring(0, lastDot) : fileName),
            fileExtension: lastDot > 0 ? fileName.substring(lastDot) : '',
            manualEmployeeId: keepManual ? previous!.manualEmployeeId : seedAutoId,
            companyId: item.companyId,
            sizeBytes,
            outcome: seedValid ? seed.matchOutcome! : 'unmatched',
            reason: seedValid ? seed.matchReason : undefined,
            suggestions: seedValid ? (seed.matchSuggestions ?? []) : [],
            isAutoMatched: !keepManual && seedAutoId != null,
          };
        };

        if (item.uploaded && item.documentId) {
          // Nothing is assigned here: an abandoned wizard must never leave a
          // payslip sitting in someone's personal area.
          await updateDocumentGeneric(item.documentId, {
            title: item.file.name,
            employee_id: null,
            requires_signature: item.requiresSignature,
            expires_at: item.expiresAt || null,
            visible_to_roles: visibleToRoles,
            company_id: item.companyId,
          });
          docList.push(toEntry(item.documentId, item.file.name, item.sizeBytes));
        } else {
          const response = await uploadDocumentUnified(item.file, {
            requiresSignature: item.requiresSignature,
            expiresAt: item.expiresAt || null,
            visibleToRoles,
            employeeId: targetEmployeeId,
            companyId: item.companyId,
            extractZip: true,
          });

          if (response) {
            if (response.isZip && Array.isArray(response.files)) {
              updatedFiles[i] = { ...item, uploaded: true };
              for (const extFile of response.files) {
                // A ZIP added at step 2 carries its own match on each entry.
                docList.push(toEntry(extFile.documentId, extFile.fileName, extFile.size, {
                  matchOutcome: extFile.outcome,
                  matchReason: extFile.reason,
                  matchSuggestions: extFile.suggestions ?? [],
                  matchedEmployee: extFile.employee,
                  matchedForCompanyId: item.companyId,
                }));
              }
              if (Array.isArray(response.skipped)) setSkippedFiles(prev => [...prev, ...response.skipped]);
              if (Array.isArray(response.failed)) setSkippedFiles(prev => [...prev, ...response.failed]);
              if (Array.isArray(response.duplicates)) setDuplicateFiles(prev => [...prev, ...response.duplicates]);
            } else if (response.documentId) {
              updatedFiles[i] = { ...item, uploaded: true, documentId: response.documentId };
              docList.push(toEntry(response.documentId, item.file.name, response.size ?? item.file.size));
            }
          }
        }
      } catch (err: any) {
        // Commit what already succeeded before bailing out, otherwise a retry
        // uploads those files a second time and creates duplicates.
        setFiles(updatedFiles);
        if (docList.length > 0) setUnmatchedDocs(docList);
        showToast(translateApiError(err, t) ?? `${t('documents.errorUpload')} (${item.file.name})`, 'error');
        setUploading(false);
        return;
      }
    }

    setFiles(updatedFiles);
    setUnmatchedDocs(docList);
    setUploading(false);

    // Show step 3 with its matching screen, then match. Runs every time the
    // operator advances, so changing the company in step 2 and pressing Next
    // always produces a fresh set of matches for that company.
    setStep(3);
    setMatching(true);
    try {
      const matched = await runMatching(docList);
      setUnmatchedDocs(matched);
    } catch (err) {
      showToast(translateApiError(err, t) ?? t('documents.errorRematch', 'Could not verify employee matches. Please try again.'), 'error');
    } finally {
      setMatching(false);
    }
  };

  const buildFinalUploadedDocs = (currentFiles: UploadFileItem[], manualAssignments: UnmatchedItem[]) => {
    const finalDocs: UploadedDocDetail[] = [];

    manualAssignments.forEach(item => {
      let assignedEmpId: number | null = item.manualEmployeeId;
      let assignedEmpName = 'Unassigned';

      if (assignedEmpId) {
        const emp = employees.find(e => e.id === assignedEmpId);
        if (emp && (!item.companyId || !emp.companyId || emp.companyId === item.companyId)) {
          assignedEmpName = `${emp.name || ''} ${emp.surname || ''}`.trim();
        } else {
          assignedEmpId = null;
          assignedEmpName = 'Unassigned';
        }
      }

      const comp = companies.find(c => c.id === item.companyId);
      const matchingFileItem = currentFiles.find(f => f.documentId === item.documentId);
      const fileObject = matchingFileItem?.file || new File([], `${item.editableTitle}${item.fileExtension}`);

      finalDocs.push({
        documentId: item.documentId,
        fileName: `${item.editableTitle}${item.fileExtension}`,
        requiresSignature: matchingFileItem ? matchingFileItem.requiresSignature : globalRequiresSignature,
        expiresAt: matchingFileItem ? matchingFileItem.expiresAt : globalExpiresAt,
        visibility: matchingFileItem ? matchingFileItem.visibility : globalVisibility,
        companyId: item.companyId,
        companyName: comp ? comp.name : 'Unknown Company',
        assignedEmployeeId: assignedEmpId,
        assignedEmployeeName: assignedEmpName,
        fileObject: fileObject
      });
    });

    setUploadedDocs(finalDocs);
  };

  const handleStep3Save = async () => {
    buildFinalUploadedDocs(files, unmatchedDocs);
    setStep(4);
  };

  const handleRemoveDocument = async (docId: number) => {
    try {
      await deleteDocument(docId);
      setUploadedDocs(prev => prev.filter(d => d.documentId !== docId));
      setFiles(prev => prev.filter(f => f.documentId !== docId));
      // unmatchedDocs is what Confirm iterates over. Leaving the row here would
      // resurrect the deleted document on Confirm and notify the employee.
      setUnmatchedDocs(prev => prev.filter(d => d.documentId !== docId));
      showToast(t('documents.deleted'), 'success');
    } catch {
      showToast(t('common.error'), 'error');
    }
  };

  const handleConfirmSave = async () => {
    setUploading(true);
    try {
      for (const item of unmatchedDocs) {
        const fullTitle = `${item.editableTitle}${item.fileExtension}`;
        const sourceFile = files.find(f => f.documentId === item.documentId);

        // This is the only place an assignment is persisted, so it is also the
        // place the company gate has to hold. An employee from another company
        // is dropped rather than saved - the step 4 summary already shows such a
        // document as unassigned, and the two must agree.
        const chosen = item.manualEmployeeId != null
          ? employees.find(e => e.id === item.manualEmployeeId)
          : undefined;
        const employeeId = chosen && (!item.companyId || chosen.companyId === item.companyId)
          ? chosen.id
          : null;

        await updateDocumentGeneric(item.documentId, {
          title: fullTitle,
          employee_id: employeeId,
          company_id: item.companyId,
          category: item.category || undefined,
          confirm: true,
          notify: true
        });
      }
      isConfirmedRef.current = true;
      showToast(t('documents.uploaded'), 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(translateApiError(err, t) ?? t('common.error'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleUnmatchedTitleChange = (docId: number, title: string) => {
    setUnmatchedDocs(prev => prev.map(item => item.documentId === docId ? { ...item, editableTitle: title } : item));
  };

  const handleUnmatchedEmpChange = (docId: number, empId: number | null) => {
    setUnmatchedDocs(prev => prev.map(item => item.documentId === docId ? { ...item, manualEmployeeId: empId } : item));
  };

  // Preview management
  const openPreview = async (doc: UploadedDocDetail) => {
    if (previewDocUrl) {
      URL.revokeObjectURL(previewDocUrl);
      setPreviewDocUrl(null);
    }
    const ext = (doc.fileName.split('.').pop() || '').toLowerCase();
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      txt: 'text/plain',
    };
    const mimeType = (doc.fileObject && doc.fileObject.type) || mimeMap[ext] || 'application/octet-stream';

    setPreviewDocName(doc.fileName);
    setPreviewDocMimeType(mimeType);

    if (doc.documentId) {
      setPreviewLoading(true);
      try {
        const url = await getDocumentPreviewUrlGeneric(doc.documentId, mimeType);
        setPreviewDocUrl(url);
      } catch {
        showToast(t('common.error', 'Error loading document preview'), 'error');
      } finally {
        setPreviewLoading(false);
      }
    } else if (doc.fileObject && doc.fileObject.size > 0) {
      const url = URL.createObjectURL(doc.fileObject);
      setPreviewDocUrl(url);
    }
  };

  const closePreview = () => {
    if (previewDocUrl) {
      URL.revokeObjectURL(previewDocUrl);
      setPreviewDocUrl(null);
    }
    setPreviewLoading(false);
  };

  const getUnmatchedEmpOptions = (docCompanyId: number | null): SelectOption[] => {
    const unassigned: SelectOption = {
      value: '',
      label: t('documents.unassigned', 'Unassigned'),
      render: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(201,151,58,0.15)', color: '#C9973A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>⚠</div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#C9973A' }}>{t('documents.unassigned', 'Unassigned')}</div>
        </div>
      ),
      selectedRender: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(201,151,58,0.15)', color: '#C9973A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>⚠</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#C9973A' }}>{t('documents.unassigned', 'Unassigned')}</span>
        </div>
      ),
    };

    const list = employees
      .filter(emp => !docCompanyId || emp.companyId === docCompanyId)
      .map(emp => {
        const fullName = formatEmployeeName(emp);
        return {
          value: String(emp.id),
          // Searchable by either name order and by payroll id.
          label: [fullName, `${emp.surname ?? ""} ${emp.name ?? ""}`.trim(), emp.uniqueId ?? ""].join(" "),
          // Full detail while choosing...
          render: (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0", width: "100%", minWidth: 0 }}>
              <PersonAvatar name={emp.name} surname={emp.surname} avatarFilename={emp.avatarFilename} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</span>
                  {emp.uniqueId && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "var(--background)", color: "var(--text-muted)", flexShrink: 0 }}>
                      {emp.uniqueId}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t(`roles.${emp.role}`, emp.role)}{emp.companyName ? ` · ${emp.companyName}` : ""}
                </div>
              </div>
            </div>
          ),
          // ...but once chosen, just the person. Their role is shown beside the
          // field label and their company in the left rail, so repeating both
          // here only makes the two fields different heights.
          selectedRender: (
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <PersonAvatar name={emp.name} surname={emp.surname} avatarFilename={emp.avatarFilename} size={22} />
              <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName}</span>
            </div>
          ),
        };
      });
    return [unassigned, ...list];
  };

  // One width for every step. The dialog used to jump from 660 to 1080 when the
  // matching step opened, which reads as a different window rather than the
  // next step of the same one. Content adapts inside a fixed shell instead.
  const modalWidth = isMobile ? 660 : 1020;



  // ── Derived progress / grouping for the matching workspace ──

  const overallUploadPercent = (() => {
    const values = Object.values(uploadProgress);
    if (values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  })();

  /** How many documents currently have somebody assigned, auto or manual. */
  const resolvedCount = unmatchedDocs.filter(d => d.manualEmployeeId != null).length;
  const totalToAssign = unmatchedDocs.length;
  const assignPercent = totalToAssign === 0 ? 0 : Math.round((resolvedCount / totalToAssign) * 100);

  /**
   * Employees detected in this batch, grouped by company. Answers "who did this
   * archive turn out to be about, and are they all in the same company?".
   */
  const detectedByCompany = (() => {
    const groups = new Map<number | null, { companyName: string; employees: Map<number, { employee: Employee; count: number }> }>();
    for (const doc of unmatchedDocs) {
      if (doc.manualEmployeeId == null) continue;
      const emp = employees.find(e => e.id === doc.manualEmployeeId);
      if (!emp) continue;
      const companyId = emp.companyId ?? doc.companyId ?? null;
      const companyName = companies.find(c => c.id === companyId)?.name
        ?? t('documents.unknownCompany', 'Unknown company');
      if (!groups.has(companyId)) groups.set(companyId, { companyName, employees: new Map() });
      const group = groups.get(companyId)!;
      const existing = group.employees.get(emp.id);
      if (existing) existing.count += 1;
      else group.employees.set(emp.id, { employee: emp, count: 1 });
    }
    return Array.from(groups.entries()).map(([companyId, g]) => ({
      companyId,
      companyName: g.companyName,
      employees: Array.from(g.employees.values())
        .sort((a, b) => formatEmployeeName(a.employee).localeCompare(formatEmployeeName(b.employee))),
    }));
  })();

  const totalSelectedBytes = files.reduce((sum, f) => sum + (f.sizeBytes ?? f.file.size ?? 0), 0);

  const companySelectOptions = useMemo<SelectOption[]>(
    () => buildCompanyOptions(associatedCompanies, { ownerLabel: t('companies.owner', 'Owner') }),
    [associatedCompanies, t],
  );

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

  /**
   * Which company each file's name points at, regardless of what is currently
   * selected. `null` means the name matched nobody anywhere.
   */
  const detectedCompanyForFile = (item: UploadFileItem): number | null => {
    const entry = globalMatches.get(item.file.name);
    if (!entry) return null;
    if (entry.employee) return entry.employee.companyId;
    // An exact name shared across companies comes back ambiguous. If every
    // candidate happens to sit in one company we can still name it.
    const strong = entry.suggestions.filter(
      s => s.reason === 'exact_full_name' || s.reason === 'exact_full_name_concatenated' || s.reason === 'unique_id' || s.reason === 'other_company',
    );
    const unique = Array.from(new Set(strong.map(s => s.companyId).filter((c): c is number => c != null)));
    return unique.length === 1 ? unique[0] : null;
  };

  /**
   * Documents grouped by the company their filenames actually point at. This is
   * what the operator needs to see when an archive turns out to span companies:
   * the files themselves, under the company they belong to.
   */
  const documentsByDetectedCompany = (() => {
    const groups = new Map<number | null, UploadFileItem[]>();
    for (const item of files) {
      const companyId = detectedCompanyForFile(item);
      const list = groups.get(companyId) ?? [];
      list.push(item);
      groups.set(companyId, list);
    }
    return Array.from(groups.entries())
      .map(([companyId, items]) => ({
        companyId,
        companyName: companyId == null
          ? t('documents.noMatchGroup', 'No employee matched')
          : (companies.find(c => c.id === companyId)?.name ?? t('documents.unknownCompany', 'Unknown company')),
        isSelected: companyId === globalCompanyId,
        canSwitchTo: companyId != null && associatedCompanies.some(c => c.id === companyId),
        items,
      }))
      // Selected company first, then biggest groups, unmatched last.
      .sort((a, b) => {
        if (a.companyId === null) return 1;
        if (b.companyId === null) return -1;
        if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
        return b.items.length - a.items.length;
      });
  })();

  /** True once the batch demonstrably concerns more than one company. */
  const spansMultipleCompanies = documentsByDetectedCompany.filter(g => g.companyId != null).length > 1;

  const matchStats = (() => {
    let inSelected = 0;
    const elsewhere = new Map<number, number>();
    for (const item of files) {
      const companyId = detectedCompanyForFile(item);
      if (companyId == null) continue;
      if (companyId === globalCompanyId) inSelected++;
      else elsewhere.set(companyId, (elsewhere.get(companyId) ?? 0) + 1);
    }
    return {
      total: files.length,
      inSelected,
      elsewhere: Array.from(elsewhere.entries())
        .map(([companyId, count]) => ({
          companyId,
          companyName: companies.find(c => c.id === companyId)?.name ?? t('documents.unknownCompany', 'Unknown company'),
          count,
          canSwitchTo: associatedCompanies.some(c => c.id === companyId),
        }))
        .sort((a, b) => b.count - a.count),
    };
  })();

  /**
   * The tag shown on each document row: what settings it will actually be
   * saved with. Replaces the old "use global" checkbox, which showed a control
   * rather than an outcome.
   */
  const describeItemConfig = (item: UploadFileItem): { label: string; tone: TagTone; icon?: string; title?: string } => {
    if (!item.companyId) {
      return {
        label: t('documents.tagNoCompany', 'No company'),
        tone: 'danger',
        icon: '⛔',
        title: t('documents.tagNoCompanyHelp', 'Choose a company before continuing'),
      };
    }
    if (item.useGlobal) {
      return {
        label: t('documents.tagBatch', 'Batch settings'),
        tone: 'info',
        title: t('documents.tagBatchHelp', 'Uses the settings above'),
      };
    }
    return {
      label: t('documents.tagCustom', 'Custom'),
      tone: 'warning',
      icon: '✎',
      title: t('documents.tagCustomHelp', 'This document overrides the batch settings'),
    };
  };

  /**
   * Everything worth telling the operator before they continue: files without a
   * company, formats we skipped, and - most importantly - filenames that look
   * like they belong to a different company than the one selected.
   */
  const validationNotices = (() => {
    const notices: Array<{
      tone: 'info' | 'warning' | 'danger' | 'success';
      title: string;
      detail?: string;
      action?: { label: string; onClick: () => void };
    }> = [];

    const missingCompany = files.filter(f => !f.companyId);
    if (missingCompany.length > 0) {
      notices.push({
        tone: 'danger',
        title: t('documents.noticeMissingCompanyTitle', '{{count}} document(s) have no company', { count: missingCompany.length }),
        detail: t('documents.noticeMissingCompanyDetail', 'Pick a company above, or set one on each document, before continuing.'),
      });
    }

    if (skippedFiles.length > 0) {
      notices.push({
        tone: 'warning',
        title: t('documents.noticeSkippedTitle', '{{count}} file(s) were not imported', { count: skippedFiles.length }),
        detail: t('documents.noticeSkippedDetail', 'Unsupported format: {{names}}. Remove them or upload a supported format.', {
          names: skippedFiles.map(s => s.fileName).join(', '),
        }),
      });
    }

    if (duplicateFiles.length > 0) {
      notices.push({
        tone: 'warning',
        title: t('documents.noticeDuplicateTitle', '{{count}} duplicate filename(s)', { count: duplicateFiles.length }),
        detail: duplicateFiles.map(d => d.fileName).join(', '),
      });
    }

    // The interesting one: this batch looks like somebody else's company.
    if (!analysing && analysedFileKey !== '' && matchStats.total > 0) {
      const { inSelected, elsewhere, total } = matchStats;
      const strongest = elsewhere[0];
      const elsewhereTotal = elsewhere.reduce((sum, e) => sum + e.count, 0);

      const compBreakdownList: string[] = [];
      const currentCompName = companies.find(c => c.id === globalCompanyId)?.name ?? 'Selected company';
      if (inSelected > 0) {
        compBreakdownList.push(`${inSelected} match ${currentCompName}`);
      }
      for (const e of elsewhere) {
        compBreakdownList.push(`${e.count} match ${e.companyName}`);
      }
      const unmatchedCount = total - (inSelected + elsewhereTotal);
      if (unmatchedCount > 0) {
        compBreakdownList.push(`${unmatchedCount} unmatched`);
      }

      const overviewText = `Archive overview (${total} file(s)): ${compBreakdownList.join(' · ')}.`;

      if (strongest && inSelected === 0) {
        notices.push({
          tone: 'warning',
          title: t('documents.noticeWrongCompanyTitle', 'Filenames match {{company}} employees', { company: strongest.companyName }),
          detail: `${overviewText} ${t('documents.noticeWrongCompanyHint', 'Switch company above or continue to manually assign documents in Step 3.')}`,
          action: strongest.canSwitchTo
            ? {
                label: t('documents.switchCompany', 'Switch to {{company}}', { company: strongest.companyName }),
                onClick: () => handleGlobalCompany(strongest.companyId),
              }
            : undefined,
        });
      } else if (elsewhereTotal > 0) {
        notices.push({
          tone: 'info',
          title: t('documents.noticeMixedCompanyTitle', 'Archive contains documents spanning multiple companies'),
          detail: overviewText,
        });
      } else if (inSelected > 0 && inSelected < total) {
        notices.push({
          tone: 'info',
          title: t('documents.noticePartialMatchTitle', '{{matched}} of {{total}} files match employees of {{selected}}', {
            matched: inSelected, total, selected: currentCompName
          }),
          detail: overviewText,
        });
      } else if (inSelected === total) {
        notices.push({
          tone: 'success',
          title: t('documents.noticeAllMatchTitle', 'All {{count}} files match employees of {{selected}}', { count: total, selected: currentCompName }),
          detail: overviewText,
        });
      }
    }

    return notices;
  })();

  const summaryCounts = {
    assigned: uploadedDocs.filter(d => d.assignedEmployeeId != null).length,
    unassigned: uploadedDocs.filter(d => d.assignedEmployeeId == null).length,
    skipped: skippedFiles.length,
    duplicates: duplicateFiles.length,
  };

  /**
   * A concrete, name-level explanation on top of the generic reason - "matched
   * the surname of Francesco Piscopo" tells an operator far more than "no exact
   * match". Purely informational: it never changes what is assigned.
   */
  const explainSuggestions = (doc: UnmatchedItem): string | null => {
    const suggestions = doc.suggestions ?? [];
    if (suggestions.length === 0) return null;

    const byReason = (reason: MatchReason) => suggestions.filter(s => s.reason === reason);
    const nameOf = (s: MatchSuggestion) => formatEmployeeName(s);

    const exact = suggestions.filter(s => s.reason === 'exact_full_name' || s.reason === 'exact_full_name_concatenated');
    if (exact.length > 1) {
      return t('documents.explainDuplicate', '{{count}} employees share this exact name: {{names}}', {
        count: exact.length,
        names: exact.slice(0, 3).map(nameOf).join(', '),
      });
    }

    const otherCompany = byReason('other_company');
    if (otherCompany.length > 0) {
      const who = otherCompany[0];
      const companyName = companies.find(c => c.id === who.companyId)?.name ?? t('documents.otherCompanyShort', 'another company');
      return t('documents.explainOtherCompany', '{{name}} matches exactly, but works at {{company}}', {
        name: nameOf(who), company: companyName,
      });
    }

    const surnameOnly = byReason('surname_only');
    if (surnameOnly.length > 0) {
      return surnameOnly.length === 1
        ? t('documents.explainSurnameOne', 'Same surname as {{name}}, different first name', { name: nameOf(surnameOnly[0]) })
        : t('documents.explainSurnameMany', '{{count}} employees share this surname: {{names}}', {
            count: surnameOnly.length, names: surnameOnly.slice(0, 3).map(nameOf).join(', '),
          });
    }

    const firstNameOnly = byReason('first_name_only');
    if (firstNameOnly.length > 0) {
      return firstNameOnly.length === 1
        ? t('documents.explainFirstNameOne', 'Same first name as {{name}}, different surname', { name: nameOf(firstNameOnly[0]) })
        : t('documents.explainFirstNameMany', '{{count}} employees share this first name: {{names}}', {
            count: firstNameOnly.length, names: firstNameOnly.slice(0, 3).map(nameOf).join(', '),
          });
    }

    return null;
  };

  /**
   * Does the assigned person's name actually appear in the (possibly edited)
   * filename? Purely advisory - an operator is allowed to assign a document
   * whose name does not match, but they should be told. Recomputed from
   * `editableTitle`, so renaming the file to match clears the warning.
   */
  const describeAssignmentMismatch = (doc: UnmatchedItem): string | null => {
    if (doc.manualEmployeeId == null) return null;
    const emp = employees.find(e => e.id === doc.manualEmployeeId);
    if (!emp) return null;

    // Wrong company outranks a name mismatch: this assignment will be refused
    // on save, so say that rather than quibbling about the spelling.
    if (emp.companyId && doc.companyId && emp.companyId !== doc.companyId) {
      const comp = companies.find(c => c.id === emp.companyId);
      return t('documents.warningOtherCompany', 'This person belongs to {{company}} — the document is filed under a different company, so this assignment will not be saved.', {
        company: comp?.name ?? t('documents.otherCompanyShort', 'other company'),
      });
    }

    const strip = (v: string) => (v || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')
      .toLowerCase();

    // Same tokenisation the backend matcher uses, including a trailing-digit
    // strip, so the UI and the engine agree on what "matches" means.
    const tokens = new Set<string>();
    for (const raw of strip(doc.editableTitle).split(/[^a-z0-9]+/).filter(Boolean)) {
      tokens.add(raw);
      const trimmed = raw.replace(/\d+$/, '');
      if (trimmed.length >= 2) tokens.add(trimmed);
    }
    const joined = strip(doc.editableTitle).replace(/[^a-z0-9]/g, '');

    const has = (value: string | null | undefined) => {
      const parts = strip(value || '').split(/[^a-z0-9]+/).filter(Boolean);
      if (parts.length === 0) return false;
      const whole = parts.join('');
      return tokens.has(whole) || joined.includes(whole) || parts.every(p => tokens.has(p));
    };

    const firstOk = has(emp.name);
    const lastOk = has(emp.surname);

    if (firstOk && lastOk) return null;
    if (!firstOk && !lastOk) {
      return t('documents.mismatchNone', 'The assigned name does not appear in this filename at all — check you have the right person, or rename the file.');
    }
    if (lastOk) {
      return t('documents.mismatchFirstName', 'Only the surname matches this filename; the first name does not.');
    }
    return t('documents.mismatchSurname', 'Only the first name matches this filename; the surname does not.');
  };

  /** Everything the operator should look at before confirming. */
  const problems = (() => {
    const list: Array<{ kind: string; label: string; detail: string; extra?: string | null; documentId?: number }> = [];
    for (const doc of unmatchedDocs) {
      if (doc.manualEmployeeId != null) continue;
      list.push({
        kind: doc.outcome === 'ambiguous' ? 'ambiguous' : 'unmatched',
        label: doc.fileName,
        detail: describeMatchReason(doc.reason, doc.suggestions?.length ?? 0, t),
        extra: explainSuggestions(doc),
        documentId: doc.documentId,
      });
    }
    for (const s of skippedFiles) {
      list.push({
        kind: 'skipped',
        label: s.fileName,
        detail: s.reason === 'processing_error'
          ? t('documents.reasonProcessingError', 'This file could not be read — the other files were processed normally')
          : t('documents.reasonUnsupportedFormat', 'Unsupported format — not imported'),
        extra: s.message ?? null,
      });
    }
    for (const d of duplicateFiles) {
      list.push({ kind: 'duplicate', label: d.fileName, detail: t('documents.reasonDuplicate', 'Appears more than once in the archive') });
    }
    return list;
  })();

  return createPortal(
    <div style={modalOverlayStyle} onClick={handleSafeClose}>
      <div style={{ ...modalContentStyle, maxWidth: modalWidth }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('documents.stepCounter', 'Step {{step}} of 4', { step })}
              </div>
              <h3 style={{ margin: '3px 0 0', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {step === 1
                  ? t('documents.stepTitleUpload', 'Select and upload files')
                  : step === 2
                    ? t('documents.stepTitleConfigure', 'Configure settings')
                    : step === 3
                      ? t('documents.stepTitleMatch', 'Match documents to employees')
                      : t('documents.stepTitleConfirm', 'Review and confirm')}
              </h3>
            </div>
            <button onClick={handleSafeClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✕</button>
          </div>
          {/* Enhanced Step Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            background: 'rgba(0,0,0,0.02)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
          }}>
            {[1, 2, 3, 4].map((s, idx) => {
              const isActive = step === s;
              const isCompleted = step > s;
              const labels = [
                t('documents.stepSelect', 'Upload'),
                t('documents.stepConfigure', 'Configure'),
                t('documents.stepMatch', 'Match'),
                t('documents.stepConfirm', 'Confirm')
              ];
              return (
                <React.Fragment key={s}>
                  {idx > 0 && (
                    <div style={{
                      flex: 1,
                      height: '2px',
                      background: isCompleted ? '#10B981' : 'var(--border)',
                      margin: '0 6px',
                      transition: 'background 0.3s ease',
                    }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: isCompleted ? '#10B981' : isActive ? 'var(--primary)' : 'var(--border)',
                      color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700, transition: 'all 0.3s ease'
                    }}>
                      {isCompleted ? '✓' : s}
                    </span>
                    {!isMobile && (
                      <span style={{
                        fontSize: '11px', fontWeight: isActive ? 700 : 500,
                        color: isActive ? 'var(--primary)' : isCompleted ? '#10B981' : 'var(--text-muted)',
                        whiteSpace: 'nowrap'
                      }}>
                        {labels[s - 1]}
                      </span>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          {step === 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, margin: '0 auto', width: '100%' }}>
              {targetEmployeeName && (
                <div style={{ padding: '10px 14px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />
                  {t('documents.assignedTo', 'Assigned to')}: <strong>{targetEmployeeName}</strong>
                </div>
              )}
              {uploading ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: 200, border: '2px dashed var(--primary)', borderRadius: 12, background: 'var(--background)', gap: 14, padding: '0 28px'
                }}>
                  <div style={{ fontSize: 32, animation: 'pulse 1s infinite' }}>📦</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>
                    {overallUploadPercent < 100
                      ? t('documents.uploadingFiles', 'Uploading files…')
                      : t('documents.extractingArchive', 'Extracting and reading files…')}
                  </div>
                  {/* Real transfer percentage rather than an indeterminate spinner. */}
                  <div style={{ width: '100%', maxWidth: 380 }}>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${overallUploadPercent}%`, height: '100%', borderRadius: 999,
                        background: 'linear-gradient(90deg, var(--primary), #10B981)',
                        transition: 'width 0.25s ease-out'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                        {currentUploadName}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{overallUploadPercent}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: files.length > 0 ? 130 : 200,
                    border: '2px dashed var(--border)', borderRadius: 12, cursor: 'pointer',
                    transition: 'all 0.2s', background: 'var(--background)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ background: 'rgba(2,132,199,0.1)', color: 'var(--primary)', padding: files.length > 0 ? 8 : 12, borderRadius: 12, marginBottom: 10 }}>
                    <IconUpload />
                  </div>
                  <div style={{ fontSize: files.length > 0 ? 13 : 15, fontWeight: 600 }}>
                    {files.length > 0
                      ? t('documents.addMoreFiles', 'Add more files')
                      : t('documents.chooseFilesTitle', 'Choose files to upload')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center', padding: '0 16px' }}>
                    {t('documents.acceptedFormats', 'ZIP archives up to 50 MB · PDF, images and Office files up to 10 MB')}
                  </div>
                  <input type="file" multiple hidden onChange={handleFileChange} accept=".zip,.rar,.7z,.pdf,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,.doc,.docx,.xls,.xlsx,.odt,.ods,.p7m,application/zip,application/x-zip-compressed,application/rar,application/x-rar-compressed,application/x-7z-compressed,application/octet-stream" />
                </label>
              )}

              {/* Files already chosen stay visible and removable, so coming back
                  to this step does not look like the selection was lost. */}
              {files.length > 0 && !uploading && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--background)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                      {t('documents.selectedFiles', 'Selected files')}
                      <span style={{ marginLeft: 6, color: 'var(--primary)' }}>{files.length}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {formatFileSize(totalSelectedBytes)}
                      </span>
                      <button
                        onClick={handleClearSelection}
                        style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        {t('documents.removeAll', 'Remove all')}
                      </button>
                    </div>
                  </div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {files.map(item => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px',
                          borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)'
                        }}
                      >
                        <FileTypeIcon filename={item.file.name} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.file.name}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{formatFileSize(item.sizeBytes ?? item.file.size)}</span>
                            <span>·</span>
                            <span>{formatStyleFor(item.file.name).label}</span>
                          </div>
                        </div>
                        <IconButton
                          title={t('common.remove', 'Remove')}
                          tone="danger"
                          onClick={() => handleRemoveSelectedFile(item)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    ))}
                  </div>

                  {skippedFiles.length > 0 && (
                    <div style={{ padding: '9px 14px', borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,0.07)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', marginBottom: 3 }}>
                        {t('documents.skippedHeader', 'Not imported (unsupported format)')} · {skippedFiles.length}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#B45309', lineHeight: 1.5 }}>
                        {skippedFiles.map(s => s.fileName).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : step === 2 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Company drives everything below it - which employees can be
                  matched, which categories exist - so it sits on its own row. */}
              <div style={{ padding: '14px 16px', background: 'var(--background)', border: '1.5px solid var(--primary)', borderRadius: 12 }}>
                <label style={labelStyle}>
                  {t('companies.company', 'Company')} <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <CustomSelect
                  value={globalCompanyId ? String(globalCompanyId) : null}
                  onChange={(val) => handleGlobalCompany(val ? Number(val) : null)}
                  options={companySelectOptions}
                  placeholder={t('companies.selectCompany', 'Select Company')}
                  isClearable={false}
                  showCheck={false}
                  highlightSelected
                />
                <div style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--primary)',
                  marginTop: 10, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(2,132,199,0.08)', border: '1px solid rgba(2,132,199,0.25)',
                  display: 'flex', alignItems: 'center', gap: 7
                }}>
                  <span style={{ fontSize: 14 }}>ℹ</span>
                  <span>{t('documents.companyScopeHint', 'Documents are matched only against employees of this company.')}</span>
                </div>
              </div>

              {/* What the system noticed about this batch, before anything is
                  written. Warnings never block - they inform. */}
              {validationNotices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {validationNotices.map((notice, idx) => {
                    const palette = notice.tone === 'danger'
                      ? { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.3)', fg: '#B91C1C', icon: '⛔' }
                      : notice.tone === 'warning'
                        ? { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.35)', fg: '#B45309', icon: '⚠' }
                        : notice.tone === 'success'
                          ? { bg: 'rgba(16,185,129,0.09)', border: 'rgba(16,185,129,0.3)', fg: '#15803D', icon: '✓' }
                          : { bg: 'rgba(2,132,199,0.08)', border: 'rgba(2,132,199,0.3)', fg: '#0369A1', icon: 'ℹ' };
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 13px', borderRadius: 10, fontSize: 12.5,
                          background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg,
                          display: 'flex', alignItems: 'flex-start', gap: 9,
                        }}
                      >
                        <span aria-hidden style={{ flexShrink: 0, fontSize: 14, lineHeight: 1.2 }}>{palette.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{notice.title}</div>
                          {notice.detail && <div style={{ marginTop: 2, fontWeight: 500, lineHeight: 1.45 }}>{notice.detail}</div>}
                        </div>
                        {notice.action && (
                          <button
                            onClick={notice.action.onClick}
                            style={{
                              flexShrink: 0, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                              border: `1px solid ${palette.border}`, background: 'var(--surface)',
                              color: palette.fg, fontSize: 11, fontWeight: 700,
                            }}
                          >
                            {notice.action.label}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                {/* Batch settings. These apply to every document unless a
                    document overrides them below. */}
                <div style={{ padding: '14px 16px', background: 'var(--background)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 13 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('documents.batchSettings', 'Settings for all documents')}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={labelStyle}>{t('documents.requiresSignature')}</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <SegmentButton active={globalRequiresSignature} tone="success" onClick={() => handleGlobalSignature(true)}>
                          {t('common.yes')}
                        </SegmentButton>
                        <SegmentButton active={!globalRequiresSignature} tone="neutral" onClick={() => handleGlobalSignature(false)}>
                          {t('common.no')}
                        </SegmentButton>
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>{t('documents.visibility')}</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <SegmentButton active={globalVisibility === 'everyone'} tone="info" onClick={() => handleGlobalVisibility('everyone')}>
                          {t('documents.visibilityEveryone')}
                        </SegmentButton>
                        <SegmentButton active={globalVisibility === 'hr'} tone="purple" onClick={() => handleGlobalVisibility('hr')}>
                          {t('documents.visibilityHR')}
                        </SegmentButton>
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>
                        {t('documents.expiryDate')} <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>({t('common.optional', 'optional')})</span>
                      </label>
                      <DatePicker value={globalExpiresAt} onChange={handleGlobalExpiry} />
                    </div>

                    {/* Category */}
                    {globalCompanyId && (
                      <div>
                        <label style={labelStyle}>
                          {t('documents.category', 'Categoria')} <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>({t('common.optional', 'optional')})</span>
                        </label>
                        {categories.length > 0 ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                              <CustomSelect
                                value={globalCategory || null}
                                onChange={(val) => handleGlobalCategory(val || '')}
                                options={categories.filter(c => c.isActive !== false).map(c => {
                                  const { icon, name: catLabel } = splitCategoryName(c.name);
                                  return { value: c.name, label: `${icon} ${catLabel}` };
                                })}
                                placeholder={t('documents.selectCategory', 'Seleziona categoria...')}
                                isClearable={true}
                                searchable={true}
                                controlMinHeight={38}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowCategoryModal(true)}
                              style={{
                                padding: '8px 12px', borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--surface-warm)',
                                color: 'var(--text-secondary)',
                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s',
                              }}
                            >
                              {t('documents.manageCategories', 'Gestisci')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowCategoryModal(true)}
                            style={{
                              padding: '8px 14px', borderRadius: 8,
                              border: '1px dashed var(--border)',
                              background: 'var(--surface-warm)',
                              color: 'var(--primary)',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              width: '100%', textAlign: 'center', height: 38
                            }}
                          >
                            + {t('documents.createFirstCategory', 'Crea la prima categoria')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Documents, grouped by the company their names point at.
                    A single-company batch renders as one plain list. */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--background)', overflow: 'hidden' }}>
                  <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                      {t('documents.documentsHeader', 'Documents')}
                      <span style={{ marginLeft: 6, color: 'var(--primary)' }}>{files.length}</span>
                      {analysing && (
                        <span style={{ marginLeft: 8, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>
                          · {t('documents.analysing', 'checking names…')}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setStep(1)}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 11.5, cursor: 'pointer', fontWeight: 700 }}
                    >
                      + {t('documents.addOrChangeFiles', 'Add / change files')}
                    </button>
                  </div>

                  <div style={{ maxHeight: 400, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {documentsByDetectedCompany.map(group => (
                      <div key={String(group.companyId)}>
                        {/* Only label the groups when there is more than one -
                            a single-company batch needs no heading at all. */}
                        {(spansMultipleCompanies || (group.companyId == null && documentsByDetectedCompany.length > 1)) && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, padding: '6px 8px',
                            borderRadius: 8,
                            background: group.isSelected ? 'rgba(16,185,129,0.09)' : group.companyId == null ? 'var(--surface)' : 'rgba(245,158,11,0.08)',
                            border: `1px solid ${group.isSelected ? 'rgba(16,185,129,0.3)' : group.companyId == null ? 'var(--border)' : 'rgba(245,158,11,0.3)'}`,
                          }}>
                            {group.companyId != null
                              ? <CompanyAvatar company={companies.find(c => c.id === group.companyId)} size={20} />
                              : <span aria-hidden style={{ fontSize: 14 }}>❓</span>}
                            <span style={{
                              flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700,
                              color: group.isSelected ? '#15803D' : group.companyId == null ? 'var(--text-muted)' : '#B45309',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {group.companyName}
                              {group.isSelected && ` · ${t('documents.selectedCompanyTag', 'selected')}`}
                            </span>
                            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              {group.items.length}
                            </span>
                            {!group.isSelected && group.canSwitchTo && (
                              <button
                                onClick={() => handleGlobalCompany(group.companyId)}
                                style={{
                                  flexShrink: 0, padding: '2px 9px', borderRadius: 6, cursor: 'pointer',
                                  border: '1px solid rgba(245,158,11,0.4)', background: 'var(--surface)',
                                  color: '#B45309', fontSize: 10.5, fontWeight: 700,
                                }}
                              >
                                {t('documents.useThisCompany', 'Use this company')}
                              </button>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {group.items.map(item => {
                            const config = describeItemConfig(item);
                            const detected = globalMatches.get(item.file.name);
                            return (
                              <div
                                key={item.id}
                                style={{
                                  borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
                                  overflow: item.expanded ? 'visible' : 'hidden',
                                  position: 'relative', zIndex: item.expanded ? 20 : 1,
                                }}
                              >
                                <div
                                  onClick={() => toggleExpandItem(item.id)}
                                  style={{ padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                                >
                                  <FileTypeIcon filename={item.file.name} size={32} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {item.file.name}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span>{formatFileSize(item.sizeBytes ?? item.file.size)}</span>
                                      {detected?.employee && (
                                        <>
                                          <span>·</span>
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {formatEmployeeName(detected.employee)}
                                          </span>
                                        </>
                                      )}
                                      {!detected?.employee && detected?.outcome === 'ambiguous' && (
                                        <>
                                          <span>·</span>
                                          <span style={{ color: '#B45309' }}>{t('documents.severalMatch', 'several people match')}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {/* A tag says what settings this document ended up
                                      with. The old "use global" checkbox asked the
                                      operator to manage state instead of showing it. */}
                                  <StatusTag tone={config.tone} icon={config.icon} title={config.title}>
                                    {config.label}
                                  </StatusTag>
                                  <div style={{ transform: item.expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                                    <IconChevronDown />
                                  </div>
                                </div>

                                {item.expanded && (
                                  <div style={{ padding: '13px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 13, background: 'var(--background)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {item.useGlobal
                                          ? t('documents.followingBatchSettings', 'Following the batch settings')
                                          : t('documents.overridingBatchSettings', 'Overriding the batch settings')}
                                      </span>
                                      {!item.useGlobal && (
                                        <button
                                          onClick={() => toggleItemGlobal(item.id, true)}
                                          style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                        >
                                          {t('documents.resetToBatch', 'Reset to batch settings')}
                                        </button>
                                      )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 13 }}>
                                      <div>
                                        <label style={labelStyle}>{t('documents.requiresSignature')}</label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                          <SegmentButton active={item.requiresSignature} tone="success" onClick={() => updateIndividualItem(item.id, { requiresSignature: true, useGlobal: false })}>
                                            {t('common.yes')}
                                          </SegmentButton>
                                          <SegmentButton active={!item.requiresSignature} tone="neutral" onClick={() => updateIndividualItem(item.id, { requiresSignature: false, useGlobal: false })}>
                                            {t('common.no')}
                                          </SegmentButton>
                                        </div>
                                      </div>

                                      <div>
                                        <label style={labelStyle}>{t('documents.visibility')}</label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                          <SegmentButton active={item.visibility === 'everyone'} tone="info" onClick={() => updateIndividualItem(item.id, { visibility: 'everyone', useGlobal: false })}>
                                            {t('documents.visibilityEveryone')}
                                          </SegmentButton>
                                          <SegmentButton active={item.visibility === 'hr'} tone="purple" onClick={() => updateIndividualItem(item.id, { visibility: 'hr', useGlobal: false })}>
                                            {t('documents.visibilityHR')}
                                          </SegmentButton>
                                        </div>
                                      </div>

                                      <div>
                                        <label style={labelStyle}>{t('documents.expiryDate')}</label>
                                        <DatePicker
                                          value={item.expiresAt}
                                          onChange={val => updateIndividualItem(item.id, { expiresAt: val, useGlobal: false })}
                                        />
                                      </div>

                                      <div style={{ position: 'relative', zIndex: 30 }}>
                                        <label style={labelStyle}>{t('companies.company', 'Company')} <span style={{ color: '#DC2626' }}>*</span></label>
                                        <CustomSelect
                                          value={item.companyId ? String(item.companyId) : null}
                                          onChange={(val) => updateIndividualItem(item.id, { companyId: val ? Number(val) : null, useGlobal: false })}
                                          options={companySelectOptions}
                                          placeholder={t('companies.selectCompany', 'Select Company')}
                                          isClearable={false}
                                          showCheck={false}
                                          highlightSelected
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : step === 3 && matching ? (
            // Matching runs on entering this step and again after any company
            // change, so it gets its own screen rather than silently swapping
            // the rows underneath the operator.
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 320, gap: 16, padding: '0 28px',
            }}>
              <div style={{ fontSize: 34, animation: 'pulse 1s infinite' }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>
                {t('documents.matchingTitle', 'Matching documents to employees…')}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 420, lineHeight: 1.5 }}>
                {t('documents.matchingSubtitle', 'Reading each filename and comparing it with the employees of {{company}}.', {
                  company: companies.find(c => c.id === globalCompanyId)?.name ?? t('companies.company', 'the selected company'),
                })}
              </div>
              <div style={{ width: '100%', maxWidth: 340, height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{
                  width: '40%', height: '100%', borderRadius: 999,
                  background: 'linear-gradient(90deg, var(--primary), #10B981)',
                  animation: 'indeterminateSlide 1.1s ease-in-out infinite',
                }} />
              </div>
            </div>
          ) : step === 3 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Assignment progress: the one number that tells an operator
                  where they stand, in words rather than jargon. */}
              <div style={{ padding: '12px 16px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('documents.assignProgress', '{{done}} of {{total}} documents assigned', { done: resolvedCount, total: totalToAssign })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: problems.length > 0 ? '#B45309' : '#15803D' }}>
                    {problems.length > 0
                      ? t('documents.needAttentionCount', '{{count}} need your attention', { count: problems.length })
                      : t('documents.allResolved', 'Nothing left to review')}
                  </div>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${assignPercent}%`, height: '100%', borderRadius: 999,
                    background: assignPercent === 100
                      ? 'linear-gradient(90deg, #10B981, #15803D)'
                      : 'linear-gradient(90deg, var(--primary), #10B981)',
                    transition: 'width 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
                  }} />
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 280px',
                gap: 14,
                alignItems: 'start'
              }}>
                {/* ── MAIN: the documents grouped by company ── */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--background)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                    {t('documents.documentsHeader', 'Documents')} ({unmatchedDocs.length})
                  </div>
                  <div style={{ maxHeight: 440, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {Array.from(new Map(unmatchedDocs.map(d => [d.companyId ?? null, companies.find(c => c.id === d.companyId)?.name ?? t('documents.unknownCompany', 'Unknown Company')])).entries()).map(([compKeyId, compKeyName]) => {
                      const groupDocs = unmatchedDocs.filter(d => (d.companyId ?? null) === compKeyId);
                      const groupCompanyObj = compKeyId ? companies.find(c => c.id === compKeyId) : null;
                      const hasMultipleCompanyGroups = new Set(unmatchedDocs.map(d => d.companyId)).size > 1;

                      return (
                        <div key={String(compKeyId)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {hasMultipleCompanyGroups && (
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                              borderRadius: 8, background: 'rgba(2,132,199,0.08)', border: '1px solid rgba(2,132,199,0.25)',
                              fontSize: 12, fontWeight: 700, color: 'var(--primary)'
                            }}>
                              <CompanyAvatar company={groupCompanyObj} size={20} />
                              <span>{compKeyName}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                {groupDocs.length} {t('documents.documentsCount', 'document(s)')}
                              </span>
                            </div>
                          )}
                          {groupDocs.map(doc => {
                            const isResolved = doc.manualEmployeeId != null;
                            const isFocused = focusedDocId === doc.documentId;
                            const assignedEmployee = doc.manualEmployeeId != null
                              ? employees.find(e => e.id === doc.manualEmployeeId)
                              : undefined;
                            const mismatchWarning = describeAssignmentMismatch(doc);
                            const otherCompanyHint = explainSuggestions(doc);
                            return (
                              <div
                                key={doc.documentId}
                                ref={isFocused ? focusedRowRef : undefined}
                                style={{
                                  padding: 10, borderRadius: 10, background: 'var(--surface)',
                                  border: `1px solid ${isFocused ? 'var(--primary)' : isResolved ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.4)'}`,
                                  boxShadow: isFocused ? '0 0 0 3px rgba(2,132,199,0.15)' : 'none',
                                  transition: 'border-color 0.2s, box-shadow 0.2s'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                  <FileTypeIcon filename={doc.fileName} size={32} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {doc.fileName}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatFileSize(doc.sizeBytes)}</div>
                                  </div>
                                  <StatusTag
                                    tone={isResolved ? 'success' : 'warning'}
                                    icon={isResolved ? (doc.isAutoMatched ? '⚡' : '✓') : '⚠'}
                                  >
                                    {isResolved
                                      ? (doc.isAutoMatched ? t('documents.badgeAuto', 'Auto') : t('documents.badgeManual', 'Manual'))
                                      : t('documents.badgeUnassigned', 'Unassigned')}
                                  </StatusTag>
                                </div>

                                <div style={{ height: 1, background: 'var(--border)', margin: '9px 0' }} />

                                <div style={{ display: 'flex', gap: 9, flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch' }}>
                                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 17 }}>
                                      <label style={{ ...labelStyle, marginBottom: 0 }}>{t('documents.fileName')}</label>
                                      {doc.reason && isResolved && (
                                        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                          {doc.reason === 'unique_id'
                                            ? t('documents.matchedById', 'Matched by ID')
                                            : doc.isAutoMatched
                                              ? t('documents.matchedByName', 'Matched by name')
                                              : t('documents.chosenManually', 'Chosen manually')}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      style={{
                                        marginTop: 6, display: 'flex', alignItems: 'center',
                                        border: '1px solid var(--border)', borderRadius: 8,
                                        background: 'var(--background)', height: 38, overflow: 'hidden',
                                      }}
                                    >
                                      <input
                                        value={doc.editableTitle}
                                        onChange={e => handleUnmatchedTitleChange(doc.documentId, e.target.value)}
                                        style={{
                                          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                                          padding: '0 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit',
                                        }}
                                      />
                                      <span
                                        style={{
                                          flexShrink: 0, padding: '0 10px', fontSize: 11.5, fontWeight: 700,
                                          color: 'var(--text-muted)', background: 'var(--surface)',
                                          borderLeft: '1px solid var(--border)', height: '100%',
                                          display: 'inline-flex', alignItems: 'center',
                                        }}
                                      >
                                        {doc.fileExtension}
                                      </span>
                                    </div>
                                  </div>

                                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 17 }}>
                                      <label style={{ ...labelStyle, marginBottom: 0 }}>{t('documents.assigned')}</label>
                                      {assignedEmployee && (
                                        <RoleTag role={assignedEmployee.role} label={t(`roles.${assignedEmployee.role}`, assignedEmployee.role)} />
                                      )}
                                    </div>
                                    <div style={{ marginTop: 6 }}>
                                      <CustomSelect
                                        value={doc.manualEmployeeId ? String(doc.manualEmployeeId) : ''}
                                        onChange={(val) => handleUnmatchedEmpChange(doc.documentId, val ? Number(val) : null)}
                                        options={getUnmatchedEmpOptions(doc.companyId)}
                                        placeholder={t('documents.selectEmployee', 'Select Employee...')}
                                        disabled={loadingEmps}
                                        isClearable={true}
                                        searchable={true}
                                        showCheck={false}
                                        highlightSelected
                                        menuMaxHeight={220}
                                        controlMinHeight={38}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* An assignment whose name does not match the
                                    filename is allowed, but never silent. Spans
                                    the whole row rather than sitting under one
                                    field, and clears as soon as the filename is
                                    edited to match. */}
                                {isResolved && mismatchWarning && (
                                  <div style={{
                                    marginTop: 9, padding: '7px 9px', borderRadius: 8,
                                    background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.28)',
                                    display: 'flex', alignItems: 'flex-start', gap: 7,
                                    fontSize: 11, fontWeight: 600, color: '#B91C1C',
                                  }}>
                                    <span aria-hidden style={{ flexShrink: 0 }}>⚠</span>
                                    <span>{mismatchWarning}</span>
                                  </div>
                                )}

                                {!isResolved && (
                                  <div style={{ marginTop: 9, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                                    <div style={{ fontSize: 11, color: '#B45309', fontWeight: 600, marginBottom: (doc.suggestions?.length ?? 0) > 0 ? 6 : 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                      <span aria-hidden style={{ flexShrink: 0 }}>⚠</span>
                                      <span>
                                        {describeMatchReason(doc.reason, doc.suggestions?.length ?? 0, t)}
                                        {otherCompanyHint ? ` — ${otherCompanyHint}` : ''}
                                      </span>
                                    </div>
                                    {(doc.suggestions?.length ?? 0) > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                          {t('documents.didYouMean', 'Did you mean')}
                                        </span>
                                        {doc.suggestions!.slice(0, 4).map(s => (
                                          <button
                                            key={s.id}
                                            onClick={() => handleUnmatchedEmpChange(doc.documentId, s.id)}
                                            title={describeMatchReason(s.reason as MatchReason, 0, t)}
                                            style={{
                                              display: 'inline-flex', alignItems: 'center', gap: 5,
                                              padding: '3px 9px 3px 4px', borderRadius: 999, cursor: 'pointer',
                                              border: '1px solid var(--border)', background: 'var(--background)',
                                              color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600
                                            }}
                                          >
                                            <PersonAvatar
                                              name={s.name}
                                              surname={s.surname}
                                              avatarFilename={employees.find(e => e.id === s.id)?.avatarFilename}
                                              size={18}
                                            />
                                            {formatEmployeeName(s)}
                                            {s.companyId !== doc.companyId && (
                                              <span style={{ color: '#B45309' }}>
                                                · {companies.find(c => c.id === s.companyId)?.name ?? t('documents.otherCompanyShort', 'other company')}
                                              </span>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── RIGHT: everything that needs a human decision ── */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--background)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{t('documents.needsAttention', 'Needs attention')}</span>
                    {problems.length > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>
                        {problems.length}
                      </span>
                    )}
                  </div>
                  <div style={{ maxHeight: 420, overflowY: 'auto', padding: 8 }}>
                    {problems.length === 0 ? (
                      <div style={{ padding: '12px 6px', fontSize: 12, color: '#15803D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>✓</span>
                        {t('documents.noProblems', 'Everything is assigned and nothing was skipped.')}
                      </div>
                    ) : problems.map((p, idx) => (
                      <button
                        key={`${p.kind}-${p.label}-${idx}`}
                        onClick={() => p.documentId != null && setFocusedDocId(p.documentId)}
                        style={{
                          width: '100%', textAlign: 'left', display: 'block', marginBottom: 6,
                          padding: '8px 9px', borderRadius: 8, border: '1px solid var(--border)',
                          background: 'var(--surface)', cursor: p.documentId != null ? 'pointer' : 'default'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 12 }}>
                            {p.kind === 'skipped' ? '⊘' : p.kind === 'duplicate' ? '⧉' : '⚠'}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.detail}</div>
                        {p.extra && (
                          <div style={{ fontSize: 10.5, color: '#B45309', lineHeight: 1.4, marginTop: 3, fontWeight: 600 }}>
                            {p.extra}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : step === 4 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Alert Message Bar */}
              <div style={{ padding: '12px 16px', background: 'rgba(21,128,61,0.1)', border: '1px solid rgba(21,128,61,0.3)', borderRadius: 10, fontSize: 13, color: '#15803D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>✓</span>
                {t('documents.confirmTitle', 'Review and confirm document upload details')}
              </div>

              {/* Plain-language outcome of the whole batch. Deliberately states
                  what was NOT done as prominently as what was. */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { key: 'assigned', value: summaryCounts.assigned, label: t('documents.summaryAssigned', 'Assigned'), color: '#15803D', bg: 'rgba(21,128,61,0.1)' },
                  { key: 'unassigned', value: summaryCounts.unassigned, label: t('documents.summaryUnassigned', 'Left unassigned'), color: '#B45309', bg: 'rgba(245,158,11,0.1)' },
                  { key: 'skipped', value: summaryCounts.skipped, label: t('documents.summarySkipped', 'Skipped'), color: 'var(--text-muted)', bg: 'var(--background)' },
                  { key: 'duplicates', value: summaryCounts.duplicates, label: t('documents.summaryDuplicates', 'Duplicates'), color: 'var(--text-muted)', bg: 'var(--background)' },
                ].map(card => (
                  <div key={card.key} style={{ padding: '10px 12px', borderRadius: 10, background: card.bg, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: card.color, lineHeight: 1.1 }}>{card.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{card.label}</div>
                  </div>
                ))}
              </div>

              {summaryCounts.skipped > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    {t('documents.skippedHeader', 'Not imported (unsupported format)')}
                  </div>
                  {skippedFiles.map(s => (
                    <div key={s.fileName} style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>⊘ {s.fileName}</div>
                  ))}
                </div>
              )}

              {summaryCounts.unassigned > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309', marginBottom: 4 }}>
                    {t('documents.unassignedHeader', 'These stay unassigned until someone matches them')}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#B45309' }}>
                    {t('documents.unassignedHelp', 'They will not appear in any employee\'s personal area and no signature will be requested.')}
                  </div>
                </div>
              )}

              {/* Uploaded Documents List */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--background)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 13px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                  {t('documents.documentsHeader', 'Documents')}
                  <span style={{ marginLeft: 6, color: 'var(--primary)' }}>{uploadedDocs.length}</span>
                </div>
                <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {uploadedDocs.map(doc => {
                    const assignedEmployee = doc.assignedEmployeeId != null
                      ? employees.find(e => e.id === doc.assignedEmployeeId)
                      : undefined;
                    const company = companies.find(c => c.id === doc.companyId);
                    return (
                      <div
                        key={doc.documentId}
                        style={{
                          borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
                          padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                        }}
                      >
                        <FileTypeIcon filename={doc.fileName} size={32} />

                        <div style={{ flex: '1 1 190px', minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.fileName}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                            <CompanyAvatar company={company} size={14} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.companyName}</span>
                          </div>
                        </div>

                        {/* Who it goes to. An unassigned document is called out
                            rather than shown as an empty cell. */}
                        <div style={{ flex: '1 1 170px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                          {assignedEmployee ? (
                            <>
                              <PersonAvatar
                                name={assignedEmployee.name}
                                surname={assignedEmployee.surname}
                                avatarFilename={assignedEmployee.avatarFilename}
                                size={24}
                              />
                              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {formatEmployeeName(assignedEmployee)}
                              </span>
                              <RoleTag role={assignedEmployee.role} label={t(`roles.${assignedEmployee.role}`, assignedEmployee.role)} />
                            </>
                          ) : (
                            <StatusTag tone="warning" icon="⚠">
                              {t('documents.badgeUnassigned', 'Unassigned')}
                            </StatusTag>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          {doc.requiresSignature && (
                            <StatusTag tone="info" icon="✍" title={t('documents.requiresSignature')}>
                              {t('documents.signatureRequiredShort', 'Signature')}
                            </StatusTag>
                          )}
                          {doc.visibility === 'hr' && (
                            <StatusTag tone="neutral" icon="🔒" title={t('documents.visibility')}>
                              {t('documents.visibilityHR')}
                            </StatusTag>
                          )}
                          {doc.expiresAt && (
                            <StatusTag tone="neutral" icon="⏳" title={t('documents.expiryDate')}>
                              {doc.expiresAt}
                            </StatusTag>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 'auto' }}>
                          <IconButton title={t('common.view', 'View')} tone="primary" onClick={() => openPreview(doc)}>
                            <Eye size={15} />
                          </IconButton>
                          <IconButton title={t('common.remove', 'Remove')} tone="danger" onClick={() => handleRemoveDocument(doc.documentId)}>
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          background: 'var(--background)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as any)}
              disabled={uploading}
              data-testid="wizard-back-button"
              style={{
                padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-secondary)', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                opacity: uploading ? 0.6 : 1
              }}
            >
              {t('common.back', 'Back')}
            </button>
          ) : <div />}

          {step === 1 ? (
            <button onClick={handleSafeClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {t('common.cancel', 'Cancel')}
            </button>
          ) : step === 2 ? (
            <button
              onClick={handleSubmit}
              disabled={uploading}
              data-testid="wizard-submit-button"
              style={{
                padding: '8px 22px', borderRadius: 8, border: 'none', background: 'var(--primary)',
                color: '#fff', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                opacity: uploading ? 0.7 : 1, transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(13,33,55,0.18)'
              }}
            >
              {uploading ? t('common.loading') : t('common.next', 'Next')}
            </button>
          ) : step === 3 ? (
            <button
              onClick={handleStep3Save}
              style={{
                padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)',
                color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(13,33,55,0.18)'
              }}
            >
              {t('common.save')}
            </button>
          ) : step === 4 ? (
            <button
              onClick={handleConfirmSave}
              disabled={uploading}
              style={{
                padding: '8px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)',
                color: '#fff', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                opacity: uploading ? 0.7 : 1, transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(13,33,55,0.18)'
              }}
            >
              {uploading ? t('common.loading') : t('common.confirm', 'Confirm')}
            </button>
          ) : null}
        </div>
      </div>

      {/* Preview Modal Overlay (Stops bubbling to keep wizard open) */}
      {(previewDocUrl || previewLoading) && (
        <div onClick={e => e.stopPropagation()}>
          <ModalBackdrop onClose={closePreview} width={800}>
            <ModalHeader title={previewDocName} onClose={closePreview} />
            <div style={{ width: '100%', height: '75vh', background: 'var(--background)', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {previewLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, animation: 'pulse 1s infinite' }}>📄</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t('common.loading', 'Loading document preview...')}</div>
                </div>
              ) : previewDocUrl ? (
                ['zip', 'rar', '7z'].some(ext => previewDocName.toLowerCase().endsWith(`.${ext}`)) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
                    <div style={{ fontSize: 48 }}>📦</div>
                    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('documents.previewArchiveTitle', 'Archive preview is not supported')}
                    </h4>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400 }}>
                      {t('documents.previewArchiveText', 'To view the contents of this archive, please download and extract the file.')}
                    </p>
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = previewDocUrl;
                        link.setAttribute('download', previewDocName);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                      }}
                      style={{
                        padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)',
                        color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(2,132,199,0.2)'
                      }}
                    >
                      {t('documents.download', 'Download')}
                    </button>
                  </div>
                ) : previewDocMimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].some(ext => previewDocName.toLowerCase().endsWith(`.${ext}`)) ? (
                  <img
                    src={previewDocUrl}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    alt={previewDocName}
                  />
                ) : (
                  <iframe
                    src={previewDocUrl}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title={previewDocName}
                  />
                )
              ) : null}
            </div>
          </ModalBackdrop>
        </div>
      )}

      {showCategoryModal && (
        <CategoriesModal
          onClose={() => {
            setShowCategoryModal(false);
            // Refresh categories after managing them
            if (globalCompanyId) {
              getCategories(false)
                .then(all => setCategories(all.filter(c => c.companyId === globalCompanyId)))
                .catch(() => {});
            }
          }}
        />
      )}
    </div>,
    document.body
  );
};
