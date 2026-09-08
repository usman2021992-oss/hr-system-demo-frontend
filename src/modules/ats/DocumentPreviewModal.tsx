import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DocumentPreviewModalProps {
  url: string;
  filename: string;
  onClose: () => void;
}

export default function DocumentPreviewModal({ url, filename, onClose }: DocumentPreviewModalProps) {
  const fileExtension = filename.split('.').pop()?.toLowerCase();
  const isPDF = fileExtension === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExtension || '');
  const isDoc = fileExtension === 'doc' || fileExtension === 'docx';
  const isTxt = fileExtension === 'txt';
  const isRtf = fileExtension === 'rtf';
  const shouldInlinePreview = isPDF || isImage || isDoc || isTxt || isRtf;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [txtContent, setTxtContent] = useState<string | null>(null);
  const [rtfMeta, setRtfMeta] = useState<{ name: string; size?: number } | null>(null);

  const [loading, setLoading] = useState<boolean>(shouldInlinePreview);
  const [loadError, setLoadError] = useState<string | null>(null);

  const lang = localStorage.getItem('hr_lang') === 'en' ? 'en' : 'it';

  const resolvedUrl = useMemo(() => {
    if (/^(https?:|blob:|data:)/i.test(url)) return url;
    const envBase = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || '';
    if (envBase) {
      return `${envBase}${url.startsWith('/') ? url : `/${url}`}`;
    }
    const fallbackBase = window.location.origin.replace(/:\d+$/, ':3001');
    return `${fallbackBase}${url.startsWith('/') ? url : `/${url}`}`;
  }, [url]);

  useEffect(() => {
    if (!shouldInlinePreview) {
      setLoading(false);
      setPreviewUrl(null);
      setDocHtml(null);
      setTxtContent(null);
      setRtfMeta(null);
      setLoadError(null);
      return;
    }

    const isLocalBlob = /^(blob:|data:)/i.test(resolvedUrl);
    if (isLocalBlob && (isPDF || isImage)) {
      setLoading(false);
      setPreviewUrl(resolvedUrl);
      setDocHtml(null);
      setTxtContent(null);
      setRtfMeta(null);
      setLoadError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(null);

    const token = localStorage.getItem('hr_token') || sessionStorage.getItem('hr_token') || '';
    const headers: HeadersInit = (token && !isLocalBlob) ? { Authorization: `Bearer ${token}` } : {};

    fetch(resolvedUrl, { headers })
      .then(async (res) => {
        if (!res.ok) {
          const statusText = res.statusText || 'Unknown Error';
          let errorDetail = `HTTP ${res.status} - ${statusText}`;
          if (res.status === 401) {
            errorDetail = 'Authentication required (401) - Please log in again';
          } else if (res.status === 403) {
            errorDetail = 'Access forbidden (403) - You do not have permission to view this file';
          } else if (res.status === 404) {
            errorDetail = 'File not found (404) - The file may have been deleted or moved';
          }
          throw new Error(errorDetail);
        }

        if (isPDF || isImage) {
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          if (active) {
            setPreviewUrl(objectUrl);
          }
          return () => {
            URL.revokeObjectURL(objectUrl);
          };
        } else if (isDoc) {
          const arrayBuffer = await res.arrayBuffer();
          let mammothLib = (window as any).mammoth;
          if (!mammothLib) {
            await new Promise<void>((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
              script.onload = () => {
                mammothLib = (window as any).mammoth;
                resolve();
              };
              script.onerror = () => reject(new Error('Failed to load Word document viewer helper library from CDN'));
              document.head.appendChild(script);
            });
          }
          if (mammothLib) {
            const mammothResult = await mammothLib.convertToHtml({ arrayBuffer });
            if (active) {
              setDocHtml(mammothResult.value);
            }
          } else {
            throw new Error('Word document parser is not loaded.');
          }
        } else if (isTxt) {
          const text = await res.text();
          if (active) {
            setTxtContent(text);
          }
        } else if (isRtf) {
          const blob = await res.blob();
          if (active) {
            setRtfMeta({ name: filename, size: blob.size });
          }
        }
      })
      .catch((err: any) => {
        if (active) {
          setPreviewUrl(null);
          setDocHtml(null);
          setTxtContent(null);
          setRtfMeta(null);
          setLoadError(err?.message || String(err || 'Preview generation failed'));
          console.error('Preview error:', err);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [resolvedUrl, shouldInlinePreview, filename, isPDF, isImage, isDoc, isTxt, isRtf]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.60)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90vw',
          maxWidth: 1200,
          height: '90vh',
          background: '#fff',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            {filename}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              Loading preview...
            </div>
          )}
          {!loading && loadError && (
            <div style={{ padding: 28, textAlign: 'center', maxWidth: 720 }}>
              <div style={{ fontSize: 46, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
                Unable to Display File
              </div>
              <div style={{ 
                fontSize: 13, 
                color: '#dc2626', 
                marginBottom: 16, 
                padding: '12px 16px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                lineHeight: 1.5,
                textAlign: 'left',
                fontFamily: 'monospace',
                wordBreak: 'break-word'
              }}>
                <strong style={{ display: 'block', marginBottom: 4, fontFamily: 'inherit' }}>Error:</strong>
                {loadError}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                You can try opening the file in a new tab or downloading it directly.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: 'var(--primary)',
                    color: '#fff',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Open in New Tab
                </a>
                <a
                  href={resolvedUrl}
                  download={filename}
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    background: 'var(--background)',
                    color: 'var(--text-primary)',
                    borderRadius: 8,
                    textDecoration: 'none',
                    fontWeight: 600,
                    border: '1px solid var(--border)'
                  }}
                >
                  Download
                </a>
              </div>
            </div>
          )}
          {!loading && !loadError && shouldInlinePreview && previewUrl && isPDF && (
            <object
              data={previewUrl}
              type="application/pdf"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#fff',
              }}
            >
              <iframe
                src={previewUrl}
                title={filename}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </object>
          )}
          {!loading && !loadError && shouldInlinePreview && previewUrl && isImage && (
            <img
              src={previewUrl}
              alt={filename}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          )}
          {!loading && !loadError && isDoc && docHtml && (
            <div 
              style={{
                width: '100%',
                height: '100%',
                padding: '40px',
                background: '#fff',
                overflow: 'auto',
                color: '#334155',
                lineHeight: 1.6,
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              dangerouslySetInnerHTML={{ __html: docHtml }}
            />
          )}
          {!loading && !loadError && isTxt && txtContent !== null && (
            <pre 
              style={{
                width: '100%',
                height: '100%',
                padding: '40px',
                background: '#fff',
                overflow: 'auto',
                color: '#334155',
                fontFamily: 'monospace',
                fontSize: '13px',
                whiteSpace: 'pre-wrap',
                margin: 0,
                boxSizing: 'border-box'
              }}
            >
              {txtContent}
            </pre>
          )}
          {!loading && !loadError && isRtf && (
            <div style={{ padding: 40, textAlign: 'center', background: '#fff', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {lang === 'it' ? 'Anteprima RTF non disponibile' : 'RTF preview not available'}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {lang === 'it' 
                  ? 'Il file è stato caricato correttamente.' 
                  : 'Your file has been uploaded successfully.'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {filename} ({rtfMeta?.size ? `${(rtfMeta.size / 1024).toFixed(1)} KB` : ''})
              </div>
            </div>
          )}
          {!loading && !loadError && !shouldInlinePreview && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Preview not available for this file type
              </div>
              <a
                href={resolvedUrl}
                download={filename}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                Download File
              </a>
            </div>
          )}
        </div>
        
        {/* Footer with actions */}
        {(isPDF || isImage || isDoc || isTxt || isRtf) && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
              background: 'var(--surface)',
            }}
          >
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 16px',
                background: 'var(--background)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              🔗 Open in New Tab
            </a>
            <a
              href={resolvedUrl}
              download={filename}
              style={{
                padding: '8px 16px',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              ⬇️ Download
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
