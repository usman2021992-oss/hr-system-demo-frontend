import type { Notification } from '../api/notifications';

export function getNotificationNavigationUrl(notification: Notification): string | null {
  const { type, metadata } = notification;

  // Deep-link for ATS feedback notifications
  if (type === 'ats.feedback_added' && metadata?.candidateId) {
    const params = new URLSearchParams();
    params.set('view', 'candidates');
    params.set('candidateId', String(metadata.candidateId));
    if (metadata.interviewId) params.set('interviewId', String(metadata.interviewId));
    if (metadata.feedbackId) params.set('feedbackId', String(metadata.feedbackId));
    return `/ats?${params.toString()}`;
  }

  // Deep-link for ATS outcome notifications (status change)
  if (type === 'ats.outcome' && metadata?.candidateId) {
    const params = new URLSearchParams();
    params.set('view', 'candidates');
    params.set('candidateId', String(metadata.candidateId));
    return `/ats?${params.toString()}`;
  }

  if (type.startsWith('ats.')) {
    return '/ats?view=candidates';
  }

  if (type.startsWith('employee.')) {
    return '/dipendenti';
  }

  if (type.startsWith('shift.')) {
    return '/turni';
  }

  if (type.startsWith('attendance.')) {
    return '/presenze';
  }

  if (type.startsWith('leave.')) {
    return '/permessi';
  }

  if (type.startsWith('document.')) {
    return '/documenti';
  }

  if (type.startsWith('onboarding.')) {
    return '/onboarding';
  }

  if (type.startsWith('manager.')) {
    return '/ats?view=alerts';
  }

  return null;
}
