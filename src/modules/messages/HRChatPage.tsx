import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Reply, Plus, Inbox, Send, ArrowLeft, Image, Trash2, Check, CheckCheck, MoreVertical, Edit2, Lock, Link2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Message } from '../../types';
import {
  getMessages, markMessageAsRead, getHrRecipient, sendMessage, editMessage, deleteMessage
} from '../../api/messages';
import apiClient, { getAvatarUrl, getMessageAttachmentUrl } from '../../api/client';
import { translateApiError } from '../../utils/apiErrors';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { ComposeMessage } from './ComposeMessage';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useSocket } from '../../context/SocketContext';
import { PlatformReferencePicker } from './PlatformReferencePicker';
import {
  PlatformReference,
  ReferenceChip,
  buildReferenceToken,
  parseReferenceToken,
  stripReferenceTokens,
} from './platformReference';

/* ─── helpers ────────────────────────────────────────────────────────────── */

function formatRelativeDate(dateStr: string, lang: string): string {
  try {
    const locale = lang.startsWith('it') ? 'it-IT' : 'en-GB';
    const d = new Date(dateStr);
    const diffHours = (Date.now() - d.getTime()) / 3_600_000;
    if (diffHours < 1) {
      const mins = Math.max(1, Math.round(diffHours * 60));
      return lang.startsWith('it') ? `${mins}m fa` : `${mins}m ago`;
    }
    if (diffHours < 24) {
      return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    }
    if (diffHours < 168) {
      return d.toLocaleDateString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

const AVATAR_COLORS = ['#0284C7', '#15803D', '#7C3AED', '#C9973A', '#0891B2', '#DC2626', '#D97706'];
function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}
function initials(name: string): string {
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

/* ─── sub-components ─────────────────────────────────────────────────────── */

const Avatar: React.FC<{ name: string; avatarFilename?: string | null; size?: number }> = ({ name, avatarFilename, size = 36 }) => {
  const color = avatarColor(name);
  const avatarUrl = getAvatarUrl(avatarFilename);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}1A`, border: `2px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color, fontWeight: 800, fontSize: size * 0.36,
      fontFamily: 'var(--font-display)', flexShrink: 0,
      overflow: 'hidden',
    }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : initials(name)}
    </div>
  );
};

interface Conversation {
  otherPartyId: number;
  otherPartyName: string;
  otherPartyRole: string | null;
  otherPartyAvatarFilename: string | null;
  messages: Message[];
  lastMessage: Message;
}

interface ConversationRowProps {
  conv: Conversation;
  isSelected: boolean;
  lang: string;
  onClick: () => void;
}

