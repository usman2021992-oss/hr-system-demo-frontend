import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Shield, 
  Save, 
  Copy, 
  Check, 
  Clock, 
  User, 
  Eye, 
  Edit3,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  Bold,
  Italic,
  Underline,
  Heading,
  List,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Info,
  Building,
  Mail
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { getPublicLegalDocument, updateLegalDocument } from '../../api/publicCareers';
import { STATIC_ORIGINAL_DOCS } from './staticOriginalDocs';
import { getCompanies } from '../../api/companies';
import { Company } from '../../types';

type DocKey = 'privacy' | 'terms' | 'cookie';
type Language = 'it' | 'en';

const FLAG_IT = () => (
  <svg width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 2, flexShrink: 0 }}>
    <rect width="6" height="13" fill="#009246"/>
    <rect x="6" width="6" height="13" fill="#FFFFFF"/>
    <rect x="12" width="6" height="13" fill="#CE2B37"/>
  </svg>
);

const FLAG_EN = () => (
  <svg width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 2, flexShrink: 0 }}>
    <rect width="18" height="13" fill="#012169"/>
    <path d="M0 0L18 13M18 0L0 13" stroke="white" strokeWidth="2.5"/>
    <path d="M0 0L18 13M18 0L0 13" stroke="#C8102E" strokeWidth="1.5"/>
    <path d="M9 0V13M0 6.5H18" stroke="white" strokeWidth="3.5"/>
    <path d="M9 0V13M0 6.5H18" stroke="#C8102E" strokeWidth="2"/>
  </svg>
);

