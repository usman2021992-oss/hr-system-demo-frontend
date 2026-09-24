import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Cropper, { Area, Point } from 'react-easy-crop';
import { X, ImagePlus, ZoomIn, ZoomOut, RotateCcw, RotateCw, Undo2, Trash2, Check, RefreshCw } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { BANNER_OUTPUT_WIDTH, LOGO_OUTPUT_SIZE, canvasToFile, prepareSourceImage, renderCrop } from './cropImage';

export type CropVariant = 'avatar' | 'logo' | 'banner';

interface ImageCropModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * What is being edited. Decides the crop shape and the size uploaded:
   * a round 1:1 photo, a square logo, or a wide 3:1 banner.
   */
  variant?: CropVariant;
  /** Heading, so a company logo does not say "Profile photo". */
  title?: string;
  /** Current image, shown next to the drop zone and offered for removal. */
  currentSrc?: string | null;
  /** Initials shown in the preview when there is no image yet (avatars). */
  initials?: string;
  /**
   * Uploads the prepared image. Reject to keep the window open (the caller
   * shows its own error toast).
   */
  onSave: (file: File) => Promise<void>;
  /** Enables "Remove" when there is an image. Same contract as onSave. */
  onRemove?: () => Promise<void>;
}

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const PREVIEW_WIDTH = 320;

type Busy = null | 'loading' | 'saving' | 'removing';

/**
 * Pick an image, frame it (drag, zoom, rotate, straighten), see a live preview,
 * and upload a right-sized JPEG.
 *
 * Cropping in the browser means every avatar, logo and banner arrives in the
 * same shape, and a phone photo that would be refused for size never reaches
 * the server as-is.
 */