const ConversationRow: React.FC<ConversationRowProps> = ({ conv, isSelected, lang, onClick }) => {
  const unreadCount = conv.messages.filter(m => m.direction === 'received' && !m.isRead).length;
  
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', border: 'none',
        padding: '14px 16px',
        background: isSelected
          ? 'var(--accent-light)'
          : unreadCount > 0 ? 'rgba(201,151,58,0.04)' : 'transparent',
        cursor: 'pointer',
        borderLeft: `3px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
        transition: 'background 0.15s',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-warm)';
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background =
          unreadCount > 0 ? 'rgba(201,151,58,0.04)' : 'transparent';
      }}
    >
      <Avatar name={conv.otherPartyName} avatarFilename={conv.otherPartyAvatarFilename} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 13, fontWeight: unreadCount > 0 ? 700 : 500,
            color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {conv.otherPartyName}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-disabled)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {formatRelativeDate(conv.lastMessage.createdAt, lang)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {unreadCount > 0 && (
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          )}
          {(() => {
            const rawBody = conv.lastMessage.body || '';
            const cleanBody = stripReferenceTokens(rawBody);
            const refTitle = parseReferenceToken(rawBody)?.title ?? null;

            const snippet = conv.lastMessage.subject
              ? conv.lastMessage.subject
              : cleanBody
                ? cleanBody
                : refTitle
                  ? `🔗 ${refTitle}`
                  : ((conv.lastMessage.attachmentFilename || (conv.lastMessage as any).attachment_filename)
                    ? (lang.startsWith('it') ? '📷 Foto' : '📷 Photo')
                    : '—');

            return (
              <span style={{
                fontSize: 12, color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: unreadCount > 0 ? 600 : 400,
              }}>
                {snippet}
              </span>
            );
          })()}
        </div>
      </div>
      {unreadCount > 0 && (
        <span style={{
          alignSelf: 'center',
          background: 'var(--accent)', color: '#fff',
          fontSize: 10, fontWeight: 700, borderRadius: 99,
          padding: '2px 6px', minWidth: 18, textAlign: 'center',
        }}>
          {unreadCount}
        </span>
      )}
    </button>
  );
};

const EmptyDetail: React.FC<{ t: (k: string) => string }> = ({ t }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', padding: 40, gap: 12, color: 'var(--text-disabled)',
    minHeight: 480,
  }}>
    <Inbox size={36} strokeWidth={1.5} />
    <div style={{ fontSize: 13, fontWeight: 500 }}>{t('messages.selectMessage')}</div>
  </div>
);

/* ─── main page ──────────────────────────────────────────────────────────── */

export default function HRChatPage() {
  const { user, targetCompanyId, allowedCompanyIds } = useAuth();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();
  const { socket } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();

  const isEmployee = user?.role === 'employee';
  const activeCompanyId = targetCompanyId ?? user?.companyId ?? null;
  const useAllAccessibleCompanies = allowedCompanyIds.length > 1;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [placeholderConversation, setPlaceholderConversation] = useState<Conversation | null>(null);
  
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipient, setComposeRecipient] = useState<{ id: number; name: string } | null>(null);
  const [composeDefaultSubject, setComposeDefaultSubject] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  
  // Input area states
  const [replyText, setReplyText] = useState('');
  const [showSubjectInput, setShowSubjectInput] = useState(false);
  const [subjectText, setSubjectText] = useState('');
  
  // Image attachments states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  
  // Platform Reference attachment
  const [showRefPicker, setShowRefPicker] = useState(false);
  const [selectedRef, setSelectedRef] = useState<PlatformReference | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [showOptionsId, setShowOptionsId] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Group messages into conversations
  const conversationsMap: Record<number, Conversation> = {};

  messages.forEach(msg => {
    const isSent = msg.direction === 'sent';
    const otherPartyId = isSent ? msg.recipientId : msg.senderId;
    const otherPartyName = isSent
      ? (msg.recipientName ?? '—')
      : (msg.senderName ?? '—');
    const otherPartyRole = isSent
      ? (msg.recipientRole ?? null)
      : (msg.senderRole ?? null);
    const otherPartyAvatarFilename = isSent
      ? (msg.recipientAvatarFilename ?? null)
      : (msg.senderAvatarFilename ?? null);

    if (!conversationsMap[otherPartyId]) {
      conversationsMap[otherPartyId] = {
        otherPartyId,
        otherPartyName,
        otherPartyRole,
        otherPartyAvatarFilename,
        messages: [],
        lastMessage: msg,
      };
    }
    conversationsMap[otherPartyId].messages.push(msg);
  });

  const conversationsList = Object.values(conversationsMap).sort((a, b) => {
    return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
  });

  // Sort messages in each conversation oldest to newest
  conversationsList.forEach(conv => {
    conv.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  // Handle URL deep-linking parameters
  useEffect(() => {
    const recipientIdStr = searchParams.get('recipientId');
    const recipientName = searchParams.get('recipientName');
    const subject = searchParams.get('subject');
    const shouldOpenCompose = Boolean(recipientName || subject);

    if (recipientIdStr) {
      const recipientId = parseInt(recipientIdStr, 10);
      if (!isNaN(recipientId)) {
        const decodedName = recipientName ? decodeURIComponent(recipientName) : '—';
        
        // Setup placeholder conversation if not already exists in real list
        const exists = conversationsList.some(c => c.otherPartyId === recipientId);
        if (!exists) {
          setPlaceholderConversation({
            otherPartyId: recipientId,
            otherPartyName: decodedName,
            otherPartyRole: null,
            otherPartyAvatarFilename: null,
            messages: [],
            lastMessage: {
              id: -1,
              subject: subject ? decodeURIComponent(subject) : '',
              body: '',
              isRead: true,
              createdAt: new Date().toISOString(),
              companyId: activeCompanyId ?? 0,
              senderId: user?.id ?? 0,
              recipientId: recipientId,
              direction: 'sent',
            } as any
          });
        }
        
        setSelectedConversationId(recipientId);

        if (shouldOpenCompose) {
          setComposeRecipient({
            id: recipientId,
            name: decodedName,
          });
          if (subject) {
            setComposeDefaultSubject(decodeURIComponent(subject));
          }
          setComposeOpen(true);
        }

        // Clear search parameters from the URL immediately
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('recipientId');
        newParams.delete('recipientName');
        newParams.delete('subject');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [searchParams, setSearchParams, conversationsList, activeCompanyId, user]);

  // HR contact (for employee role only)
  const [hrRecipient, setHrRecipient] = useState<{ recipientId: number; recipientName: string } | null>(null);
  const [hrLoading, setHrLoading] = useState(false);

  const loadMessages = useCallback(() => {
    setLoading(true);
    setError(null);
    getMessages(useAllAccessibleCompanies ? undefined : activeCompanyId)
      .then(msgs => {
        setMessages(msgs);
        // Clear placeholder if we now have a real conversation with that recipient
        setPlaceholderConversation(prev => {
          if (!prev) return null;
          const hasReal = msgs.some(m => m.senderId === prev.otherPartyId || m.recipientId === prev.otherPartyId);
          return hasReal ? null : prev;
        });
      })
      .catch(err => setError(translateApiError(err, t, t('messages.errorLoad'))))
      .finally(() => setLoading(false));
  }, [activeCompanyId, t, useAllAccessibleCompanies]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Real-time messages listener
  useEffect(() => {
    if (!socket) return;

    const handleMessageSent = () => {
      loadMessages();
    };
    const handleMessageEdited = () => {
      loadMessages();
    };
    const handleMessageDeleted = () => {
      loadMessages();
    };

    socket.on('MESSAGE_SENT', handleMessageSent);
    socket.on('MESSAGE_EDITED', handleMessageEdited);
    socket.on('MESSAGE_DELETED', handleMessageDeleted);

    return () => {
      socket.off('MESSAGE_SENT', handleMessageSent);
      socket.off('MESSAGE_EDITED', handleMessageEdited);
      socket.off('MESSAGE_DELETED', handleMessageDeleted);
    };
  }, [socket, loadMessages]);

  // Employee: load HR contact for compose
  useEffect(() => {
    if (!isEmployee) return;
    setHrLoading(true);
    getHrRecipient(activeCompanyId)
      .then(setHrRecipient)
      .catch(() => {})
      .finally(() => setHrLoading(false));
  }, [activeCompanyId, isEmployee]);

  // Mark conversations read
  const markConversationAsRead = useCallback((convId: number, convMessages: Message[]) => {
    const unread = convMessages.filter(m => m.direction === 'received' && !m.isRead);
    if (unread.length === 0) return;

    // Optimistically update local messages
    setMessages(prev => prev.map(m => {
      const isRecipientMatch = m.recipientId === user?.id;
      const isSenderMatch = m.senderId === convId;
      if (isRecipientMatch && isSenderMatch && !m.isRead) {
        return { ...m, isRead: true };
      }
      return m;
    }));

    // Call API
    unread.forEach(m => {
      markMessageAsRead(m.id, m.companyId).catch(() => {});
    });
  }, [user]);

  useEffect(() => {
    if (selectedConversationId) {
      const selectedConv = conversationsList.find(c => c.otherPartyId === selectedConversationId);
      if (selectedConv) {
        markConversationAsRead(selectedConversationId, selectedConv.messages);
      }
    }
  }, [selectedConversationId, conversationsList, markConversationAsRead]);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (selectedConversationId) {
      scrollToBottom();
    }
  }, [selectedConversationId]);

  const selectedConv = conversationsList.find(c => c.otherPartyId === selectedConversationId) ||
    (placeholderConversation?.otherPartyId === selectedConversationId ? placeholderConversation : null);

  const msgCount = selectedConv?.messages.length ?? 0;
  useEffect(() => {
    if (selectedConversationId && msgCount > 0) {
      const timer = setTimeout(() => scrollToBottom(), 80);
      return () => clearTimeout(timer);
    }
  }, [selectedConversationId, msgCount]);

  // Select first conversation by default on desktop
  useEffect(() => {
    if (!selectedConversationId && conversationsList.length > 0 && !isMobile) {
      setSelectedConversationId(conversationsList[0].otherPartyId);
    }
  }, [conversationsList, isMobile, selectedConversationId]);

  const handleCompose = () => {
    if (isEmployee && hrRecipient) {
      setComposeRecipient({ id: hrRecipient.recipientId, name: hrRecipient.recipientName });
    } else {
      setComposeRecipient(null);
    }
    setComposeDefaultSubject('');
    setComposeOpen(true);
  };

  const handleSent = (recipientId: number) => {
    showToast(t('messages.successSent'), 'success');
    setComposeOpen(false);
    setComposeRecipient(null);
    setComposeDefaultSubject('');
    loadMessages();
    setSelectedConversationId(recipientId);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadingFile(true);

    const formData = new FormData();
    formData.append('attachment', file);

    try {
      const { data } = await apiClient.post('/messages/upload-attachment', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedFilename(data.data.filename);
    } catch (err) {
      showToast(t('messages.errorUpload', 'Failed to upload image'), 'error');
      setSelectedFile(null);
      setUploadedFilename(null);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendDirectReply = async () => {
    const hasText = replyText.trim() !== '';
    const hasAttachment = uploadedFilename !== null;
    const hasRef = selectedRef !== null;
    
    if ((!hasText && !hasAttachment && !hasRef) || !selectedConversationId || sendingReply || uploadingFile) return;
    setSendingReply(true);
    try {
      const subjectToUse = subjectText.trim();
      const companyIdToUse = selectedConv?.messages[0]?.companyId || activeCompanyId;

      let finalBody = replyText.trim();
      if (selectedRef) {
        finalBody += `${finalBody ? '\n\n' : ''}${buildReferenceToken(selectedRef)}`;
      }

      await sendMessage({
        recipientId: selectedConversationId,
        subject: subjectToUse || undefined,
        body: finalBody || (uploadedFilename ? '' : undefined),
        companyId: companyIdToUse,
        attachmentFilename: uploadedFilename || undefined,
      } as any);

      setReplyText('');
      setSubjectText('');
      setShowSubjectInput(false);
      setSelectedFile(null);
      setUploadedFilename(null);
      setSelectedRef(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadMessages();
    } catch (err) {
      showToast(t('messages.errorSend'), 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId) return;
    try {
      setSendingReply(true);
      let finalBody = replyText.trim();
      if (selectedRef) {
        finalBody += `${finalBody ? '\n\n' : ''}${buildReferenceToken(selectedRef)}`;
      }

      await editMessage(
        editingMessageId,
        finalBody,
        selectedConv?.messages[0]?.companyId || activeCompanyId,
        subjectText.trim() || undefined,
        uploadedFilename || undefined,
      );
      setEditingMessageId(null);
      setReplyText('');
      setSubjectText('');
      setShowSubjectInput(false);
      setSelectedFile(null);
      setUploadedFilename(null);
      setSelectedRef(null);
      setShowOptionsId(null);
      loadMessages();
      showToast(t('messages.editSuccess'), 'success');
    } catch (err) {
      showToast(t('messages.editError'), 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMessage(id, selectedConv?.messages[0]?.companyId || activeCompanyId);
      setShowOptionsId(null);
      loadMessages();
      showToast(t('messages.deleteSuccess'), 'success');
    } catch (err) {
      showToast(t('messages.deleteError'), 'error');
    }
  };

  // List of active conversations matching search filter
  const displayedConversations = [...conversationsList];
  if (placeholderConversation && !conversationsList.some(c => c.otherPartyId === placeholderConversation.otherPartyId)) {
    displayedConversations.unshift(placeholderConversation);
  }

  const filteredConversations = displayedConversations.filter(c =>
    c.otherPartyName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnreadCount = messages.filter(m => {
    const isRecipient = m.recipientId === user?.id;
    return isRecipient && !m.isRead;
  }).length;

  const composeDisabled = isEmployee && (hrLoading || !hrRecipient);
  const showSidebar = !isMobile || selectedConversationId === null;
  const showChatPane = !isMobile || selectedConversationId !== null;

  return (
    <div className="page-enter" style={{ width: '100%', fontFamily: 'var(--font-body)' }}>

      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 20,
      }}>
        <div>
          <h1 style={{
            margin: 0, fontFamily: 'var(--font-display)', fontSize: 24,
            fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em',
          }}>
            {t('messages.inbox')}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {totalUnreadCount > 0
              ? (i18n.language.startsWith('it')
                  ? `${totalUnreadCount} ${totalUnreadCount === 1 ? 'messaggio non letto' : 'messaggi non letti'}`
                  : `${totalUnreadCount} unread ${totalUnreadCount === 1 ? 'message' : 'messages'}`)
              : t('messages.noUnread')}
          </p>
        </div>

        <button
          onClick={handleCompose}
          disabled={composeDisabled}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 'var(--radius-sm)',
            background: composeDisabled ? 'var(--border)' : 'var(--accent)',
            color: composeDisabled ? 'var(--text-disabled)' : '#fff',
            border: 'none', cursor: composeDisabled ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 13.5, fontFamily: 'var(--font-body)',
            transition: 'opacity 0.15s',
          }}
        >
          {hrLoading ? <Spinner size="sm" color="#fff" /> : <Plus size={15} />}
          {t('messages.compose')}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="danger" title={t('common.error')} onClose={() => setError(null)}>{error}</Alert>
        </div>
      )}

      {/* Grid container */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '340px 1fr',
        gap: 16,
        alignItems: 'start',
      }}>

        {/* ── Left Sidebar: Conversations list ── */}
        {showSidebar && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            {/* List header */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--surface-warm)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <MessageSquare size={14} color="var(--accent)" />
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--text-muted)',
              }}>
                {t('messages.title')}
              </span>
              {totalUnreadCount > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 10, fontWeight: 700, borderRadius: 99,
                  padding: '2px 7px',
                }}>
                  {totalUnreadCount}
                </span>
              )}
            </div>

            {/* Conversation search */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-light)' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('messages.searchEmployee')}
                style={{
                  width: '100%', padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-warm)',
                  color: 'var(--text-primary)',
                  fontSize: '13px', fontFamily: 'var(--font-body)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* List body */}
            {loading ? (
              <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                <Spinner size="lg" color="var(--accent)" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                color: 'var(--text-muted)', fontSize: 13,
              }}>
                <MessageSquare size={28} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.4 }} />
                <div>{t('messages.noMessages')}</div>
              </div>
            ) : (
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                {filteredConversations.map((conv) => (
                  <div key={conv.otherPartyId} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <ConversationRow
                      conv={conv}
                      isSelected={selectedConversationId === conv.otherPartyId}
                      lang={i18n.language}
                      onClick={() => setSelectedConversationId(conv.otherPartyId)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Right Pane: Chat Thread ── */}
        {showChatPane && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            height: 600,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {selectedConv ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
                
                {/* Chat Header */}
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border-light)',
                  background: 'var(--surface-warm)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  {isMobile && (
                    <button
                      onClick={() => setSelectedConversationId(null)}
                      style={{
                        background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', color: 'var(--text-secondary)'
                      }}
                    >
                      <ArrowLeft size={20} />
                    </button>
                  )}
                  <Avatar name={selectedConv.otherPartyName} avatarFilename={selectedConv.otherPartyAvatarFilename} size={40} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                      {selectedConv.otherPartyName}
                    </div>
                    {selectedConv.otherPartyRole && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {t(`roles.${selectedConv.otherPartyRole}`, selectedConv.otherPartyRole)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Messages Body */}
                <div style={{
                  flex: 1,
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  background: '#F9F8F6',
                  height: 'auto',
                }}>
                  {selectedConv.messages.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-disabled)', gap: 8 }}>
                      <MessageSquare size={32} strokeWidth={1.5} />
                      <span style={{ fontSize: 13 }}>{t('messages.noConversationMessages')}</span>
                    </div>
                  ) : (
                    (() => {
                      const firstUnreadIndex = selectedConv.messages.findIndex(m => m.direction === 'received' && !m.isRead);
                      return selectedConv.messages.map((msg, index) => {
                        const isSent = msg.direction === 'sent';
                        const msgDate = new Date(msg.createdAt).toDateString();
                        const prevMsgDate = index > 0 ? new Date(selectedConv.messages[index - 1].createdAt).toDateString() : null;
                        const showDateHeader = msgDate !== prevMsgDate;
                        const isFirstUnread = index === firstUnreadIndex;
                        const isHovered = hoveredMessageId === msg.id;
                        const showOptions = showOptionsId === msg.id;

                        let dateLabel = msgDate;
                        const today = new Date().toDateString();
                        const yesterday = new Date(Date.now() - 86400000).toDateString();
                        if (msgDate === today) dateLabel = i18n.language.startsWith('it') ? 'Oggi' : 'Today';
                        else if (msgDate === yesterday) dateLabel = i18n.language.startsWith('it') ? 'Ieri' : 'Yesterday';
                        else {
                          dateLabel = new Date(msg.createdAt).toLocaleDateString(i18n.language.startsWith('it') ? 'it-IT' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        }

                        return (
                          <React.Fragment key={msg.id}>
                            {showDateHeader && (
                              <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                                <div style={{
                                  background: 'var(--surface)', color: 'var(--text-secondary)',
                                  fontSize: 11, fontWeight: 600, padding: '4px 12px',
                                  borderRadius: 12, boxShadow: 'var(--shadow-xs)'
                                }}>
                                  {dateLabel}
                                </div>
                              </div>
                            )}
                            {isFirstUnread && (
                              <div style={{ display: 'flex', alignItems: 'center', margin: '12px 0' }}>
                                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                                <div style={{
                                  color: 'var(--accent)', fontSize: 10, fontWeight: 700, padding: '4px 12px',
                                  background: 'var(--accent-light)', borderRadius: 12, margin: '0 8px',
                                  textTransform: 'uppercase', letterSpacing: '0.05em',
                                }}>
                                  {t('messages.newMessages', 'NEW')}
                                </div>
                                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                              </div>
                            )}
                            <div
                              onMouseEnter={() => setHoveredMessageId(msg.id)}
                              onMouseLeave={() => setHoveredMessageId(null)}
                              style={{
                                display: 'flex',
                                justifyContent: isSent ? 'flex-end' : 'flex-start',
                                width: '100%',
                                position: 'relative',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              {isSent && isHovered && (
                                <div style={{ position: 'relative' }}>
                                  <button
                                    onClick={() => setShowOptionsId(showOptions ? null : msg.id)}
                                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                  >
                                    <MoreVertical size={14} />
                                  </button>
                                  {showOptions && (
                                    <div style={{ position: 'absolute', right: '100%', top: 0, marginRight: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', zIndex: 10, display: 'flex', flexDirection: 'column', minWidth: 120, overflow: 'hidden' }}>
                                      <button
                                        onClick={() => {
                                          setEditingMessageId(msg.id);
                                          const rawBody = msg.body || '';
                                          const cleanBody = stripReferenceTokens(rawBody);
                                          setReplyText(cleanBody);
                                          if (msg.subject) {
                                            setSubjectText(msg.subject);
                                            setShowSubjectInput(true);
                                          } else {
                                            setSubjectText('');
                                            setShowSubjectInput(false);
                                          }
                                          setUploadedFilename(msg.attachmentFilename || (msg as any).attachment_filename || null);

                                          setSelectedRef(parseReferenceToken(rawBody));
                                          setShowOptionsId(null);
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left', width: '100%' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-warm)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                      >
                                        <Edit2 size={12} /> {t('common.edit')}
                                      </button>
                                      <button onClick={() => void handleDelete(msg.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--danger)', textAlign: 'left', width: '100%' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-warm)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                        <Trash2 size={12} /> {t('common.delete')}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                          <div style={{
                            maxWidth: '75%',
                            padding: '10px 14px',
                            borderRadius: isSent ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                            background: isSent ? 'var(--primary)' : 'var(--surface)',
                            color: isSent ? '#FFFFFF' : 'var(--text-primary)',
                            boxShadow: 'var(--shadow-xs)',
                            border: isSent ? 'none' : '1px solid var(--border-light)',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                          }}>
                            {msg.subject && msg.subject.trim() !== '' && (
                              <div style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                opacity: 0.85,
                                marginBottom: 6,
                                borderBottom: `1px solid ${isSent ? 'rgba(255,255,255,0.15)' : 'var(--border-light)'}`,
                                paddingBottom: 2,
                                fontFamily: 'var(--font-display)',
                              }}>
                                {msg.subject}
                              </div>
                            )}
                            {/* Attachment rendering (first, so image is on top) */}
                            {(msg.attachmentFilename || (msg as any).attachment_filename) && (() => {
                              const attachment = msg.attachmentFilename || (msg as any).attachment_filename;
                              return (
                                <div 
                                  style={{
                                    borderRadius: 'var(--radius-sm)',
                                    overflow: 'hidden',
                                    border: `1px solid ${isSent ? 'rgba(255,255,255,0.15)' : 'var(--border-light)'}`,
                                    maxWidth: '100%',
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => window.open(getMessageAttachmentUrl(attachment) || '', '_blank')}
                                >
                                  <img
                                    src={getMessageAttachmentUrl(attachment) || ''}
                                    alt="attachment"
                                    style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }}
                                  />
                                </div>
                              );
                            })()}

                            {/* Message body & platform reference rendering */}
                            {(() => {
                              const rawBody = msg.body ?? '';
                              const reference = parseReferenceToken(rawBody);
                              const cleanBody = stripReferenceTokens(rawBody);

                              return (
                                <>
                                  {cleanBody && !(['sent an image', 'send an image', 'immagine inviata', 'inviato un\'immagine', 'immagine'].includes(cleanBody.toLowerCase()) && (msg.attachmentFilename || (msg as any).attachment_filename)) && (
                                    <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', marginTop: (msg.attachmentFilename || (msg as any).attachment_filename) ? 8 : 0 }}>
                                      {cleanBody}
                                    </div>
                                  )}

                                  {reference && (
                                    <ReferenceChip reference={reference} onDarkBubble={isSent} />
                                  )}
                                </>
                              );
                            })()}

                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              alignSelf: 'flex-end',
                              marginTop: 4,
                            }}>
                              <span style={{
                                fontSize: 9.5,
                                color: isSent ? 'rgba(255,255,255,0.65)' : 'var(--text-disabled)',
                              }}>
                                {formatRelativeDate(msg.createdAt, i18n.language)}
                              </span>
                              {isSent && (
                                <span style={{ color: msg.isRead ? '#38bdf8' : 'rgba(255,255,255,0.65)' }}>
                                  {msg.isRead ? <CheckCheck size={12} /> : <Check size={12} />}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                          </React.Fragment>
                      );
                    });
                  })())}
                  <div ref={chatEndRef} />
                </div>

                {/* Subject Input Box (toggled by plus button) */}
                {showSubjectInput && (
                  <div style={{
                    padding: '8px 16px',
                    borderTop: '1px solid var(--border-light)',
                    background: 'var(--surface-warm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <input
                      type="text"
                      value={subjectText}
                      onChange={e => setSubjectText(e.target.value)}
                      placeholder={t('messages.subjectOptional')}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1.5px solid var(--border)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-body)',
                        outline: 'none',
                        background: 'var(--surface)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      onClick={() => { setShowSubjectInput(false); setSubjectText(''); }}
                      style={{
                        background: 'none', border: 'none', fontSize: 11, cursor: 'pointer',
                        color: 'var(--text-muted)'
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                )}

                {/* Selected Platform Reference preview chip */}
                {selectedRef && (
                  <div style={{
                    padding: '8px 16px',
                    borderTop: '1px solid var(--border-light)',
                    background: 'rgba(201,151,58,0.08)',
                  }}>
                    <ReferenceChip
                      reference={selectedRef}
                      variant="draft"
                      onRemove={() => setSelectedRef(null)}
                      removeDisabled={sendingReply}
                    />
                  </div>
                )}

                {/* File/Attachment preview container */}
                {selectedFile && (
                  <div style={{
                    padding: '10px 16px',
                    borderTop: '1px solid var(--border-light)',
                    background: 'var(--surface-warm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}>
                    <div style={{ position: 'relative', width: 60, height: 60, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                      <img
                        src={URL.createObjectURL(selectedFile)}
                        alt="preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {uploadingFile && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Spinner size="sm" color="#fff" />
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedFile.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {uploadingFile ? t('messages.uploadingStatus') : t('messages.uploadedStatus')}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setUploadedFilename(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      disabled={sendingReply}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--danger)', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '50%',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}

                {/* Direct Reply Input */}
                {isEmployee && selectedConv?.otherPartyRole !== 'hr' ? (
                  <div style={{
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border-light)',
                    background: 'var(--surface-warm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    fontWeight: 500,
                  }}>
                    <Lock size={14} />
                    <span>{t('messages.cannotReply', "You cannot reply to this conversation. You can only send messages to HR.")}</span>
                  </div>
                ) : (
                  <div style={{
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border-light)',
                    background: 'var(--surface)',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                  }}>
                  {/* Plus toggler for Subject input */}
                  <button
                    onClick={() => setShowSubjectInput(prev => !prev)}
                    disabled={sendingReply || uploadingFile}
                    style={{
                      background: 'none', border: 'none', padding: 6, cursor: 'pointer',
                      color: showSubjectInput ? 'var(--accent)' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                      transition: 'background 0.15s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-warm)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    title="Add Subject"
                  >
                    <Plus size={20} />
                  </button>

                  {/* Platform Reference picker button */}
                  <button
                    onClick={() => setShowRefPicker(true)}
                    disabled={sendingReply || uploadingFile}
                    style={{
                      background: 'none', border: 'none', padding: 6, cursor: 'pointer',
                      color: selectedRef ? 'var(--accent)' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                      transition: 'background 0.15s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-warm)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    title="Attach Reference (Task, Document, Shift)"
                  >
                    <Link2 size={19} />
                  </button>

                  {/* Attachment image uploader */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sendingReply || uploadingFile}
                    style={{
                      background: 'none', border: 'none', padding: 6, cursor: 'pointer',
                      color: selectedFile ? 'var(--accent)' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                      transition: 'background 0.15s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-warm)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    title="Attach Image"
                  >
                    <Image size={20} />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />

                  {/* Message body input */}
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendDirectReply();
                      }
                    }}
                    placeholder={t('messages.bodyPlaceholder')}
                    disabled={sendingReply || uploadingFile}
                    rows={1}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '20px',
                      border: '1.5px solid var(--border)',
                      background: 'var(--surface-warm)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontFamily: 'var(--font-body)',
                      resize: 'none',
                      outline: 'none',
                      boxSizing: 'border-box',
                      maxHeight: '100px',
                    }}
                  />
                  <button
                    onClick={() => {
                      if (editingMessageId) {
                        void handleSaveEdit();
                      } else {
                        void handleSendDirectReply();
                      }
                    }}
                    disabled={sendingReply || uploadingFile || (!replyText.trim() && !uploadedFilename)}
                    style={{
                      background: (!replyText.trim() && !uploadedFilename) || sendingReply || uploadingFile ? 'var(--border)' : 'var(--accent)',
                      color: '#FFFFFF',
                      border: 'none',
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: (!replyText.trim() && !uploadedFilename) || sendingReply || uploadingFile ? 'not-allowed' : 'pointer',
                      transition: 'background 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    {editingMessageId ? <Check size={16} /> : <Send size={16} />}
                  </button>
                  {editingMessageId && (
                    <button
                      onClick={() => {
                        setEditingMessageId(null);
                        setReplyText('');
                      }}
                      style={{
                        background: 'none', border: 'none', fontSize: 11, cursor: 'pointer',
                        color: 'var(--text-muted)'
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
                )}

              </div>
            ) : (
              <EmptyDetail t={t as (k: string) => string} />
            )}
          </div>
        )}
      </div>

      {/* Compose modal */}
      {composeOpen && (
        <ComposeMessage
          recipientId={composeRecipient?.id}
          recipientName={composeRecipient?.name}
          companyId={composeRecipient ? activeCompanyId : undefined}
          defaultSubject={composeDefaultSubject}
          onClose={() => { setComposeOpen(false); setComposeRecipient(null); }}
          onSent={handleSent}
        />
      )}

      {/* Platform Reference Picker modal */}
      {showRefPicker && (
        <PlatformReferencePicker
          onSelect={(ref) => setSelectedRef(ref)}
          onClose={() => setShowRefPicker(false)}
        />
      )}
    </div>
  );
}
