import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  downloadDocumentGeneric,
  deleteDocument,
  signDocument,
  restoreDocument,
  permanentlyDeleteDocument,
  EmployeeDocument,
  DocumentCategory,
  getDocumentPreviewUrlGeneric
} from '../../../api/documents';
import { IconDownload, IconPen, IconTrash, IconRestore, mimeIcon, IconEye, ModalBackdrop, ModalHeader, IconDots } from './DocUtils';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { Pagination } from '../../../components/ui/Pagination';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { PersonAvatar, IconButton, FileTypeIcon, StatusTag } from './DocumentUiKit';
import { CheckSquare } from 'lucide-react';

interface DocumentsTableProps {
  docs: EmployeeDocument[];
  categories: DocumentCategory[];
  onRefresh: () => void;
  isTrash?: boolean;
  onEditDoc?: (doc: EmployeeDocument) => void;
  selectionMode?: boolean;
  setSelectionMode?: (val: boolean) => void;
}

export const DocumentsTable: React.FC<DocumentsTableProps> = ({ 
  docs, 
  categories, 
  onRefresh, 
  isTrash = false,
  onEditDoc,
  selectionMode: externalSelectionMode,
  setSelectionMode: externalSetSelectionMode,
}) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();

  const canManage = ['super_admin', 'admin', 'hr'].includes(user?.role || '');
  const isEmployee = user?.role === 'employee';

  const [internalSelectionMode, setInternalSelectionMode] = useState(false);
  const selectionMode = externalSelectionMode !== undefined ? externalSelectionMode : internalSelectionMode;
  const setSelectionMode = externalSetSelectionMode || setInternalSelectionMode;

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const [signingDoc, setSigningDoc] = useState<any | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<any | null>(null);
  const [deletingPermanentDoc, setDeletingPermanentDoc] = useState<any | null>(null);
  const [signing, setSigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingPermanent, setDeletingPermanent] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState<string>('');
  const [previewDocMimeType, setPreviewDocMimeType] = useState<string>('');
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  // Text content for formats an iframe cannot render (XML, TXT, CSV).
  const [previewText, setPreviewText] = useState<string>('');
  const [previewTextLoading, setPreviewTextLoading] = useState(false);
  const pageSize = 10;

  const handleBulkRestore = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    let failed = 0;
    for (const id of ids) {
      try {
        const targetDoc = docs.find(d => d.id === id);
        const source = (targetDoc as any)?.source || 'employee_documents';
        await restoreDocument(id, source);
      } catch { failed++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (failed > 0) {
      showToast(t('documents.bulkRestorePartialFail', 'Restored with {{failed}} errors', { failed }), 'error');
    } else {
      showToast(t('documents.bulkRestoreSuccess', 'Selected documents restored successfully'), 'success');
    }
    onRefresh();
  };

  useEffect(() => {
    const handleScrollOrResize = () => {
      if (openMenuId !== null) {
        setOpenMenuId(null);
        setMenuPos(null);
      }
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [openMenuId]);

  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, docId: number) => {
    e.stopPropagation();
    if (openMenuId === docId) {
      setOpenMenuId(null);
      setMenuPos(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: Math.max(10, window.innerWidth - rect.right)
      });
      setOpenMenuId(docId);
    }
  };

  // Read the blob behind a text-like preview so it can be shown as text.
  // Capped so a huge export cannot lock the browser up.
  useEffect(() => {
    if (!previewDocUrl) { setPreviewText(''); return; }
    const isText = ['xml', 'txt', 'csv'].some(ext => previewDocName.toLowerCase().endsWith(`.${ext}`))
      || ['application/xml', 'text/xml', 'text/plain', 'text/csv'].includes(previewDocMimeType);
    if (!isText) { setPreviewText(''); return; }

    let cancelled = false;
    const MAX_CHARS = 200_000;
    setPreviewTextLoading(true);
    fetch(previewDocUrl)
      .then(r => r.text())
      .then(text => {
        if (cancelled) return;
        setPreviewText(text.length > MAX_CHARS
          ? `${text.slice(0, MAX_CHARS)}\n\n… ${t('documents.previewTruncated', 'truncated — download the file to see the rest')}`
          : text);
      })
      .catch(() => { if (!cancelled) setPreviewText(t('documents.previewTextError', 'Could not read this file as text.')); })
      .finally(() => { if (!cancelled) setPreviewTextLoading(false); });

    return () => { cancelled = true; };
  }, [previewDocUrl, previewDocName, previewDocMimeType, t]);

  // Keep the current page valid as the list changes. Snapping back to page 1
  // on every refresh means deleting a row on page 3 throws the operator back to
  // the start; only clamp when the current page no longer exists.
  useEffect(() => {
    const pages = Math.max(1, Math.ceil(docs.length / pageSize));
    setCurrentPage(prev => Math.min(prev, pages));
  }, [docs.length, pageSize]);

  // A genuine change of filter or search does reset to the first page. Detected
  // by the *set* of ids changing rather than merely its length.
  const prevDocIdsRef = useRef<string>('');
  useEffect(() => {
    const ids = docs.map(d => d.id).sort((a, b) => a - b).join(',');
    if (prevDocIdsRef.current === '') { prevDocIdsRef.current = ids; return; }
    if (prevDocIdsRef.current !== ids) {
      const previous = new Set(prevDocIdsRef.current.split(',').filter(Boolean));
      const next = docs.map(d => String(d.id));
      // Rows only removed => a delete, keep the page. Anything else => reset.
      const onlyRemovals = next.every(id => previous.has(id));
      prevDocIdsRef.current = ids;
      if (!onlyRemovals) setCurrentPage(1);
    }
  }, [docs]);

  // Leaving selection mode, or the row set changing, must not leave stale ids.
  useEffect(() => {
    if (!selectionMode) { setSelectedIds(new Set()); return; }
    setSelectedIds(prev => {
      const alive = new Set(docs.map(d => d.id));
      const next = new Set(Array.from(prev).filter(id => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectionMode, docs]);

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    let failed = 0;
    for (const id of ids) {
      try {
        // Same call as a single delete, so bulk removal is a soft delete and
        // lands in the archive exactly like one-by-one deletion.
        await deleteDocument(id);
      } catch { failed++; }
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    setSelectedIds(new Set());
    setSelectionMode(false);
    if (failed > 0) {
      showToast(t('documents.bulkDeletePartial', '{{done}} moved to archive, {{failed}} could not be deleted', { done: ids.length - failed, failed }), 'error');
    } else {
      showToast(t('documents.bulkDeleteDone', '{{count}} document(s) moved to the archive', { count: ids.length }), 'success');
    }
    onRefresh();
  };

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const lang = i18n.language || 'it';
    return new Date(iso).toLocaleDateString(lang.startsWith('it') ? 'it-IT' : 'en-US');
  }

  const handleDownload = async (doc: any) => {
    try { 
      const name = doc.fileName || doc.title || 'document';
      await downloadDocumentGeneric(doc.id, name, doc.sourceTable); 
    }
    catch { showToast(t('documents.errorLoad'), 'error'); }
  };

  const handlePreview = async (doc: any) => {
    setPreviewLoadingId(doc.id);
    try {
      const fileName = doc.fileName || doc.title || '';
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      let mimeType = doc.mimeType || doc.mime_type;

      // Fallback detection if mimeType is missing or generic
      if (!mimeType || mimeType === 'application/octet-stream') {
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
          mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
        } else if (extension === 'pdf') {
          mimeType = 'application/pdf';
        }
      }

      const finalMimeType = mimeType || 'application/pdf';
      const url = await getDocumentPreviewUrlGeneric(doc.id, finalMimeType, doc.sourceTable);
      setPreviewDocUrl(url);
      setPreviewDocName(fileName || 'Preview');
      setPreviewDocMimeType(finalMimeType);
    } catch {
      showToast(t('documents.errorLoad', 'Error loading document'), 'error');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const closePreview = () => {
    if (previewDocUrl) {
      URL.revokeObjectURL(previewDocUrl);
    }
    setPreviewDocUrl(null);
  };

  const handleDeleteClick = (doc: any) => {
    setDeletingDoc(doc);
  };

  const handleConfirmDelete = async () => {
    if (!deletingDoc) return;
    setDeleting(true);
    try { 
      await deleteDocument(deletingDoc.id); 
      showToast(t('documents.deleted'), 'success'); 
      onRefresh(); 
      setDeletingDoc(null);
    }
    catch { showToast(t('documents.errorDelete'), 'error'); }
    finally { setDeleting(false); }
  };

  const handleRestore = async (doc: any) => {
    try {
      await restoreDocument(doc.id, doc.sourceTable || 'employee_documents');
      showToast(t('documents.restoredSuccess', 'Document restored successfully'), 'success');
      onRefresh();
    } catch {
      showToast(t('documents.errorRestore', 'Error restoring document'), 'error');
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deletingPermanentDoc) return;
    setDeletingPermanent(true);
    try {
      await permanentlyDeleteDocument(deletingPermanentDoc.id, deletingPermanentDoc.sourceTable);
      showToast(t('documents.permanentlyDeleted', 'Document permanently deleted'), 'success');
      onRefresh();
      setDeletingPermanentDoc(null);
    } catch {
      showToast(t('documents.errorDelete', 'Error deleting document'), 'error');
    } finally {
      setDeletingPermanent(false);
    }
  };

  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin === true;

  const handleSignClick = (doc: any) => {
    setSigningDoc(doc);
  };

  const handleSignConfirm = async () => {
    if (!signingDoc) return;
    setSigning(true);
    try {
      const now = new Date();
      const signedAt = now.toISOString();
      const lang = i18n.language || 'it';
      const signedAtDisplay = now.toLocaleString(lang.startsWith('it') ? 'it-IT' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        hour12: false
      });
      
      await signDocument(signingDoc.id, lang, signedAt, signedAtDisplay);
      showToast(t('documents.signedSuccess'), 'success');
      setSigningDoc(null);
      onRefresh();
    } catch (err: any) {
      console.error('Sign error:', err);
      showToast(t('documents.errorSign'), 'error');
    } finally {
      setSigning(false);
    }
  };

  const totalDocs = docs.length;
  const totalPages = Math.ceil(totalDocs / pageSize);
  const currentDocs = docs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (docs.length === 0) {
    return (
      <div style={{ padding: '56px 24px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '36px 48px', background: 'var(--background)', border: '1.5px dashed var(--border)', borderRadius: 16, maxWidth: 360 }}>
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.6 }}>📂</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.01em' }}>{t('documents.noDocuments')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{t('documents.noDocumentsHint')}</div>
        </div>
      </div>
    );
  }

  const allOnPageSelected = currentDocs.length > 0 && currentDocs.every((d: any) => selectedIds.has(d.id));
  const canBulkSelect = canManage;

  /** Formats a browser cannot display but that are still readable as text. */
  const isTextPreview = ['xml', 'txt', 'csv'].some(ext => previewDocName.toLowerCase().endsWith(`.${ext}`))
    || ['application/xml', 'text/xml', 'text/plain', 'text/csv'].includes(previewDocMimeType);

  return (
    <>
    {/* Bulk actions bar. Hidden until the operator opts in, so the normal
        one-document-at-a-time flow stays uncluttered. */}
    {canBulkSelect && selectionMode && (
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--background)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 44,
      }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allOnPageSelected}
            onChange={(e) => {
              const ids = currentDocs.map((d: any) => d.id);
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (e.target.checked) ids.forEach((id: number) => next.add(id));
                else ids.forEach((id: number) => next.delete(id));
                return next;
              });
            }}
          />
          {t('documents.selectAllOnPage', 'Select all on this page')}
        </label>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
          {t('documents.nSelected', '{{count}} selected', { count: selectedIds.size })}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          {isTrash ? (
            <>
              <button
                onClick={handleBulkRestore}
                disabled={selectedIds.size === 0 || bulkDeleting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
                  border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#059669',
                  cursor: selectedIds.size === 0 || bulkDeleting ? 'not-allowed' : 'pointer',
                  opacity: selectedIds.size === 0 || bulkDeleting ? 0.5 : 1, fontSize: 12, fontWeight: 700,
                }}
              >
                <IconRestore /> {bulkDeleting ? t('common.loading') : t('documents.restoreSelected', 'Restore selected')}
              </button>
              <button
                onClick={() => setConfirmBulkDelete(true)}
                disabled={selectedIds.size === 0 || bulkDeleting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
                  border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.06)', color: '#DC2626',
                  cursor: selectedIds.size === 0 || bulkDeleting ? 'not-allowed' : 'pointer',
                  opacity: selectedIds.size === 0 || bulkDeleting ? 0.5 : 1, fontSize: 12, fontWeight: 700,
                }}
              >
                <IconTrash /> {bulkDeleting ? t('common.loading') : t('documents.deletePermanentlySelected', 'Permanently delete selected')}
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              disabled={selectedIds.size === 0 || bulkDeleting}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
                border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.06)', color: '#DC2626',
                cursor: selectedIds.size === 0 || bulkDeleting ? 'not-allowed' : 'pointer',
                opacity: selectedIds.size === 0 || bulkDeleting ? 0.5 : 1, fontSize: 12, fontWeight: 700,
              }}
            >
              <IconTrash /> {bulkDeleting ? t('common.loading') : t('documents.moveToArchive', 'Move to archive')}
            </button>
          )}
        </div>
      </div>
    )}

    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-body)' }}>
        <thead>
          <tr style={{ background: '#0d2137' }}>
            {canBulkSelect && selectionMode && (
              <th style={{ padding: '12px 8px 12px 16px', width: 34 }} />
            )}
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
              {t('documents.fileName')}
            </th>
            {(!isEmployee) && (
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                {t('documents.assigned')}
              </th>
            )}
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
              {t('documents.category')}
            </th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
              {t('documents.uploadedOn')}
            </th>
            <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
              {isTrash ? t('documents.deletedOn') : t('documents.expiresOn')}
            </th>
            {!isTrash && (
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
                {t('documents.signature')}
              </th>
            )}
            <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'rgba(255,255,255,0.92)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {currentDocs.map((doc: any) => (
            <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.12s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-warm)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {canBulkSelect && selectionMode && (
                <td style={{ padding: '12px 8px 12px 16px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(doc.id)}
                    onChange={() => toggleSelected(doc.id)}
                    aria-label={t('documents.selectDocument', 'Select document')}
                  />
                </td>
              )}
              <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileTypeIcon filename={doc.fileName || doc.title || ''} size={28} />
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.fileName || doc.title}
                  </span>
                </div>
              </td>
              {(!isEmployee) && (
                <td style={{ padding: '12px 16px' }}>
                  {(() => {
                    const rawName = (doc.employeeName ?? doc.employee_name ?? '').trim();
                    const empSurname = (doc.employeeSurname ?? doc.employee_surname ?? '').trim();

                    let fullEmpName = rawName;
                    if (empSurname && !fullEmpName.toLowerCase().includes(empSurname.toLowerCase())) {
                      fullEmpName = `${fullEmpName} ${empSurname}`.trim();
                    }
                    if (!fullEmpName) {
                      fullEmpName = (doc.employeeFirstName ?? '').trim();
                    }

                    const hasEmp = Boolean(doc.employeeId || doc.employee_id) && Boolean(fullEmpName);
                    const displayEmpName = fullEmpName.length > 24
                      ? `${fullEmpName.slice(0, 24)}...`
                      : fullEmpName;

                    if (hasEmp) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <PersonAvatar
                            name={doc.employeeFirstName ?? rawName.split(' ')[0] ?? ''}
                            surname={empSurname || (rawName.split(' ').length > 1 ? rawName.split(' ').slice(1).join(' ') : '')}
                            avatarFilename={doc.employeeAvatarFilename ?? doc.employee_avatar_filename}
                            size={26}
                          />
                          <span
                            title={fullEmpName}
                            style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {displayEmpName}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>
                        {t('documents.unassigned', 'Non assegnato')}
                      </span>
                    );
                  })()}
                </td>
              )}
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                {(doc.categoryName || doc.category) ? (
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(0,45,91,0.06)', color: 'var(--primary)', fontWeight: 700, border: '1px solid rgba(0,45,91,0.1)' }}>
                    {doc.categoryName || doc.category}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>
                    {t('documents.noCategory')}
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 500 }}>{formatDate(doc.createdAt)}</td>
              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                {isTrash ? (
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{formatDate(doc.deletedAt)}</span>
                ) : doc.expiresAt ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ color: new Date(doc.expiresAt) < new Date() ? '#DC2626' : 'var(--text-secondary)', fontWeight: new Date(doc.expiresAt) < new Date() ? 700 : 500 }}>
                      {formatDate(doc.expiresAt)}
                    </span>
                    {new Date(doc.expiresAt) < new Date() && (
                      <span style={{ 
                        fontSize: 9, padding: '2px 6px', borderRadius: 4, 
                        background: 'rgba(220,38,38,0.1)', color: '#DC2626', 
                        fontWeight: 800, textTransform: 'uppercase', width: 'fit-content',
                        letterSpacing: '0.02em', border: '1px solid rgba(220,38,38,0.2)'
                      }}>
                      {t('documents.expired')}
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </td>
              {!isTrash && (
                <td style={{ padding: '12px 16px' }}>
                  {!doc.requiresSignature ? (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('documents.notRequired')}</span>
                  ) : doc.signedAt ? (
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(21,128,61,0.1)', color: '#15803D', fontWeight: 700 }}>✓ {t('documents.signed')}</span>
                  ) : (
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(201,151,58,0.12)', color: '#C9973A', fontWeight: 700 }}>{t('documents.required')}</span>
                  )}
                </td>
              )}
              <td style={{ padding: isMobile ? '8px 10px' : '12px 14px', position: 'relative' }}>
                <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {isTrash ? (
                    <>
                      <button 
                        onClick={() => handlePreview(doc)} 
                        title={t('common.preview', 'Preview')}
                        disabled={previewLoadingId === doc.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-secondary)', cursor: previewLoadingId === doc.id ? 'wait' : 'pointer', fontSize: 12 }}>
                        {previewLoadingId === doc.id ? '...' : <IconEye />}
                      </button>
                      <button 
                        onClick={() => handleRestore(doc)} 
                        title={t('documents.restore', 'Restore')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: isMobile ? '6px 12px' : '5px 12px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        <IconRestore /> {t('documents.restore', 'Restore')}
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={() => setDeletingPermanentDoc(doc)} 
                          title={t('common.deletePermanently', 'Delete Permanently')}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 6, border: '1px solid #DC262630', background: 'rgba(220,38,38,0.05)', color: '#DC2626', cursor: 'pointer', fontSize: 12 }}>
                          <IconTrash />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Preview is the action operators reach for most, so on a
                          wide screen it gets its own button next to the menu. */}
                      {!isMobile && (
                        <button
                          onClick={() => handlePreview(doc)}
                          title={t('common.preview', 'Preview')}
                          disabled={previewLoadingId === doc.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
                            background: 'var(--surface)', color: 'var(--text-secondary)',
                            cursor: previewLoadingId === doc.id ? 'wait' : 'pointer',
                          }}
                        >
                          {previewLoadingId === doc.id ? '…' : <IconEye />}
                        </button>
                      )}
                      <button
                        onClick={(e) => handleToggleMenu(e, doc.id)}
                        title={t('common.actions', 'Actions')}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', 
                          background: openMenuId === doc.id ? 'var(--background)' : 'var(--surface)', 
                          color: 'var(--text-secondary)', cursor: 'pointer' 
                        }}
                      >
                        <IconDots />
                      </button>
                      {openMenuId === doc.id && menuPos && createPortal(
                        <>
                          <div 
                            style={{ position: 'fixed', inset: 0, zIndex: 99998 }} 
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setMenuPos(null); }} 
                          />
                          <div style={{ 
                            position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 99999, 
                            background: 'var(--surface, #ffffff)', border: '1px solid var(--border)', 
                            borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', 
                            padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                            minWidth: 160, transformOrigin: 'top right', animation: 'fadeIn 0.15s ease'
                          }}>
                            <button 
                              onClick={() => { handlePreview(doc); setOpenMenuId(null); setMenuPos(null); }} 
                              disabled={previewLoadingId === doc.id}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left', fontWeight: 500 }}>
                              <span style={{ opacity: 0.7 }}><IconEye /></span> {t('common.preview', 'Preview')}
                            </button>
                            <button 
                              onClick={() => { handleDownload(doc); setOpenMenuId(null); setMenuPos(null); }} 
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left', fontWeight: 500 }}>
                              <span style={{ opacity: 0.7 }}><IconDownload /></span> {t('documents.download', 'Download')}
                            </button>
                            {onEditDoc && canManage && (
                              <button 
                                onClick={() => { onEditDoc(doc); setOpenMenuId(null); setMenuPos(null); }} 
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left', fontWeight: 500 }}>
                                <span style={{ opacity: 0.7 }}><IconPen /></span> {t('common.edit', 'Edit')}
                              </button>
                            )}
                            {doc.requiresSignature && !doc.signedAt && Number(doc.employeeId || doc.employee_id) === user?.id && (
                              <button 
                                onClick={() => { handleSignClick(doc); setOpenMenuId(null); setMenuPos(null); }} 
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left', fontWeight: 600 }}>
                                <IconPen /> {t('documents.sign', 'Sign')}
                              </button>
                            )}
                            {canManage && (
                              <button 
                                onClick={() => { handleDeleteClick(doc); setOpenMenuId(null); setMenuPos(null); }} 
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'rgba(220,38,38,0.06)', color: '#DC2626', cursor: 'pointer', fontSize: 13, textAlign: 'left', fontWeight: 600, marginTop: 4 }}>
                                <IconTrash /> {t('common.delete', 'Delete')}
                              </button>
                            )}
                          </div>
                        </>,
                        document.body
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {totalPages > 1 && (
      <div style={{
        padding: '4px 20px 8px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        minHeight: '52px'
      }}>
        <div style={{ width: '100%' }}>
          <Pagination 
            page={currentPage}
            pages={totalPages}
            total={totalDocs}
            limit={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    )}

    <ConfirmModal
      open={confirmBulkDelete}
      title={t('documents.moveToArchive', 'Move to archive')}
      message={t('documents.bulkDeleteConfirm', '{{count}} document(s) will be moved to the archive. You can restore them from there.', { count: selectedIds.size })}
      onConfirm={handleBulkDelete}
      onCancel={() => setConfirmBulkDelete(false)}
      variant="danger"
    />

    <ConfirmModal
      open={!!deletingDoc}
      title={t('common.confirm')}
      message={t('documents.confirmDelete', { name: deletingDoc?.fileName || deletingDoc?.title })}
      onConfirm={handleConfirmDelete}
      onCancel={() => setDeletingDoc(null)}
      confirmLabel={deleting ? '...' : t('common.delete')}
      variant="danger"
    />

    <ConfirmModal
      open={!!deletingPermanentDoc}
      title={t('common.confirm', 'Confirm')}
      message={t('documents.confirmPermanentDelete', { name: deletingPermanentDoc?.fileName || deletingPermanentDoc?.title, defaultValue: `Sei sicuro di voler eliminare definitivamente "${deletingPermanentDoc?.fileName || deletingPermanentDoc?.title}"? Questa azione è irreversibile.` })}
      onConfirm={handleConfirmPermanentDelete}
      onCancel={() => setDeletingPermanentDoc(null)}
      confirmLabel={deletingPermanent ? '...' : t('common.deletePermanently', 'Elimina definitivamente')}
      variant="danger"
    />

    <ConfirmModal
      open={!!signingDoc}
      title={t('documents.signTitle')}
      message={t('documents.signConsentLabel')}
      onConfirm={handleSignConfirm}
      onCancel={() => setSigningDoc(null)}
      confirmLabel={signing ? '...' : t('common.sign', 'Sign')}
      variant="primary"
    />

    {previewDocUrl && (
      <ModalBackdrop onClose={closePreview} width={800}>
        <ModalHeader title={previewDocName} onClose={closePreview} />
        <div style={{ width: '100%', height: '75vh', background: 'var(--background)', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {['zip', 'rar', '7z'].some(ext => previewDocName.toLowerCase().endsWith(`.${ext}`)) ? (
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
          ) : isTextPreview ? (
            // XML / TXT / CSV render as text. A browser iframe would either
            // download them or show a parser error, so read the blob instead.
            <div style={{ width: '100%', height: '100%', overflow: 'auto', background: 'var(--surface)' }}>
              {previewTextLoading ? (
                <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
              ) : (
                <pre style={{
                  margin: 0, padding: 18, fontSize: 12, lineHeight: 1.55,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {previewText}
                </pre>
              )}
            </div>
          ) : (
            <iframe 
              src={previewDocUrl} 
              style={{ width: '100%', height: '100%', border: 'none' }} 
              title={previewDocName}
            />
          )}
        </div>
      </ModalBackdrop>
    )}
    </>
  );
};