export default function ImageCropModal({
  open, onClose, variant = 'avatar', title, currentSrc, initials, onSave, onRemove,
}: ImageCropModalProps) {
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBanner = variant === 'banner';
  const aspect = isBanner ? 3 : 1;
  const cropShape: 'round' | 'rect' = variant === 'avatar' ? 'round' : 'rect';
  const outputWidth = isBanner ? BANNER_OUTPUT_WIDTH : LOGO_OUTPUT_SIZE;
  const outputHeight = Math.round(outputWidth / aspect);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [straighten, setStraighten] = useState(0);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const rotation = quarterTurns * 90 + straighten;

  const resetFraming = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setQuarterTurns(0);
    setStraighten(0);
  };

  // Fresh state every time the window opens; free the image when it closes.
  useEffect(() => {
    if (!open) return;
    setImageUrl(null);
    setPixels(null);
    setPreviewUrl(null);
    setError(null);
    setBusy(null);
    setConfirmRemove(false);
    setDragOver(false);
    resetFraming();
  }, [open]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const handleClose = useCallback(() => {
    if (busy === 'saving' || busy === 'removing') return;
    onClose();
  }, [busy, onClose]);

  // Through a ref: the parent's onClose is a new function on every render, and
  // the app re-renders every few seconds.
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Live preview of the exact image that will be uploaded (debounced).
  useEffect(() => {
    if (!imageUrl || !pixels) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      renderCrop(imageUrl, pixels, rotation, PREVIEW_WIDTH, Math.round(PREVIEW_WIDTH / aspect))
        .then((canvas) => { if (!cancelled) setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85)); })
        .catch(() => { /* the preview is cosmetic */ });
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [imageUrl, pixels, rotation, aspect]);

  const acceptFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) { setError(t('employees.avatarEditor.invalidType')); return; }
    if (file.size > MAX_INPUT_BYTES) { setError(t('employees.avatarEditor.tooLarge')); return; }
    setBusy('loading');
    try {
      const url = await prepareSourceImage(file);
      resetFraming();
      setPixels(null);
      setPreviewUrl(null);
      setImageUrl(url);
    } catch {
      setError(t('employees.avatarEditor.unreadable'));
    } finally {
      setBusy(null);
    }
  };

  const openPicker = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const handleSave = async () => {
    if (!imageUrl || !pixels || busy) return;
    setBusy('saving');
    setError(null);
    let file: File;
    try {
      const canvas = await renderCrop(imageUrl, pixels, rotation, outputWidth, outputHeight);
      file = await canvasToFile(canvas, isBanner ? 'banner.jpg' : 'image.jpg');
    } catch {
      setError(t('employees.avatarEditor.processError'));
      setBusy(null);
      return;
    }
    try {
      await onSave(file);
      setBusy(null);
      onClose();
    } catch {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    if (!onRemove || busy) return;
    setBusy('removing');
    try {
      await onRemove();
      setBusy(null);
      onClose();
    } catch {
      setBusy(null);
      setConfirmRemove(false);
    }
  };

  if (!open) return null;

  const cropHeight = isMobile ? 300 : 360;
  const locked = busy === 'saving' || busy === 'removing';
  const previewRadius = variant === 'avatar' ? '50%' : isBanner ? 8 : 12;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-editor-title"
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(13,33,55,0.62)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 16,
        animation: 'fadeIn 0.18s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: isBanner ? 860 : 720,
          maxHeight: isMobile ? '94vh' : '92vh',
          background: 'var(--surface)',
          borderRadius: isMobile ? '20px 20px 0 0' : 20,
          boxShadow: '0 30px 90px rgba(0,0,0,0.30)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: isMobile ? 'fadeSlideUp 0.28s cubic-bezier(0.16,1,0.3,1)' : 'popIn 0.24s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
          padding: isMobile ? '18px 18px 14px' : '22px 26px 16px',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="image-editor-title" style={{
              margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700,
              color: 'var(--text-primary)', letterSpacing: '-0.02em',
            }}>
              {title ?? t('employees.avatarEditor.title')}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {t('employees.avatarEditor.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={locked}
            aria-label={t('employees.avatarViewer.close')}
            style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: locked ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: isMobile ? 16 : 24, overflowY: 'auto', flex: 1 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => { void acceptFile(e.target.files?.[0]); e.target.value = ''; }}
          />

          {!imageUrl ? (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 18, alignItems: 'stretch' }}>
              {currentSrc && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '8px 4px', minWidth: isMobile ? undefined : isBanner ? 220 : 150,
                }}>
                  <img
                    src={currentSrc}
                    alt=""
                    style={{
                      width: isBanner ? 200 : 112,
                      height: isBanner ? 67 : 112,
                      borderRadius: previewRadius,
                      objectFit: 'cover',
                      border: '3px solid rgba(201,151,58,0.40)', boxShadow: 'var(--shadow)',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {t('employees.avatarEditor.current')}
                  </span>
                </div>
              )}

              <div
                role="button"
                tabIndex={0}
                onClick={openPicker}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); void acceptFile(e.dataTransfer.files?.[0]); }}
                style={{
                  flex: 1, minHeight: isMobile ? 220 : 260,
                  borderRadius: 16,
                  border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                  background: dragOver
                    ? 'linear-gradient(160deg, rgba(201,151,58,0.14), rgba(201,151,58,0.04))'
                    : 'linear-gradient(160deg, var(--surface-warm), var(--background))',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 12, padding: 24, textAlign: 'center',
                  cursor: busy ? 'wait' : 'pointer',
                  transition: 'border-color 0.15s, background 0.15s, transform 0.15s',
                  transform: dragOver ? 'scale(1.01)' : 'none',
                  outline: 'none',
                }}
              >
                {busy === 'loading' ? (
                  <Spinner size="lg" color="var(--accent)" />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: 18,
                    background: 'linear-gradient(145deg, var(--primary), var(--primary-hover))',
                    color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 10px 26px rgba(13,33,55,0.28)',
                  }}>
                    <ImagePlus size={28} />
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {dragOver ? t('employees.avatarEditor.dropActive') : t('employees.avatarEditor.dropTitle')}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.5 }}>
                  {t('employees.avatarEditor.dropHint')}
                </div>
                <span style={{
                  marginTop: 4, padding: '8px 18px', borderRadius: 999,
                  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
                  boxShadow: 'var(--shadow-accent)',
                }}>
                  {t('employees.avatarEditor.choose')}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: isMobile || isBanner ? 'column' : 'row', gap: isMobile ? 16 : 22 }}>
              {/* Cropper + controls */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  position: 'relative', height: cropHeight, borderRadius: 16, overflow: 'hidden',
                  background: 'repeating-conic-gradient(#1b2a3b 0% 25%, #16222f 0% 50%) 50% / 22px 22px',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
                }}>
                  <Cropper
                    image={imageUrl}
                    crop={crop}
                    zoom={zoom}
                    rotation={rotation}
                    aspect={aspect}
                    cropShape={cropShape}
                    showGrid={isBanner}
                    minZoom={MIN_ZOOM}
                    maxZoom={MAX_ZOOM}
                    zoomSpeed={0.25}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_area, areaPixels) => setPixels(areaPixels)}
                    style={{
                      cropAreaStyle: {
                        border: '3px solid rgba(201,151,58,0.95)',
                        boxShadow: '0 0 0 9999em rgba(8,20,34,0.62)',
                      },
                    }}
                  />
                </div>

                {/* Zoom */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                  <IconButton label={t('employees.avatarEditor.zoomOut')} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.2).toFixed(2)))} disabled={locked}>
                    <ZoomOut size={16} />
                  </IconButton>
                  <input
                    type="range"
                    aria-label={t('employees.avatarEditor.zoom')}
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={zoom}
                    disabled={locked}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <IconButton label={t('employees.avatarEditor.zoomIn')} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.2).toFixed(2)))} disabled={locked}>
                    <ZoomIn size={16} />
                  </IconButton>
                  <span style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(zoom * 100)}%
                  </span>
                </div>

                {/* Straighten + quarter turns */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <IconButton label={t('employees.avatarEditor.rotateLeft')} onClick={() => setQuarterTurns((q) => (q + 3) % 4)} disabled={locked}>
                    <RotateCcw size={16} />
                  </IconButton>
                  <input
                    type="range"
                    aria-label={t('employees.avatarEditor.straighten')}
                    title={t('employees.avatarEditor.straighten')}
                    min={-45}
                    max={45}
                    step={1}
                    value={straighten}
                    disabled={locked}
                    onChange={(e) => setStraighten(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--primary-mid)', cursor: 'pointer' }}
                  />
                  <IconButton label={t('employees.avatarEditor.rotateRight')} onClick={() => setQuarterTurns((q) => (q + 1) % 4)} disabled={locked}>
                    <RotateCw size={16} />
                  </IconButton>
                  <span style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {rotation > 180 ? rotation - 360 : rotation}°
                  </span>
                </div>
              </div>

              {/* Preview column */}
              <div style={{
                width: isMobile || isBanner ? '100%' : 196, flexShrink: 0,
                display: 'flex', flexDirection: isBanner ? 'column' : isMobile ? 'row' : 'column',
                alignItems: 'center', justifyContent: isMobile && !isBanner ? 'space-between' : 'flex-start',
                gap: 14,
                padding: isMobile ? '14px 16px' : '18px 14px',
                borderRadius: 16,
                background: 'linear-gradient(170deg, var(--surface-warm), var(--background))',
                border: '1px solid var(--border-light)',
              }}>
                <div style={{ textAlign: isMobile && !isBanner ? 'left' : 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {t('employees.avatarEditor.preview')}
                  </div>
                  {!isMobile && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-disabled)', marginTop: 3 }}>
                      {t('employees.avatarEditor.previewHint')}
                    </div>
                  )}
                </div>

                {isBanner ? (
                  <div style={{
                    width: '100%', aspectRatio: '3 / 1', borderRadius: 10, overflow: 'hidden',
                    background: 'var(--primary)', border: '2px solid var(--surface)', boxShadow: 'var(--shadow-sm)',
                  }}>
                    {previewUrl && (
                      <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: 12 }}>
                    <PreviewTile src={previewUrl} initials={initials} size={isMobile ? 76 : 116} radius={previewRadius} ring />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PreviewTile src={previewUrl} initials={initials} size={44} radius={previewRadius} />
                      <PreviewTile src={previewUrl} initials={initials} size={30} radius={previewRadius} />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={openPicker}
                  disabled={locked || busy === 'loading'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 999,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
                    cursor: locked ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {busy === 'loading' ? <Spinner size="sm" /> : <RefreshCw size={13} />}
                  {t('employees.avatarEditor.chooseAnother')}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 10,
              background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
              color: 'var(--danger)', fontSize: 13, fontWeight: 500,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
          padding: isMobile ? '14px 16px calc(14px + env(safe-area-inset-bottom))' : '16px 26px',
          borderTop: '1px solid var(--border-light)', background: 'var(--surface-warm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
            {currentSrc && onRemove && (
              confirmRemove ? (
                <>
                  <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {t('employees.avatarEditor.confirmRemove')}
                  </span>
                  <FooterButton tone="danger" onClick={() => void handleRemove()} disabled={locked}>
                    {busy === 'removing' ? <Spinner size="sm" color="#fff" /> : <Trash2 size={14} />}
                    {t('employees.avatarEditor.confirmRemoveYes')}
                  </FooterButton>
                  <FooterButton tone="ghost" onClick={() => setConfirmRemove(false)} disabled={locked}>
                    {t('employees.avatarEditor.cancel')}
                  </FooterButton>
                </>
              ) : (
                <FooterButton tone="dangerGhost" onClick={() => setConfirmRemove(true)} disabled={locked}>
                  <Trash2 size={14} />
                  {t('employees.avatarEditor.remove')}
                </FooterButton>
              )
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            {imageUrl && (
              <FooterButton tone="ghost" onClick={resetFraming} disabled={locked}>
                <Undo2 size={14} />
                {t('employees.avatarEditor.reset')}
              </FooterButton>
            )}
            <FooterButton tone="secondary" onClick={handleClose} disabled={locked}>
              {t('employees.avatarEditor.cancel')}
            </FooterButton>
            <FooterButton tone="primary" onClick={() => void handleSave()} disabled={!imageUrl || !pixels || !!busy}>
              {busy === 'saving' ? <Spinner size="sm" color="#fff" /> : <Check size={15} />}
              {busy === 'saving' ? t('employees.avatarEditor.saving') : t('employees.avatarEditor.save')}
            </FooterButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: 34, height: 34, flexShrink: 0, borderRadius: 10,
        border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      {children}
    </button>
  );
}

const FOOTER_TONES: Record<'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost', React.CSSProperties> = {
  primary: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', boxShadow: 'var(--shadow-accent)' },
  secondary: { background: 'var(--surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)' },
  ghost: { background: 'transparent', color: 'var(--text-muted)', borderColor: 'transparent' },
  danger: { background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' },
  dangerGhost: { background: 'transparent', color: 'var(--danger)', borderColor: 'transparent' },
};

function FooterButton({ tone, onClick, disabled, children }: {
  tone: keyof typeof FOOTER_TONES; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 10, border: '1px solid transparent',
        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        transition: 'filter 0.15s, opacity 0.15s',
        ...FOOTER_TONES[tone],
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(0.95)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
    >
      {children}
    </button>
  );
}

function PreviewTile({ src, initials, size, radius, ring }: {
  src: string | null; initials?: string; size: number; radius: string | number; ring?: boolean;
}) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0,
      background: 'var(--primary)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: Math.max(10, size * 0.32),
      border: ring ? '3px solid rgba(201,151,58,0.45)' : '2px solid var(--surface)',
      boxShadow: ring ? '0 8px 24px rgba(13,33,55,0.20)' : 'var(--shadow-sm)',
    }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : initials}
    </div>
  );
}
