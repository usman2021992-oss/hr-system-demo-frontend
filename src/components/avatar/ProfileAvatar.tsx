import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Maximize2 } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import ImagePreviewModal from '../media/ImagePreviewModal';
import ImageCropModal from '../media/ImageCropModal';

interface ProfileAvatarProps {
  /** Authenticated URL of the current photo, or null for initials. */
  src: string | null;
  name: string;
  initials: string;
  /** Background behind the initials. */
  fallbackBg: string;
  /** Second line in the full-screen view (e.g. the role). */
  caption?: string | null;
  size?: number;
  /** Shows the camera badge and lets the photo be changed. */
  editable?: boolean;
  /** Upload in progress elsewhere (e.g. a preset avatar being applied). */
  busy?: boolean;
  onUpload?: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
}

/**
 * The round profile photo used on the employee page and on "My profile".
 * Clicking the photo opens it large; the camera badge opens the editor.
 */
export default function ProfileAvatar({
  src, name, initials, fallbackBg, caption, size = 72, editable, busy, onUpload, onRemove,
}: ProfileAvatarProps) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hover, setHover] = useState(false);

  const canEdit = editable === true && !!onUpload;
  const canView = !!src;
  const badge = Math.max(24, Math.round(size * 0.36));

  const openEditor = () => {
    if (busy) return;
    setViewing(false);
    setEditing(true);
  };

  const handleAvatarClick = () => {
    if (canView) setViewing(true);
    else if (canEdit) openEditor();
  };

  const interactive = canView || canEdit;

  return (
    <>
      <div style={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
        <button
          type="button"
          onClick={handleAvatarClick}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          disabled={!interactive}
          aria-label={canView ? t('employees.avatarViewer.open') : t('employees.uploadAvatar')}
          title={canView ? t('employees.avatarViewer.open') : canEdit ? t('employees.uploadAvatar') : undefined}
          style={{
            width: size, height: size, borderRadius: '50%', padding: 0,
            background: src ? 'transparent' : fallbackBg,
            border: '3px solid rgba(201,151,58,0.40)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: Math.round(size / 3), fontWeight: 700, color: '#fff',
            fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
            boxShadow: hover && interactive ? '0 8px 26px rgba(0,0,0,0.30)' : '0 4px 16px rgba(0,0,0,0.24)',
            overflow: 'hidden', position: 'relative',
            cursor: interactive ? (canView ? 'zoom-in' : 'pointer') : 'default',
            transform: hover && interactive ? 'scale(1.04)' : 'scale(1)',
            transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s',
          }}
        >
          {src ? (
            <img src={src} alt={name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : initials}

          {interactive && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(13,33,55,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: hover ? 1 : 0, transition: 'opacity 0.18s',
              color: '#fff', pointerEvents: 'none',
            }}>
              {canView ? <Maximize2 size={Math.round(size / 4)} /> : <Camera size={Math.round(size / 4)} />}
            </span>
          )}
        </button>

        {canEdit && (
          <button
            type="button"
            onClick={openEditor}
            disabled={busy}
            aria-label={src ? t('employees.changeAvatar') : t('employees.uploadAvatar')}
            title={src ? t('employees.changeAvatar') : t('employees.uploadAvatar')}
            style={{
              position: 'absolute', bottom: -2, right: -2,
              width: badge, height: badge, borderRadius: '50%', padding: 0,
              background: 'var(--accent)', border: '2px solid var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
              boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={(e) => { if (!busy) e.currentTarget.style.transform = 'scale(1.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {busy ? <Spinner size="sm" color="#fff" /> : <Camera size={Math.round(badge * 0.5)} />}
          </button>
        )}
      </div>

      {src && (
        <ImagePreviewModal
          open={viewing}
          src={src}
          title={name}
          caption={caption}
          shape="round"
          onClose={() => setViewing(false)}
          onChange={canEdit ? openEditor : undefined}
        />
      )}

      {canEdit && (
        <ImageCropModal
          open={editing}
          onClose={() => setEditing(false)}
          currentSrc={src}
          initials={initials}
          onSave={onUpload!}
          onRemove={src ? onRemove : undefined}
        />
      )}
    </>
  );
}
