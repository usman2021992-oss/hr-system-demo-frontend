import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Camera } from 'lucide-react';

interface AvatarLightboxProps {
  open: boolean;
  src: string;
  name: string;
  /** Second line under the name, e.g. the role. */
  caption?: string | null;
  onClose: () => void;
  /** Shows a "Change photo" action when given. */
  onChange?: () => void;
}

/** Full-screen view of a profile photo. */
export default function AvatarLightbox({ open, src, name, caption, onClose, onChange }: AvatarLightboxProps) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Parents pass a fresh onClose on every render (the app re-renders every few
  // seconds); reading it through a ref keeps the effects below from re-running.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Fade in once per photo. An image already in the browser cache may finish
  // before onLoad is attached, so `complete` is checked as well.
  useEffect(() => {
    if (!open) return;
    const img = imgRef.current;
    setLoaded(!!img && img.complete && img.naturalWidth > 0);
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'radial-gradient(circle at 50% 40%, rgba(22,51,82,0.82) 0%, rgba(8,20,34,0.94) 70%)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, gap: 22,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={t('employees.avatarViewer.close')}
        title={t('employees.avatarViewer.close')}
        style={{
          position: 'absolute', top: 18, right: 18,
          width: 42, height: 42, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(255,255,255,0.08)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'background 0.15s, transform 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'rotate(90deg)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'none'; }}
      >
        <X size={20} />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(78vw, 64vh, 460px)',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          padding: 6,
          background: 'linear-gradient(145deg, rgba(201,151,58,0.95), rgba(201,151,58,0.25) 45%, rgba(255,255,255,0.10))',
          boxShadow: '0 30px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
          animation: 'popIn 0.32s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
          background: 'rgba(255,255,255,0.06)',
        }}>
          <img
            ref={imgRef}
            src={src}
            alt={name}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              opacity: loaded ? 1 : 0, transform: loaded ? 'scale(1)' : 'scale(1.04)',
              transition: 'opacity 0.35s ease, transform 0.5s cubic-bezier(0.16,1,0.3,1)',
            }}
          />
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ textAlign: 'center', color: '#fff', animation: 'fadeSlideUp 0.35s ease 0.05s both' }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {name}
        </div>
        {caption && (
          <div style={{ marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.62)' }}>{caption}</div>
        )}
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            style={{
              marginTop: 16,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 18px', borderRadius: 999,
              border: '1px solid rgba(201,151,58,0.55)',
              background: 'rgba(201,151,58,0.14)', color: '#F3D9A4',
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,151,58,0.26)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,151,58,0.14)'; }}
          >
            <Camera size={15} />
            {t('employees.avatarViewer.change')}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
