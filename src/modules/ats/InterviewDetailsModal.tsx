import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Phone, Users, Video, MapPin, Calendar, Clock, User, Briefcase, Trash2, Save, Building2, Store as StoreIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Interview } from '../../api/ats';
import { getAvatarUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DatePicker } from '../../components/ui/DatePicker';
import { TimePicker } from '../../components/ui/TimePicker';
import { fullName, initials, formatDuration, INTERVIEW_TYPE_PALETTES } from './atsCalendarUtils';

interface InterviewDetailsModalProps {
  interview: Interview;
  onClose: () => void;
  onSave: (updates: Partial<Interview>) => Promise<void>;
  onDelete: () => Promise<void>;
}

const INTERVIEW_TYPE_OPTIONS = [
  { value: 'phone', label: 'Phone Interview', icon: Phone },
  { value: 'in_person', label: 'In-Person Interview', icon: Users },
  { value: 'video', label: 'Video Interview', icon: Video },
];

export default function InterviewDetailsModal({
  interview,
  onClose,
  onSave,
  onDelete,
}: InterviewDetailsModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Check if user is store manager
  const isStoreManager = user?.role === 'store_manager';

  // Form state - parse scheduledAt into date and time
  const scheduledAtDate = new Date(interview.scheduledAt);
  const initialDate = scheduledAtDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const initialTime = scheduledAtDate.toTimeString().slice(0, 5); // HH:mm
  
  const [interviewType, setInterviewType] = useState<Interview['interviewType']>(
    interview.interviewType
  );
  const [scheduledDate, setScheduledDate] = useState(initialDate);
  const [scheduledTime, setScheduledTime] = useState(initialTime);
  const [durationMinutes, setDurationMinutes] = useState(String(interview.durationMinutes || 60));
  const [location, setLocation] = useState(interview.location ?? '');
  const [notes, setNotes] = useState(interview.notes ?? '');
  const [description, setDescription] = useState(interview.description ?? '');

  const candidateFullName = fullName(interview.candidateName || '', interview.candidateSurname || '');
  const candidateInitials = initials(interview.candidateName || '', interview.candidateSurname || '');
  const candidateAvatarUrl = getAvatarUrl(interview.candidateAvatarFilename);

  const interviewerFullName = interview.interviewerName
    ? fullName(interview.interviewerName, interview.interviewerSurname || '')
    : null;

  const typePalette =
    INTERVIEW_TYPE_PALETTES[interviewType] ?? INTERVIEW_TYPE_PALETTES.in_person;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Combine date and time into ISO string
      const scheduledAt = `${scheduledDate}T${scheduledTime}:00`;
      
      await onSave({
        interviewType,
        scheduledAt,
        durationMinutes: parseInt(durationMinutes, 10),
        location: location || null,
        notes: notes || null,
        description: description || null,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save interview:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      console.error('Failed to delete interview:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancel = () => {
    // Reset form
    const scheduledAtDate = new Date(interview.scheduledAt);
    setInterviewType(interview.interviewType);
    setScheduledDate(scheduledAtDate.toISOString().split('T')[0]);
    setScheduledTime(scheduledAtDate.toTimeString().slice(0, 5));
    setDurationMinutes(String(interview.durationMinutes || 60));
    setLocation(interview.location ?? '');
    setNotes(interview.notes ?? '');
    setDescription(interview.description ?? '');
    setIsEditing(false);
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(13,33,55,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 700,
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
          animation: 'popIn 0.22s cubic-bezier(0.16,1,0.3,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, #0D2137 0%, #1e3a5f 100%)',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calendar size={22} color="#fff" />
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {t('ats.interviewDetails', 'Interview Details')}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          >
            <X size={18} color="#fff" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px' }}>
          {/* Candidate Section */}
          <div
            style={{
              marginBottom: 18,
              padding: 16,
              background: 'var(--surface-warm)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--primary)',
            }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: 'var(--primary)',
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <User size={13} />
              {t('ats.candidate', 'Candidate')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {candidateAvatarUrl ? (
                <img
                  src={candidateAvatarUrl}
                  alt={candidateFullName}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid rgba(13, 33, 55, 0.14)',
                    boxShadow: '0 4px 12px rgba(13, 33, 55, 0.10)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-mid) 100%)',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 800,
                    border: '3px solid rgba(13, 33, 55, 0.14)',
                    boxShadow: '0 4px 12px rgba(13, 33, 55, 0.10)',
                  }}
                >
                  {candidateInitials}
                </div>
              )}
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {candidateFullName}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Briefcase size={13} />
                  {interview.positionTitle || t('ats.noPosition', 'No position specified')}
                </div>
              </div>
            </div>
          </div>

          {/* Interview Details Section */}
          <div
            style={{
              marginBottom: 18,
              padding: 16,
              background: 'var(--surface-warm)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              // Accent bar picks up the interview type's colour so the modal
              // visually matches the block the user clicked to open it.
              borderLeft: `3px solid ${typePalette.leftBorder}`,
            }}
          >
            <div
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: typePalette.text,
                marginBottom: 14,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Calendar size={13} />
              {t('ats.interviewDetails', 'Interview Details')}
            </div>

            {/* Interview Type */}
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 7,
                }}
              >
                {t('ats.interviewType', 'Interview Type')}
              </label>
              {isEditing ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {INTERVIEW_TYPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = interviewType === option.value;
                    // Each option previews its own calendar colour, so the choice
                    // made here is recognisable later in the grid.
                    const optionPalette =
                      INTERVIEW_TYPE_PALETTES[option.value] ?? INTERVIEW_TYPE_PALETTES.in_person;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setInterviewType(option.value as Interview['interviewType'])}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: isSelected
                            ? `2px solid ${optionPalette.leftBorder}`
                            : '1px solid var(--border)',
                          background: isSelected ? optionPalette.bg : 'var(--surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.15s',
                        }}
                      >
                        <Icon
                          size={20}
                          color={isSelected ? optionPalette.iconColor : 'var(--text-muted)'}
                        />
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: isSelected ? 700 : 600,
                            color: isSelected ? optionPalette.text : 'var(--text-secondary)',
                          }}
                        >
                          {t(`ats.interviewType.${option.value}`, option.label)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(() => {
                    const Icon = INTERVIEW_TYPE_ICONS[interview.interviewType];
                    return (
                      <>
                        <Icon size={18} color={typePalette.iconColor} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                          {t(`ats.interviewType.${interview.interviewType}`, interview.interviewType)}
                        </span>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Date and Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 7,
                  }}
                >
                  {t('ats.date', 'Date')}
                </label>
                {isEditing ? (
                  <DatePicker
                    value={scheduledDate}
                    onChange={(value) => setScheduledDate(value)}
                  />
                ) : (
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    {new Date(scheduledDate).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  {t('ats.time', 'Time')}
                </label>
                {isEditing ? (
                  <TimePicker
                    value={scheduledTime}
                    onChange={(value) => setScheduledTime(value)}
                  />
                ) : (
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    {scheduledTime ? scheduledTime.slice(0, 5) : '-'}
                  </div>
                )}
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  {t('ats.duration', 'Duration')}
                </label>
                {isEditing ? (
                  <Input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    placeholder="60"
                    min="15"
                    step="15"
                  />
                ) : (
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    {formatDuration(interview.durationMinutes || 60)}
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            {(interviewType === 'in_person' || !isEditing && interview.location) && (
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  <MapPin size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {t('ats.location', 'Location')}
                </label>
                {isEditing ? (
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('ats.locationPlaceholder', 'Enter location')}
                  />
                ) : (
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    {interview.location || '-'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interviewer Section */}
          {interviewerFullName && (
            <div
              style={{
                marginBottom: 18,
                padding: 16,
                background: 'var(--surface-warm)',
                borderRadius: 10,
                border: '1px solid var(--border)',
                borderLeft: '3px solid var(--accent)',
              }}
            >
              <div
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: 'var(--accent-hover)',
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <User size={13} />
                {t('ats.interviewer', 'Interviewer')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
                    color: '#fff',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    border: '2px solid rgba(201, 151, 58, 0.30)',
                  }}
                >
                  {interviewerFullName.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {interviewerFullName}
                </span>
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 7,
              }}
            >
              {t('ats.description', 'Description')}
            </label>
            {isEditing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('ats.descriptionPlaceholder', 'Interview description...')}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            ) : (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {interview.description || '-'}
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 7,
              }}
            >
              {t('ats.notes', 'Notes')}
            </label>
            {isEditing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('ats.notesPlaceholder', 'Add notes...')}
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            ) : (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {interview.notes || '-'}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            {!isEditing && !isStoreManager && (
              <Button
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={16} />
                {t('common.delete', 'Delete')}
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {isEditing ? (
              <>
                <Button variant="secondary" onClick={handleCancel} disabled={saving}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Save size={16} />
                  {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                </Button>
              </>
            ) : (
              !isStoreManager && (
                <Button variant="primary" onClick={() => setIsEditing(true)}>
                  {t('common.edit', 'Edit')}
                </Button>
              )
            )}
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm &&
          createPortal(
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9100,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
              onClick={() => setShowDeleteConfirm(false)}
            >
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  width: '100%',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700 }}>
                  {t('ats.deleteInterviewConfirm', 'Delete Interview?')}
                </h3>
                <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {t(
                    'ats.deleteInterviewWarning',
                    'This action cannot be undone. The interview will be permanently deleted.'
                  )}
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>,
    document.body
  );
}

const INTERVIEW_TYPE_ICONS: Record<string, typeof Phone> = {
  phone: Phone,
  in_person: Users,
  video: Video,
};