export default function LegalDocumentsAdminPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  
  const [activeDoc, setActiveDoc] = useState<DocKey>('privacy');
  const [activeLang, setActiveLang] = useState<Language>('it');
  const [activeTab, setActiveTab] = useState<'editor' | 'reference'>('editor');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Editor mode states
  const [isEditing, setIsEditing] = useState(false);
  const [isFullWidth, setIsFullWidth] = useState(false);
  
  // Document content states
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [platformCompanyName, setPlatformCompanyName] = useState('');
  const [platformCompanyEmail, setPlatformCompanyEmail] = useState('');
  
  // Keep original state to track changes for enabling/disabling the Save button
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [originalPlatformCompanyName, setOriginalPlatformCompanyName] = useState('');
  const [originalPlatformCompanyEmail, setOriginalPlatformCompanyEmail] = useState('');
  
  const [metadata, setMetadata] = useState<{ updatedAt: string; updatedByName: string | null } | null>(null);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedPreviewCompanyId, setSelectedPreviewCompanyId] = useState<string>('general');

  // Platform settings editing states
  const [isPlatformEditing, setIsPlatformEditing] = useState(false);
  const [savingPlatform, setSavingPlatform] = useState(false);

  // Custom preview dropdown state
  const [isPreviewDropdownOpen, setIsPreviewDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const editorRef = useRef<HTMLDivElement>(null);

  // Load companies list for preview contexts
  useEffect(() => {
    getCompanies()
      .then((data) => {
        setCompanies(data || []);
      })
      .catch((err) => {
        console.error('Failed to load companies for preview dropdown:', err);
      });
  }, []);

  // Close custom preview dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsPreviewDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleCancelPlatform = () => {
    setPlatformCompanyName(originalPlatformCompanyName);
    setPlatformCompanyEmail(originalPlatformCompanyEmail);
    setIsPlatformEditing(false);
  };

  const handleSavePlatform = async () => {
    setSavingPlatform(true);
    try {
      // Upsert using the current active document to trigger the global DB update
      const doc = await updateLegalDocument(activeDoc, {
        language: activeLang,
        title: title.trim(),
        content: content,
        platformCompanyName: platformCompanyName.trim(),
        platformCompanyEmail: platformCompanyEmail.trim()
      });
      setOriginalPlatformCompanyName(doc.platformCompanyName || '');
      setOriginalPlatformCompanyEmail(doc.platformCompanyEmail || '');
      setIsPlatformEditing(false);
      showToast(
        activeLang === 'it' 
          ? 'Dati titolare piattaforma salvati con successo' 
          : 'Platform owner details saved successfully', 
        'success'
      );
    } catch (err: any) {
      console.error('Failed to save platform details:', err);
      showToast(
        activeLang === 'it' 
          ? 'Errore durante il salvataggio dei dati piattaforma' 
          : 'Failed to save platform details', 
          'error'
      );
    } finally {
      setSavingPlatform(false);
    }
  };

  // Load document content when active doc or active language changes
  useEffect(() => {
    async function loadDocument() {
      setLoading(true);
      setIsEditing(false); // Reset editing mode when switching documents
      try {
        const doc = await getPublicLegalDocument(activeDoc, activeLang);
        setTitle(doc.title);
        setContent(doc.content);
        setPlatformCompanyName(doc.platformCompanyName || '');
        setPlatformCompanyEmail(doc.platformCompanyEmail || '');
        setOriginalTitle(doc.title);
        setOriginalContent(doc.content);
        setOriginalPlatformCompanyName(doc.platformCompanyName || '');
        setOriginalPlatformCompanyEmail(doc.platformCompanyEmail || '');
        setMetadata({
          updatedAt: doc.updatedAt,
          updatedByName: doc.updatedByName
        });
      } catch (err: any) {
        console.error('Failed to load document:', err);
        // Reset if not found or error
        const defaultTitle = 
          activeDoc === 'privacy' 
            ? (activeLang === 'it' ? 'INFORMATIVA SULLA PRIVACY' : 'PRIVACY POLICY')
            : activeDoc === 'terms'
            ? (activeLang === 'it' ? 'TERMINI DI SERVIZIO' : 'TERMS OF SERVICE')
            : (activeLang === 'it' ? 'INFORMATIVA SUI COOKIE' : 'COOKIE POLICY');
        
        setTitle(defaultTitle);
        setContent('');
        setPlatformCompanyName('');
        setPlatformCompanyEmail('');
        setOriginalTitle(defaultTitle);
        setOriginalContent('');
        setOriginalPlatformCompanyName('');
        setOriginalPlatformCompanyEmail('');
        setMetadata(null);
      } finally {
        setLoading(false);
      }
    }
    loadDocument();
  }, [activeDoc, activeLang]);

  // Sync content into the contentEditable area on load/cancel or toggle tab
  useEffect(() => {
    if (!loading && editorRef.current && activeTab === 'editor') {
      editorRef.current.innerHTML = content;
    }
  }, [loading, activeTab]);

  const handleSave = async () => {
    if (!title.trim()) {
      showToast(activeLang === 'it' ? 'Il titolo è obbligatorio' : 'Title is required', 'warning');
      return;
    }
    setSaving(true);
    try {
      const doc = await updateLegalDocument(activeDoc, {
        language: activeLang,
        title: title.trim(),
        content: content,
        platformCompanyName: platformCompanyName.trim(),
        platformCompanyEmail: platformCompanyEmail.trim()
      });
      setOriginalTitle(doc.title);
      setOriginalContent(doc.content);
      setOriginalPlatformCompanyName(doc.platformCompanyName || '');
      setOriginalPlatformCompanyEmail(doc.platformCompanyEmail || '');
      setMetadata({
        updatedAt: doc.updatedAt,
        updatedByName: doc.updatedByName
      });
      setIsEditing(false); // Lock editor after successful save
      showToast(
        activeLang === 'it' 
          ? 'Documento salvato con successo' 
          : 'Document saved successfully', 
        'success'
      );
    } catch (err: any) {
      console.error('Failed to save document:', err);
      showToast(
        activeLang === 'it' 
          ? 'Errore durante il salvataggio' 
          : 'Error occurred while saving', 
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setTitle(originalTitle);
    setContent(originalContent);
    setIsEditing(false);
    if (editorRef.current) {
      editorRef.current.innerHTML = originalContent;
    }
  };

  const copyVariable = (variable: string) => {
    navigator.clipboard.writeText(variable);
    setCopiedVar(variable);
    showToast(
      activeLang === 'it' 
        ? `Variabile ${variable} copiata` 
        : `Variable ${variable} copied`, 
      'success'
    );
    setTimeout(() => setCopiedVar(null), 2000);
  };

  // Capture user input inside WYSIWYG contentEditable div
  const handleEditorChange = () => {
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML);
    }
  };

  // Wrap selections in styled HTML tags inside contentEditable
  const applyStyleToSelection = (tagName: string, styles: Record<string, string>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    // Make sure the selection is actually inside our editor
    if (editorRef.current && !editorRef.current.contains(range.commonAncestorContainer)) {
      showToast(
        activeLang === 'it' 
          ? "Seleziona prima del testo all'interno dell'editor" 
          : "Please select text inside the editor first", 
        'warning'
      );
      return;
    }

    if (range.collapsed) {
      // Empty selection: insert a typed element with a zero-width space
      const element = document.createElement(tagName);
      Object.entries(styles).forEach(([k, v]) => {
        element.style.setProperty(k, v);
      });
      element.innerHTML = '&#8203;'; 
      range.insertNode(element);
      range.setStart(element, 1);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      const element = document.createElement(tagName);
      Object.entries(styles).forEach(([k, v]) => {
        element.style.setProperty(k, v);
      });
      try {
        element.appendChild(range.extractContents());
        range.insertNode(element);
        // Reselect the text
        selection.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(element);
        selection.addRange(newRange);
      } catch (err) {
        console.error('Failed to apply format:', err);
      }
    }
    handleEditorChange();
  };

  // Helper to execute WYSIWYG commands
  const handleFormat = (command: string, value: string = '') => {
    if (!isEditing) return;

    if (editorRef.current) {
      editorRef.current.focus();
    }

    if (command === 'bold' || command === 'italic' || command === 'underline' || 
        command === 'justifyLeft' || command === 'justifyCenter' || command === 'justifyRight' ||
        command === 'insertUnorderedList') {
      document.execCommand(command, false, value);
      handleEditorChange();
    } else if (command === 'heading') {
      // Apply H3 block style
      applyStyleToSelection('h3', {
        color: 'var(--primary)',
        marginTop: '24px',
        marginBottom: '12px',
        fontWeight: '700',
        fontSize: '18px',
        fontFamily: 'var(--font-display)'
      });
    } else if (command === 'color') {
      applyStyleToSelection('span', { color: value });
    }
  };

  // Controlled parser to convert markdown/HTML tags to HTML string for preview
  const convertMarkdownToHtml = (md: string, companyName: string, companyEmail: string) => {
    if (!md) return '';

    let html = md
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{companyEmail\}\}/g, companyEmail);

    // If it is already HTML, skip markdown block conversions
    const isHtml = /<[a-z][\s\S]*>/i.test(md);
    if (isHtml) {
      return html;
    }

    // Replace headers: ### Heading -> <h4>Heading</h4>
    html = html.replace(/^### (.*?)$/gm, '<h4 style="color: var(--primary); margin-top: 20px; margin-bottom: 10px; font-weight: 700; font-size: 16px;">$1</h4>');
    html = html.replace(/^## (.*?)$/gm, '<h3 style="color: var(--primary); margin-top: 24px; margin-bottom: 12px; font-weight: 700; font-size: 18px;">$1</h3>');
    html = html.replace(/^# (.*?)$/gm, '<h2 style="color: var(--primary); margin-top: 28px; margin-bottom: 14px; font-weight: 800; font-size: 20px;">$1</h2>');

    // Replace horizontal rules: --- -> <hr />
    html = html.replace(/^---$/gm, '<hr style="border: 0; border-top: 1px solid var(--border); margin: 24px 0;" />');

    // Replace bullet lists: - Item -> <li>Item</li>
    html = html.replace(/^[-*] (.*?)$/gm, '<li style="margin-bottom: 6px;">$1</li>');
    
    // Wrap lists in ul tags
    html = html.replace(/((?:<li style="margin-bottom: 6px;">.*?<\/li>\s*)+)/g, '<ul style="padding-left: 20px; margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary);">$1</ul>');

    // Replace bold: **text** -> <strong>text</strong>
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Replace italic: *text* -> <em>text</em>
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');

    // Paragraphs split by double newline
    const blocks = html.split(/\n\s*\n/);
    const parsedBlocks = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<hr') || trimmed.startsWith('<div')) {
        return trimmed;
      }
      const withBreaks = trimmed.replace(/\n/g, '<br />');
      return `<p style="margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary);">${withBreaks}</p>`;
    });

    return parsedBlocks.join('\n');
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString(activeLang === 'it' ? 'it-IT' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const docTabs = [
    { key: 'privacy' as const, label: activeLang === 'it' ? 'Informativa Privacy' : 'Privacy Policy' },
    { key: 'terms' as const, label: activeLang === 'it' ? 'Termini di Servizio' : 'Terms of Service' },
    { key: 'cookie' as const, label: activeLang === 'it' ? 'Cookie Policy' : 'Cookie Policy' }
  ];

  const hasChanges = title !== originalTitle || content !== originalContent;
  const isSaveDisabled = !isEditing || !hasChanges || saving;

  const activePreviewCompany = useMemo(() => {
    if (selectedPreviewCompanyId === 'general') {
      return {
        name: platformCompanyName || (activeLang === 'it' ? '[Nome Azienda Generale non configurato]' : '[General Company Name not configured]'),
        email: platformCompanyEmail || (activeLang === 'it' ? '[Email Generale non configurata]' : '[General Email not configured]')
      };
    }
    const comp = companies.find(c => String(c.id) === selectedPreviewCompanyId);
    return {
      name: comp?.name || '',
      email: comp?.companyEmail || ''
    };
  }, [selectedPreviewCompanyId, platformCompanyName, platformCompanyEmail, companies, activeLang]);

  // Retrieve static original backup template
  const staticBackupDoc = STATIC_ORIGINAL_DOCS[activeDoc]?.[activeLang] || { title: '', content: '' };

  return (
    <div className="responsive-page-container">
      {/* Page Title & Subtitle */}
      <div className="responsive-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-display)', margin: 0 }}>
            {activeLang === 'it' ? 'Pagine Legali' : 'Legal Pages'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
            {activeLang === 'it' 
              ? 'Configura i documenti legali del portale Careers (Privacy, Termini e Cookie).'
              : 'Configure the careers portal legal policy templates (Privacy, Terms and Cookies).'}
          </p>
        </div>
      </div>

      {/* Top Document Selection Tabs Bar (Full Width) */}
      <div className="scrollable-tabs" style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        marginBottom: '24px',
        width: '100%',
        gap: '4px',
        overflowX: 'auto'
      }}>
        {docTabs.map((tab) => {
          const isActive = activeDoc === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveDoc(tab.key)}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                background: isActive ? 'rgba(201, 151, 58, 0.05)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <Shield size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Mode Sub-Tabs: DB Template vs Hardcoded Original */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('editor')}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            background: activeTab === 'editor' ? 'var(--primary)' : 'var(--surface)',
            color: activeTab === 'editor' ? '#fff' : 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          {activeLang === 'it' ? 'Bozza Database (Modificabile)' : 'Database Draft (Editable)'}
        </button>
        <button
          onClick={() => setActiveTab('reference')}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            background: activeTab === 'reference' ? 'var(--primary)' : 'var(--surface)',
            color: activeTab === 'reference' ? '#fff' : 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          {activeLang === 'it' ? 'Originale Statico (Sola Lettura)' : 'Static Original (Read-Only Reference)'}
        </button>
      </div>

      {/* Main Container Card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden'
      }}>
        {/* Top Control Bar (Language Toggle & Metadata & Lock/Unlock Toggle) */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          background: 'var(--surface-warm)'
        }}>
          {/* Flag-based Language Selector */}
          <div style={{ display: 'inline-flex', background: 'var(--background)', padding: '3px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
            {(['it', 'en'] as const).map((lang) => {
              const isActive = activeLang === lang;
              return (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  style={{
                    padding: '4px 14px',
                    borderRadius: 'var(--radius-lg)',
                    border: 'none',
                    background: isActive ? 'var(--surface)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {lang === 'it' ? <FLAG_IT /> : <FLAG_EN />}
                  {lang === 'it' ? 'Italiano' : 'English'}
                </button>
              );
            })}
          </div>

          {/* Edit State and Toggle controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Metadata (modified details) */}
            {metadata && activeTab === 'editor' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', color: 'var(--text-muted)' }} className="hide-mobile">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} />
                  <span>{formatDate(metadata.updatedAt)}</span>
                </div>
                {metadata.updatedByName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <User size={12} />
                    <span>{metadata.updatedByName}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '100px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(201, 151, 58, 0.1)',
              borderTop: '3px solid var(--accent)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {activeLang === 'it' ? 'Caricamento documento...' : 'Loading document...'}
            </span>
          </div>
        ) : activeTab === 'reference' ? (
          /* Static Original Backups (Read-Only Reference View) */
          <div className="responsive-card-body">
            <div style={{
              background: 'rgba(201, 151, 58, 0.03)',
              border: '1.5px solid rgba(201, 151, 58, 0.15)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Info size={16} style={{ color: 'var(--accent)' }} />
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {activeLang === 'it'
                  ? 'Questa è una copia statica del testo originale precedentemente cablato nel codice. Utilizzala come riferimento.'
                  : 'This is a static copy of the original document previously hardcoded in the codebase. Use it as reference.'}
              </p>
            </div>

            <div className="responsive-reference-box" style={{
              border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--background)',
              maxHeight: '600px',
              overflowY: 'auto'
            }}>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--primary)',
                fontSize: '24px',
                fontWeight: 800,
                marginBottom: '20px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '8px'
              }}>
                {staticBackupDoc.title}
              </h2>
              <div 
                className="static-reference-content legal-content-section"
                style={{ fontSize: '15px', color: 'var(--text-secondary)' }}
                dangerouslySetInnerHTML={{ __html: staticBackupDoc.content.replace(/\{\{companyName\}\}/g, activePreviewCompany.name).replace(/\{\{companyEmail\}\}/g, activePreviewCompany.email) }}
              />
            </div>
          </div>
        ) : (          /* Editable Database Version tab content */
          <div className="responsive-card-body">
            {/* Platform Details Card */}
            <div style={{
              background: 'var(--surface)',
              border: '1.5px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: 'var(--shadow-sm)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isPlatformEditing ? '16px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={18} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                    {activeLang === 'it' ? 'Dati Titolare Piattaforma (Careers Generale)' : 'Platform Owner Details (General Careers)'}
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!isPlatformEditing ? (
                    <button
                      onClick={() => setIsPlatformEditing(true)}
                      title={activeLang === 'it' ? 'Modifica dati piattaforma' : 'Edit platform details'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 16px',
                        borderRadius: '20px',
                        border: '1px solid var(--border)',
                        background: 'var(--background)',
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      <Edit3 size={14} />
                      <span>{activeLang === 'it' ? 'Modifica' : 'Edit'}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleCancelPlatform}
                        disabled={savingPlatform}
                        style={{
                          padding: '6px 16px',
                          borderRadius: '20px',
                          border: '1px solid var(--border)',
                          background: 'var(--background)',
                          color: 'var(--text-secondary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--background)'}
                      >
                        {activeLang === 'it' ? 'Annulla' : 'Cancel'}
                      </button>
                      <button
                        onClick={handleSavePlatform}
                        disabled={savingPlatform || (!platformCompanyName.trim() && !platformCompanyEmail.trim())}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 18px',
                          borderRadius: '20px',
                          border: 'none',
                          background: 'var(--accent)',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}
                      >
                        <Save size={14} />
                        <span>{savingPlatform ? (activeLang === 'it' ? 'Salvataggio...' : 'Saving...') : (activeLang === 'it' ? 'Salva' : 'Save')}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!isPlatformEditing ? (
                <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '14px' }}>
                  {/* Company Name Badge/Card */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'rgba(201, 151, 58, 0.02)',
                    border: '1px solid rgba(201, 151, 58, 0.1)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '14px 18px',
                    boxShadow: 'var(--shadow-xs)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'rgba(201, 151, 58, 0.08)',
                      color: 'var(--accent)',
                      flexShrink: 0
                    }}>
                      <Building size={18} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {activeLang === 'it' ? 'Nome Azienda Piattaforma' : 'Platform Company Name'}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {platformCompanyName || (activeLang === 'it' ? '[Non impostato]' : '[Not Set]')}
                      </span>
                    </div>
                  </div>

                  {/* Company Email Badge/Card */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'rgba(201, 151, 58, 0.02)',
                    border: '1px solid rgba(201, 151, 58, 0.1)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '14px 18px',
                    boxShadow: 'var(--shadow-xs)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'rgba(201, 151, 58, 0.08)',
                      color: 'var(--accent)',
                      flexShrink: 0
                    }}>
                      <Mail size={16} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {activeLang === 'it' ? 'Email Azienda Piattaforma' : 'Platform Company Email'}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {platformCompanyEmail || (activeLang === 'it' ? '[Non impostato]' : '[Not Set]')}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {activeLang === 'it' ? 'Nome Azienda Piattaforma' : 'Platform Company Name'}
                    </label>
                    <input
                      type="text"
                      value={platformCompanyName}
                      onChange={(e) => setPlatformCompanyName(e.target.value)}
                      placeholder={activeLang === 'it' ? 'Es. Veylo HR...' : 'E.g. Veylo HR...'}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '1.5px solid var(--border)',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--background)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {activeLang === 'it' ? 'Email Azienda Piattaforma' : 'Platform Company Email'}
                    </label>
                    <input
                      type="email"
                      value={platformCompanyEmail}
                      onChange={(e) => setPlatformCompanyEmail(e.target.value)}
                      placeholder={activeLang === 'it' ? 'Es. info@veylohr.com...' : 'E.g. info@veylohr.com...'}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '1.5px solid var(--border)',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--background)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Variable reference bar with Guide Text */}
            <div style={{
              background: 'rgba(201, 151, 58, 0.03)',
              border: '1px dashed rgba(201, 151, 58, 0.25)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <Info size={16} style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>
                      {activeLang === 'it' ? 'Variabili Disponibili:' : 'Available Variables:'}
                    </span>
                    {[
                      { code: '{{companyName}}', val: activePreviewCompany.name, desc: activeLang === 'it' ? 'Nome Azienda' : 'Company Name' },
                      { code: '{{companyEmail}}', val: activePreviewCompany.email, desc: activeLang === 'it' ? 'Email di Contatto' : 'Contact Email' }
                    ].map((item) => (
                      <div 
                        key={item.code}
                        onClick={() => copyVariable(item.code)}
                        title={activeLang === 'it' ? `Clicca per copiare (Anteprima: ${item.val})` : `Click to copy (Preview: ${item.val})`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: 'var(--background)',
                          border: '1.5px solid var(--border)',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          boxShadow: 'var(--shadow-xs)',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--accent)' }}>{item.code}</span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{item.desc}</span>
                        {copiedVar === item.code ? <Check size={12} style={{ color: '#22C55E' }} /> : <Copy size={12} style={{ color: 'var(--text-muted)' }} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p style={{ margin: '0 0 0 28px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {activeLang === 'it'
                  ? 'Usa queste variabili dinamiche all\'interno dei documenti. Saranno automaticamente sostituite con i dati reali della tua azienda quando visualizzate dai candidati.'
                  : 'Use these dynamic variables within your documents. They will be automatically replaced with your company\'s actual details when viewed by candidates.'}
              </p>
            </div>

            {/* Split layout: Editor & Preview */}
            <div className="responsive-split-layout" style={{ display: 'flex', gap: '24px', position: 'relative' }}>
              {/* Left Column: WYSIWYG Editor */}
              <div className="responsive-column" style={{ 
                flex: isFullWidth ? 1 : 0.5, 
                width: isFullWidth ? '100%' : '50%',
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px',
                height: '620px',
                transition: 'all 0.2s ease'
              }}>
                {/* Editor Title Row with Enable Edit Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                    <Edit3 size={14} />
                    <span>{activeLang === 'it' ? 'MODIFICA DOCUMENTO' : 'DOCUMENT EDITOR'}</span>
                  </div>
                  
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: isEditing ? 'rgba(239, 68, 68, 0.05)' : 'var(--background)',
                      color: isEditing ? '#EF4444' : 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isEditing ? <Lock size={14} /> : <Unlock size={14} />}
                    <span>
                      {isEditing 
                        ? (activeLang === 'it' ? 'Blocca Modifica' : 'Lock Editor') 
                        : (activeLang === 'it' ? 'Abilita Modifica' : 'Enable Edit')}
                    </span>
                  </button>
                </div>

                {/* Title Input & Label inside Editor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {activeLang === 'it' ? 'Titolo Documento' : 'Document Title'}
                    </label>
                  </div>
                  <input
                    type="text"
                    value={title}
                    disabled={!isEditing}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={activeLang === 'it' ? 'Inserisci il titolo...' : 'Enter document title...'}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1.5px solid var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      background: isEditing ? 'var(--background)' : 'var(--surface-warm)',
                      color: isEditing ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      fontWeight: 600,
                      outline: 'none',
                      cursor: isEditing ? 'text' : 'not-allowed',
                      transition: 'border-color 0.15s ease'
                    }}
                    onFocus={(e) => { if (isEditing) e.target.style.borderColor = 'var(--accent)'; }}
                    onBlur={(e) => { if (isEditing) e.target.style.borderColor = 'var(--border)'; }}
                  />
                </div>

                {/* WYSIWYG Editor Frame */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  background: 'var(--background)'
                }}>
                  {/* Formatting Toolbar */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--surface-warm)',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    {/* Formatting items */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      {[
                        { icon: <Bold size={13} />, action: () => handleFormat('bold'), title: activeLang === 'it' ? 'Grassetto' : 'Bold' },
                        { icon: <Italic size={13} />, action: () => handleFormat('italic'), title: activeLang === 'it' ? 'Corsivo' : 'Italic' },
                        { icon: <Underline size={13} />, action: () => handleFormat('underline'), title: activeLang === 'it' ? 'Sottolineato' : 'Underline' },
                        { icon: <Heading size={13} />, action: () => handleFormat('heading'), title: activeLang === 'it' ? 'Titolo' : 'Heading' },
                        { icon: <List size={13} />, action: () => handleFormat('insertUnorderedList'), title: activeLang === 'it' ? 'Elenco' : 'List' },
                        { icon: <AlignLeft size={13} />, action: () => handleFormat('justifyLeft'), title: activeLang === 'it' ? 'Allinea a sinistra' : 'Align Left' },
                        { icon: <AlignCenter size={13} />, action: () => handleFormat('justifyCenter'), title: activeLang === 'it' ? 'Centrato' : 'Align Center' },
                        { icon: <AlignRight size={13} />, action: () => handleFormat('justifyRight'), title: activeLang === 'it' ? 'Allinea a destra' : 'Align Right' }
                      ].map((btn, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={btn.action}
                          disabled={!isEditing}
                          title={btn.title}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-secondary)',
                            cursor: isEditing ? 'pointer' : 'not-allowed',
                            opacity: isEditing ? 1 : 0.5,
                            transition: 'all 0.1s ease'
                          }}
                          onMouseEnter={(e) => { if (isEditing) e.currentTarget.style.borderColor = 'var(--accent)'; }}
                          onMouseLeave={(e) => { if (isEditing) e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                          {btn.icon}
                        </button>
                      ))}

                      {/* Color selections */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '6px', borderLeft: '1px solid var(--border)', paddingLeft: '8px' }}>
                        {[
                          { color: '#C9973A', title: 'Oro (Primary)' },
                          { color: '#0284C7', title: 'Azzurro (Accent)' },
                          { color: '#15803D', title: 'Verde' },
                          { color: '#dc2626', title: 'Rosso' }
                        ].map((col) => (
                          <button
                            key={col.color}
                            type="button"
                            disabled={!isEditing}
                            onClick={() => handleFormat('color', col.color)}
                            title={col.title}
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: col.color,
                              border: '1px solid rgba(0,0,0,0.1)',
                              cursor: isEditing ? 'pointer' : 'not-allowed',
                              padding: 0,
                              opacity: isEditing ? 1 : 0.5
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Full width editor expand toggle button */}
                    <button
                      type="button"
                      onClick={() => setIsFullWidth(!isFullWidth)}
                      title={isFullWidth ? (activeLang === 'it' ? 'Mostra Anteprima' : 'Show Preview') : (activeLang === 'it' ? 'Solo Editor (Schermo Intero)' : 'Full Width Editor')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 600
                      }}
                    >
                      {isFullWidth ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                      <span className="hide-mobile">{isFullWidth ? (activeLang === 'it' ? 'Anteprima' : 'Preview') : (activeLang === 'it' ? 'Solo Editor' : 'Solo Editor')}</span>
                    </button>
                  </div>

                  {/* Main contentEditable area */}
                  <div
                    ref={editorRef}
                    contentEditable={isEditing}
                    onInput={handleEditorChange}
                    onBlur={handleEditorChange}
                    className="wysiwyg-editor-content legal-content-section"
                    style={{
                      flex: 1,
                      padding: '24px',
                      background: isEditing ? 'transparent' : 'var(--surface-warm)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '15px',
                      lineHeight: 1.7,
                      overflowY: 'auto',
                      outline: 'none',
                      cursor: isEditing ? 'text' : 'not-allowed',
                      border: 'none'
                    }}
                  />
                  <style>{`
                    .wysiwyg-editor-content p, .legal-content-section p {
                      margin-bottom: 16px;
                      line-height: 1.7;
                      font-size: 15px;
                      color: var(--text-secondary);
                    }
                    .wysiwyg-editor-content h3, .legal-content-section h3 {
                      color: var(--primary);
                      margin-top: 24px;
                      margin-bottom: 12px;
                      font-weight: 700;
                      font-size: 18px;
                      font-family: var(--font-display);
                    }
                    .wysiwyg-editor-content ul, .wysiwyg-editor-content ol, .legal-content-section ul, .legal-content-section ol {
                      margin-bottom: 16px;
                      padding-left: 20px;
                      list-style-type: disc;
                    }
                    .wysiwyg-editor-content li, .legal-content-section li {
                      margin-bottom: 6px;
                      line-height: 1.7;
                      font-size: 15px;
                      color: var(--text-secondary);
                    }
                    .wysiwyg-editor-content hr, .legal-content-section hr {
                      margin: 16px 0;
                      border: 0;
                      border-top: 1px solid var(--border);
                    }

                    /* Responsive Layout Adjustments */
                    .responsive-page-container {
                      padding: 24px;
                      max-width: 1440px;
                      margin: 0 auto;
                      font-family: var(--font-body);
                      color: var(--text-primary);
                    }

                    .responsive-card-body {
                      padding: 24px;
                    }
                    
                    @media (max-width: 1024px) {
                      .responsive-page-container {
                        padding: 12px !important;
                      }
                      
                      .responsive-split-layout {
                        flex-direction: column !important;
                        gap: 24px !important;
                      }
                      
                      .responsive-column {
                        width: 100% !important;
                        flex: none !important;
                        height: 550px !important;
                      }
                    }

                     @media (max-width: 768px) {
                      .responsive-page-container {
                        padding: 16px 0 !important;
                      }

                      .responsive-card-body {
                        padding: 16px !important;
                      }
                      
                      .responsive-header {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 12px !important;
                      }

                      .responsive-grid-2 {
                        grid-template-columns: 1fr !important;
                        gap: 12px !important;
                      }

                      .responsive-reference-box {
                        padding: 16px !important;
                      }

                      .hide-mobile {
                        display: none !important;
                      }
                      
                      .scrollable-tabs::-webkit-scrollbar {
                        display: none;
                      }
                      
                      .scrollable-tabs {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                      }
                    }

                    @media (max-width: 480px) {
                      .responsive-footer-actions {
                        flex-direction: column-reverse !important;
                        align-items: stretch !important;
                        gap: 10px !important;
                      }
                      
                      .responsive-footer-actions button {
                        width: 100% !important;
                        justify-content: center !important;
                      }
                    }
                  `}</style>

                  {/* Bottom Counter bar inside Editor */}
                  <div style={{
                    padding: '6px 12px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--surface-warm)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    fontWeight: 600
                  }}>
                    <span>{isEditing ? (activeLang === 'it' ? 'Stato: IN MODIFICA' : 'Status: EDITING') : (activeLang === 'it' ? 'Stato: BLOCCATO' : 'Status: LOCKED')}</span>
                    <span>{content.length} {activeLang === 'it' ? 'caratteri' : 'characters'}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Preview (hidden in full width editor mode) */}
              {!isFullWidth && (
                <div className="responsive-column" style={{ 
                  flex: 0.5, 
                  width: '50%',
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '12px',
                  height: '620px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, marginBottom: '12px' }}>
                    <Eye size={14} />
                    <span>{activeLang === 'it' ? 'ANTEPRIMA IN TEMPO REALE' : 'LIVE PREVIEW'}</span>
                  </div>

                  {/* Custom Preview Dropdown Container - OUTSIDE and ABOVE the preview box */}
                  <div ref={dropdownRef} style={{ position: 'relative', width: '100%', flexShrink: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                      {activeLang === 'it' ? 'Anteprima per:' : 'Preview for:'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsPreviewDropdownOpen(!isPreviewDropdownOpen)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: '1.5px solid var(--border)',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--background)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: 600,
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'border-color 0.15s ease'
                      }}
                    >
                      <span>
                        {selectedPreviewCompanyId === 'general'
                          ? (activeLang === 'it' ? 'Pagina Careers Generale (Semplice)' : 'General Careers Page (Simple)')
                          : (companies.find(c => String(c.id) === selectedPreviewCompanyId)?.name || selectedPreviewCompanyId)}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: isPreviewDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>

                    {/* Custom Dropdown Options Menu */}
                    {isPreviewDropdownOpen && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: 'var(--surface)',
                        border: '1.5px solid var(--border)',
                        borderRadius: 'var(--radius-lg)',
                        boxShadow: 'var(--shadow-md)',
                        zIndex: 100,
                        maxHeight: '160px',
                        overflowY: 'auto'
                      }}>
                        <div
                          onClick={() => {
                            setSelectedPreviewCompanyId('general');
                            setIsPreviewDropdownOpen(false);
                          }}
                          style={{
                            padding: '10px 14px',
                            fontSize: '13px',
                            fontWeight: selectedPreviewCompanyId === 'general' ? 700 : 500,
                            color: selectedPreviewCompanyId === 'general' ? 'var(--accent)' : 'var(--text-primary)',
                            background: selectedPreviewCompanyId === 'general' ? 'rgba(201, 151, 58, 0.05)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (selectedPreviewCompanyId !== 'general') e.currentTarget.style.background = 'var(--surface-warm)';
                          }}
                          onMouseLeave={(e) => {
                            if (selectedPreviewCompanyId !== 'general') e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {activeLang === 'it' ? 'Pagina Careers Generale (Semplice)' : 'General Careers Page (Simple)'}
                        </div>

                        {companies.map((comp) => {
                          const isSelected = selectedPreviewCompanyId === String(comp.id);
                          return (
                            <div
                              key={comp.id}
                              onClick={() => {
                                setSelectedPreviewCompanyId(String(comp.id));
                                setIsPreviewDropdownOpen(false);
                              }}
                              style={{
                                padding: '10px 14px',
                                fontSize: '13px',
                                fontWeight: isSelected ? 700 : 500,
                                color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                background: isSelected ? 'rgba(201, 151, 58, 0.05)' : 'transparent',
                                borderTop: '1px solid var(--border-light, #f3f4f6)',
                                cursor: 'pointer',
                                transition: 'background 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'var(--surface-warm)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              {comp.name}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{
                    flex: 1,
                    border: '1.5px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--background)',
                    padding: '24px',
                    overflowY: 'auto',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    {/* Preview Document title */}
                    <h3 style={{
                      fontFamily: 'var(--font-display)',
                      color: 'var(--primary)',
                      fontSize: '20px',
                      fontWeight: 800,
                      marginBottom: '16px',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '8px'
                    }}>
                      {title || (activeLang === 'it' ? 'Titolo Vuoto' : 'No Title')}
                    </h3>

                    {/* Preview Document content compiled */}
                    <div 
                      className="legal-content-section"
                      style={{ fontSize: '15px', lineHeight: 1.7, color: 'var(--text-secondary)' }}
                      dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(content, activePreviewCompany.name, activePreviewCompany.email) }}
                    />
                    <style>{`
                      .legal-content-section p {
                        margin-bottom: 16px;
                        line-height: 1.7;
                        font-size: 15px;
                        color: var(--text-secondary);
                      }
                      .legal-content-section h3 {
                        color: var(--primary);
                        margin-top: 24px;
                        margin-bottom: 12px;
                        font-weight: 700;
                        font-size: 18px;
                        font-family: var(--font-display);
                      }
                      .legal-content-section ul, .legal-content-section ol {
                        margin-bottom: 16px;
                        padding-left: 20px;
                        list-style-type: disc;
                      }
                      .legal-content-section li {
                        margin-bottom: 6px;
                        line-height: 1.7;
                        font-size: 15px;
                        color: var(--text-secondary);
                      }
                      .legal-content-section hr {
                        margin: 16px 0;
                        border: 0;
                        border-top: 1px solid var(--border);
                      }
                    `}</style>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions Save/Cancel Bar */}
            <div className="responsive-footer-actions" style={{
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              {isEditing && (
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '10px 20px',
                    background: 'var(--background)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--background)'}
                >
                  {activeLang === 'it' ? 'Annulla' : 'Cancel'}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaveDisabled}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 24px',
                  background: isSaveDisabled ? 'var(--border)' : 'var(--accent)',
                  color: isSaveDisabled ? 'var(--text-muted)' : 'var(--btn-accent-text, #FFFFFF)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: isSaveDisabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSaveDisabled ? 'none' : 'var(--shadow-sm)'
                }}
                onMouseEnter={(e) => {
                  if (!isSaveDisabled) {
                    e.currentTarget.style.background = 'var(--accent-hover, #B38330)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSaveDisabled) {
                    e.currentTarget.style.background = 'var(--accent)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                <Save size={16} />
                {saving 
                  ? (activeLang === 'it' ? 'Salvataggio...' : 'Saving...') 
                  : (activeLang === 'it' ? 'Salva Modifiche' : 'Save Changes')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
