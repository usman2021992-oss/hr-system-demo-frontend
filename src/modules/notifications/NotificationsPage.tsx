import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  CalendarClock,
  CheckCheck,
  CreditCard,
  ChevronDown,
  Clock,
  Edit2,
  ExternalLink,
  FileText,
  GraduationCap,
  Mail,
  RefreshCw,
  Settings,
  ShieldAlert,
  Store,
  Trash2,
  UserCircle2,
  Users,
  X,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { getCompanyLogoUrl } from "../../api/client";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  Notification,
  getRecentRecipients,
  updateNotificationRoles,
  RecentRecipient,
  bulkDeleteNotifications,
} from "../../api/notifications";
import {
  getNotificationSettings,
  NotificationSetting,
  updateNotificationSetting,
} from "../../api/documents";
import {
  NOTIFICATION_EVENT_DEFINITIONS,
  NOTIFICATION_CATEGORY_ORDER,
  NOTIFICATION_CATEGORY_I18N,
  NotificationCategory,
  NotificationEventDefinition,
} from "./eventCatalog";
import RoleEditModal from "./RoleEditModal";
import UserAvatar from "./UserAvatar";
import FlagIcon from "./FlagIcon";
import { getCompanies } from "../../api/companies";
import type { Company } from "../../types";
import { getNotificationNavigationUrl } from "../../utils/notificationNavigation";

type NotificationScope = "mine" | "company";
type ViewMode = "inbox" | "settings";

const PAGE_SIZE = 28;

const MANAGEMENT_ROLES = new Set([
  "admin",
  "hr",
  "area_manager",
  "store_manager",
]);

const PRIORITY_COLORS: Record<
  Notification["priority"],
  { accent: string; chipBg: string }
> = {
  urgent: { accent: "#DC2626", chipBg: "rgba(220,38,38,0.14)" },
  high: { accent: "#EA580C", chipBg: "rgba(234,88,12,0.14)" },
  medium: { accent: "#C9973A", chipBg: "rgba(201,151,58,0.14)" },
  low: { accent: "#64748B", chipBg: "rgba(100,116,139,0.14)" },
};

const TYPE_VISUALS: Array<{
  startsWith: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}> = [
  {
    startsWith: "employee.",
    icon: Users,
    color: "#0F766E",
    bg: "rgba(15,118,110,0.12)",
  },
  {
    startsWith: "shift.",
    icon: CalendarClock,
    color: "#1D4ED8",
    bg: "rgba(29,78,216,0.11)",
  },
  {
    startsWith: "attendance.",
    icon: AlertTriangle,
    color: "#B91C1C",
    bg: "rgba(185,28,28,0.12)",
  },
  {
    startsWith: "leave.",
    icon: UserCircle2,
    color: "#B45309",
    bg: "rgba(180,83,9,0.13)",
  },
  {
    startsWith: "document.",
    icon: FileText,
    color: "#0F766E",
    bg: "rgba(15,118,110,0.12)",
  },
  {
    startsWith: "ats.",
    icon: Briefcase,
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.13)",
  },
  {
    startsWith: "onboarding.",
    icon: GraduationCap,
    color: "#0D9488",
    bg: "rgba(13,148,136,0.13)",
  },
  {
    startsWith: "billing.",
    icon: CreditCard,
    color: "#B91C1C",
    bg: "rgba(185,28,28,0.12)",
  },
  {
    startsWith: "manager.",
    icon: ShieldAlert,
    color: "#334155",
    bg: "rgba(51,65,85,0.13)",
  },
];

const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  employees: Users,
  shifts: CalendarClock,
  attendance: AlertTriangle,
  leave: UserCircle2,
  documents: FileText,
  ats: Briefcase,
  onboarding: GraduationCap,
  billing: CreditCard,
  manager: ShieldAlert,
};

function typeLabel(
  type: string,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const key = `notifications.type_${type.replace(/\./g, "_")}`;
  const label = t(key);
  return label === key ? type : label;
}

function notificationTitle(
  item: Notification,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const key = `notifications.${item.type.replace(/\./g, "_")}_title`;
  const translated = t(key);
  return translated === key ? item.title : translated;
}

function notificationMessage(
  item: Notification,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const key = `notifications.${item.type.replace(/\./g, "_")}_message`;
  const translated = t(key);
  return translated === key ? item.message : translated;
}

function timeAgo(
  iso: string,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("notifications.justNow");
  if (mins < 60) return t("notifications.minsAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("notifications.hoursAgo", { count: hrs });
  const days = Math.floor(hrs / 24);
  return t("notifications.daysAgo", { count: days });
}

function roleLabel(role: string, t: (k: string) => string): string {
  const key = `roles.${role}`;
  const translated = t(key);
  return translated === key ? role : translated;
}

function typeVisual(type: string): {
  icon: LucideIcon;
  color: string;
  bg: string;
} {
  const matched = TYPE_VISUALS.find((item) => type.startsWith(item.startsWith));
  return matched ?? { icon: Bell, color: "#0D2137", bg: "rgba(13,33,55,0.10)" };
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  // Hover state for notifications (moved outside map)
  const [hoveredNotificationId, setHoveredNotificationId] = useState<number | null>(null);

  const canViewCompanyFeed = user ? MANAGEMENT_ROLES.has(user.role) : false;
  const canManageSettings = user?.role === "admin";

  const [viewMode, setViewMode] = useState<ViewMode>("inbox");
  const [scope, setScope] = useState<NotificationScope>("mine");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState<
    NotificationCategory | "all" | "urgent"
  >("all");

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSavingKey, setSettingsSavingKey] = useState<string | null>(
    null,
  );
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [allCompaniesSettings, setAllCompaniesSettings] = useState<NotificationSetting[]>([]);

  const [roleEditOpen, setRoleEditOpen] = useState(false);
  const [editingEvent, setEditingEvent] =
    useState<NotificationEventDefinition | null>(null);
  const [recentRecipients, setRecentRecipients] = useState<
    Map<string, RecentRecipient[]>
  >(new Map());

  // Delete mode state
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Company selector state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    null,
  );
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const companyPickerRef = useRef<HTMLDivElement>(null);

  // Settings modal company selector
  const [settingsCompanyId, setSettingsCompanyId] = useState<number | null>(
    null,
  );
  const [settingsCompanyDropdownOpen, setSettingsCompanyDropdownOpen] =
    useState(false);

  // Close company dropdown on outside click
  useEffect(() => {
    if (!companyDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        companyPickerRef.current &&
        !companyPickerRef.current.contains(e.target as Node)
      ) {
        setCompanyDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [companyDropdownOpen]);

  // Fetch companies for company selector
  useEffect(() => {
    if (canViewCompanyFeed) {
      getCompanies()
        .then((data) => {
          setCompanies(data);
          // Set default settings company to user's company
          if (data.length > 0 && user?.companyId) {
            setSettingsCompanyId(user.companyId);
          }
        })
        .catch(() => {
          // Silently fail
        });
    }
  }, [canViewCompanyFeed, user]);

  useEffect(() => {
    if (!canViewCompanyFeed && scope === "company") {
      setScope("mine");
    }
  }, [canViewCompanyFeed, scope]);

  const fetchPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      const page = await getNotifications({
        limit: PAGE_SIZE,
        offset: nextOffset,
        unreadOnly,
        scope,
      });

      setNotifications((prev) =>
        append ? [...prev, ...page.notifications] : page.notifications,
      );
      setTotal(page.total);
      setUnreadCount(page.unreadCount);
    },
    [scope, unreadOnly],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchPage(0, false);
    } catch {
      setError(
        t("notifications.pageErrorLoad", "Unable to load notifications"),
      );
    } finally {
      setLoading(false);
    }
  }, [fetchPage, t]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!settingsOpen || !canManageSettings || !settingsCompanyId) return;
    setSettingsLoading(true);
    getNotificationSettings(settingsCompanyId)
      .then((rows) => setSettings(rows))
      .catch(() => {
        setError(
          t(
            "notifications.settingsLoadError",
            "Unable to load notification settings",
          ),
        );
      })
      .finally(() => setSettingsLoading(false));

    // Fetch recent recipients for all event types for the selected company
    const fetchRecipients = async () => {
      const recipientsMap = new Map<string, RecentRecipient[]>();
      for (const def of NOTIFICATION_EVENT_DEFINITIONS) {
        try {
          const recipients = await getRecentRecipients(def.eventKey, settingsCompanyId);
          if (recipients.length > 0) {
            recipientsMap.set(def.eventKey, recipients);
          }
        } catch {
          // Silently fail for individual event types
        }
      }
      setRecentRecipients(recipientsMap);
    };
    void fetchRecipients();
  }, [settingsOpen, canManageSettings, settingsCompanyId, t]);

  // Fetch settings for all companies when page loads (for progress bars in dropdown)
  useEffect(() => {
    if (!canManageSettings || companies.length === 0) return;
    
    const fetchAllSettings = async () => {
      const allSettings: NotificationSetting[] = [];
      for (const company of companies) {
        try {
          const companySettings = await getNotificationSettings(company.id);
          allSettings.push(...companySettings);
        } catch {
          // Silently fail for individual companies
        }
      }
      setAllCompaniesSettings(allSettings);
    };
    void fetchAllSettings();
  }, [canManageSettings, companies]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchPage(0, false);
    } catch {
      setError(
        t("notifications.pageErrorLoad", "Unable to load notifications"),
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || notifications.length >= total) return;
    setLoadingMore(true);
    try {
      await fetchPage(notifications.length, true);
    } catch {
      setError(
        t(
          "notifications.pageErrorLoadMore",
          "Unable to load more notifications",
        ),
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const handleMarkRead = async (notification: Notification) => {
    if (scope !== "mine" || notification.isRead) return;
    try {
      await markNotificationRead(notification.id);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // no-op: keep soft fail on per-item action
    }
  };

  const handleMarkAll = async () => {
    if (scope !== "mine") return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((item) => ({ ...item, isRead: true })),
      );
      setUnreadCount(0);
    } catch {
      setError(
        t(
          "notifications.pageErrorMarkAll",
          "Unable to mark notifications as read",
        ),
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedNotificationIds.size === 0) return;
    setDeleting(true);
    try {
      const idsArray = Array.from(selectedNotificationIds);
      const deletedCount = await bulkDeleteNotifications(idsArray);
      
      // Remove deleted notifications from the list
      setNotifications((prev) => prev.filter((item) => !selectedNotificationIds.has(item.id)));
      setTotal((prev) => Math.max(0, prev - deletedCount));
      
      // Update unread count
      const deletedUnreadCount = notifications.filter(
        (item) => selectedNotificationIds.has(item.id) && !item.isRead
      ).length;
      setUnreadCount((prev) => Math.max(0, prev - deletedUnreadCount));
      
      // Clear selection and exit delete mode
      setSelectedNotificationIds(new Set());
      setDeleteMode(false);
      
      showToast?.(
        t("notifications.deleteSuccess", `${deletedCount} notification(s) deleted`),
        "success"
      );
    } catch {
      setError(
        t(
          "notifications.deleteError",
          "Unable to delete notifications",
        ),
      );
    } finally {
      setDeleting(false);
    }
  };

  const toggleNotificationSelection = (id: number) => {
    setSelectedNotificationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedNotificationIds.size === filteredNotifications.length) {
      setSelectedNotificationIds(new Set());
    } else {
      setSelectedNotificationIds(new Set(filteredNotifications.map((n) => n.id)));
    }
  };

  const settingByKey = useMemo(() => {
    const map = new Map<string, NotificationSetting>();
    for (const row of settings) {
      map.set(row.eventKey, row);
    }
    return map;
  }, [settings]);

  const recentUsersByEvent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of notifications) {
      if (!item.recipientName) continue;
      const fullName = `${item.recipientName}${item.recipientSurname ? ` ${item.recipientSurname}` : ""}`;
      const existing = map.get(item.type) ?? [];
      if (!existing.includes(fullName)) {
        map.set(item.type, [...existing, fullName].slice(0, 4));
      }
    }
    return map;
  }, [notifications]);

  const groupedDefinitions = useMemo(() => {
    return NOTIFICATION_CATEGORY_ORDER.map((categoryKey) => ({
      category: {
        key: categoryKey,
        i18nKey: NOTIFICATION_CATEGORY_I18N[categoryKey],
      },
      events: NOTIFICATION_EVENT_DEFINITIONS.filter(
        (def) => def.category === categoryKey,
      ),
    })).filter((group) => group.events.length > 0);
  }, []);

  const handleToggleSetting = async (def: NotificationEventDefinition) => {
    const current = settingByKey.get(def.eventKey);
    const currentEnabled = current ? current.enabled : true;
    const nextEnabled = !currentEnabled;
    const roles = current?.roles?.length ? current.roles : def.defaultRoles;

    setSettingsSavingKey(def.eventKey);
    try {
      const updated = await updateNotificationSetting(
        def.eventKey,
        nextEnabled,
        roles,
        settingsCompanyId ?? undefined,
      );
      setSettings((prev) => {
        const idx = prev.findIndex((row) => row.eventKey === def.eventKey);
        if (idx < 0) return [...prev, updated];
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
      // Also update allCompaniesSettings
      setAllCompaniesSettings((prev) => {
        const idx = prev.findIndex((row) => row.eventKey === def.eventKey && row.companyId === updated.companyId);
        if (idx < 0) return [...prev, updated];
        const next = [...prev];
        next[idx] = updated;
        return next;
      });
    } catch {
      setError(
        t(
          "notifications.settingsSaveError",
          "Unable to update notification settings",
        ),
      );
    } finally {
      setSettingsSavingKey(null);
    }
  };

  const handleSaveRoles = async (roles: string[], priority: string) => {
    if (!editingEvent) return;

    try {
      await updateNotificationRoles(editingEvent.eventKey, roles, priority, settingsCompanyId ?? undefined);

      // Refresh settings for the selected company
      const rows = await getNotificationSettings(settingsCompanyId ?? undefined);
      setSettings(rows);

      // Also update allCompaniesSettings for the selected company
      setAllCompaniesSettings((prev) => {
        // Remove old settings for this company and event
        const filtered = prev.filter(
          (s) => !(s.companyId === settingsCompanyId && s.eventKey === editingEvent.eventKey)
        );
        // Add updated settings
        const updated = rows.find((r) => r.eventKey === editingEvent.eventKey);
        return updated ? [...filtered, updated] : filtered;
      });

      setRoleEditOpen(false);
      setEditingEvent(null);
    } catch {
      setError(
        t(
          "notifications.settingsSaveError",
          "Unable to update notification settings",
        ),
      );
    }
  };

  const handleEditRoles = (def: NotificationEventDefinition) => {
    setEditingEvent(def);
    setRoleEditOpen(true);
  };

  const prioritySummary = useMemo(() => {
    const counters: Record<Notification["priority"], number> = {
      urgent: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const item of notifications) counters[item.priority] += 1;
    return counters;
  }, [notifications]);

  const readCount = Math.max(
    0,
    notifications.length - notifications.filter((item) => !item.isRead).length,
  );

  // Get selected company for settings
  const selectedSettingsCompany = useMemo(() => {
    return companies.find((c) => c.id === settingsCompanyId) || null;
  }, [companies, settingsCompanyId]);

  // Get selected company for filter
  const selectedFilterCompany = useMemo(() => {
    return companies.find((c) => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  // Calculate notification settings progress per company
  const notificationProgressByCompany = useMemo(() => {
    const progressMap = new Map<number, { enabled: number; total: number }>();

    // Group settings by company
    const settingsByCompany = new Map<number, NotificationSetting[]>();
    for (const setting of allCompaniesSettings) {
      const companySettings = settingsByCompany.get(setting.companyId) || [];
      companySettings.push(setting);
      settingsByCompany.set(setting.companyId, companySettings);
    }

    // Calculate progress for each company
    for (const company of companies) {
      const companySettings = settingsByCompany.get(company.id) || [];
      const total = NOTIFICATION_EVENT_DEFINITIONS.length;
      
      // If no settings exist in DB, all are enabled by default
      if (companySettings.length === 0) {
        progressMap.set(company.id, { enabled: total, total });
        continue;
      }
      
      // Create a map of existing settings
      const settingsMap = new Map(companySettings.map(s => [s.eventKey, s]));
      
      // Count enabled: if setting exists, use its enabled value; if not, default to true
      let enabled = 0;
      for (const def of NOTIFICATION_EVENT_DEFINITIONS) {
        const setting = settingsMap.get(def.eventKey);
        if (!setting || setting.enabled) {
          enabled++;
        }
      }
      
      progressMap.set(company.id, { enabled, total });
    }

    return progressMap;
  }, [allCompaniesSettings, companies]);

  // Check if user can edit settings for a company
  const canEditCompany = useCallback(
    (companyId: number) => {
      // Admin can edit all companies
      if (user?.role === "admin") return true;
      // HR and store_manager can only edit their own company
      return user?.companyId === companyId;
    },
    [user],
  );

  // Count notifications per company
  const notificationCountByCompany = useMemo(() => {
    const counts = new Map<number, number>();
    for (const notif of notifications) {
      if (notif.companyId) {
        counts.set(notif.companyId, (counts.get(notif.companyId) || 0) + 1);
      }
    }
    return counts;
  }, [notifications]);

  // Filter notifications by selected company
  const filteredNotifications = useMemo(() => {
    if (scope !== "company" || selectedCompanyId === null) {
      return notifications;
    }
    return notifications.filter((item) => item.companyId === selectedCompanyId);
  }, [notifications, scope, selectedCompanyId]);

  return (
    <>
      <div
        className="page-enter"
        style={{ width: "100%", display: "grid", gap: 16 }}
      >
        <div
          style={{
            borderRadius: 14,
            border: "1px solid var(--border)",
            background:
              "linear-gradient(135deg, rgba(13,33,55,0.95) 0%, rgba(16,40,66,0.92) 45%, rgba(15,118,110,0.72) 100%)",
            color: "#fff",
            padding: "18px 20px",
            display: "grid",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <Bell size={18} />
                <h1
                  style={{
                    margin: 0,
                    fontSize: 20,
                    lineHeight: 1.1,
                    fontWeight: 800,
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {t("notifications.pageTitle", "Notifications Center")}
                </h1>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "rgba(255,255,255,0.74)",
                }}
              >
                {t(
                  "notifications.pageSubtitle",
                  "Track all events and keep your workflow under control.",
                )}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                onClick={handleRefresh}
                disabled={refreshing}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.35)",
                  color: "#fff",
                }}
              >
                <RefreshCw size={14} />
                {refreshing
                  ? t("notifications.refreshing", "Refreshing...")
                  : t("notifications.refresh", "Refresh")}
              </Button>
              {canManageSettings ? (
                <Button
                  variant="secondary"
                  onClick={() => setSettingsOpen(true)}
                  style={{
                    background: "rgba(255,255,255,0.2)",
                    border: "1px solid rgba(255,255,255,0.35)",
                    color: "#fff",
                  }}
                >
                  <Settings size={14} />
                  {t("notifications.settingsButton", "Settings")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <Alert
            variant="danger"
            title={t("common.error")}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        ) : null}

        {/* Summary Cards - Different layout for company scope */}
        {scope === "company" && selectedFilterCompany ? (
          // Company-specific view with company details
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 10 }}>
            {/* Company Details Card */}
            <div style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--surface)",
              padding: "12px 14px",
              boxShadow: "var(--shadow-xs)",
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#0D2137", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                {t("notifications.companyDetails", "Company")}
              </span>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  background: getCompanyLogoUrl(selectedFilterCompany.logoFilename) 
                    ? "rgba(13,33,55,0.08)" 
                    : "linear-gradient(135deg, #0D2137 0%, #0F766E 100%)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {getCompanyLogoUrl(selectedFilterCompany.logoFilename) ? (
                    <img
                      src={getCompanyLogoUrl(selectedFilterCompany.logoFilename) ?? ""}
                      alt={selectedFilterCompany.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>
                      {selectedFilterCompany.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                      {selectedFilterCompany.name}
                    </span>
                    {selectedFilterCompany.groupName && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#0F766E",
                        background: "rgba(15,118,110,0.12)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}>
                        {selectedFilterCompany.groupName}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 }}>
                    <span style={{ fontWeight: 600 }}>{t("companies.owner", "Owner")}:</span>{" "}
                    {selectedFilterCompany.ownerName
                      ? `${selectedFilterCompany.ownerName}${selectedFilterCompany.ownerSurname ? ` ${selectedFilterCompany.ownerSurname}` : ""}`
                      : t("companies.ownerMissing", "No owner")}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <Users size={11} color="#0284C7" />
                      <span style={{ fontWeight: 600, color: "#0284C7" }}>{selectedFilterCompany.employeeCount}</span>
                      <span style={{ fontWeight: 500, color: "var(--text-muted)", fontSize: 10 }}>{t("companies.employees", "Employees")}</span>
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <Store size={11} color="#7C3AED" />
                      <span style={{ fontWeight: 600, color: "#7C3AED" }}>{selectedFilterCompany.storeCount}</span>
                      <span style={{ fontWeight: 500, color: "var(--text-muted)", fontSize: 10 }}>{t("companies.stores", "Stores")}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notifications Loaded Card */}
            <div style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--surface)",
              padding: "10px 12px",
              display: "grid",
              gap: 4,
              boxShadow: "var(--shadow-xs)",
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#0D2137", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("notifications.loaded", "Loaded")}
              </span>
              <span style={{ fontSize: 23, lineHeight: 1, fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                {filteredNotifications.length}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {t("notifications.ofTotal", "of {{total}}", { total: notificationCountByCompany.get(selectedFilterCompany.id) || 0 })}
              </span>
            </div>

            {/* Combined Stats Card */}
            <div style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--surface)",
              padding: "10px 12px",
              boxShadow: "var(--shadow-xs)",
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#0D2137", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                {t("notifications.stats", "Statistics")}
              </span>
              <div style={{ display: "flex", gap: 12, justifyContent: "space-around" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#DC2626", fontFamily: "var(--font-display)" }}>
                    {filteredNotifications.filter(n => !n.isRead).length}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 2 }}>
                    {t("notifications.unread", "Unread")}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#15803D", fontFamily: "var(--font-display)" }}>
                    {filteredNotifications.filter(n => n.isRead).length}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 2 }}>
                    {t("notifications.read", "Read")}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#EA580C", fontFamily: "var(--font-display)" }}>
                    {filteredNotifications.filter(n => n.priority === 'urgent' || n.priority === 'high').length}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 2 }}>
                    {t("notifications.highPriority", "High")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : scope === "company" ? (
          // All companies view
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <SummaryCard
              label={t("notifications.summaryTotal", "Loaded")}
              value={notifications.length}
              accent="#0D2137"
              caption={t("notifications.summaryOfTotal", "{{loaded}} of {{total}} total", { loaded: notifications.length, total })}
            />
            <SummaryCard
              label={t("notifications.summaryUnread", "Unread")}
              value={unreadCount}
              accent="#DC2626"
              caption={t("notifications.summaryNeedsAttention", "Need your attention")}
            />
            <SummaryCard
              label={t("notifications.summaryRead", "Read")}
              value={readCount}
              accent="#15803D"
              caption={t("notifications.summaryAlreadySeen", "Already seen")}
            />
            <SummaryCard
              label={t("notifications.priority_high", "High")}
              value={prioritySummary.urgent + prioritySummary.high}
              accent="#EA580C"
              caption={t("notifications.summaryPriority", "Urgent + High")}
            />
          </div>
        ) : (
          // My notifications view (original)
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <SummaryCard
              label={t("notifications.summaryTotal", "Loaded")}
              value={notifications.length}
              accent="#0D2137"
              caption={t("notifications.summaryOfTotal", "{{loaded}} of {{total}} total", { loaded: notifications.length, total })}
            />
            <SummaryCard
              label={t("notifications.summaryUnread", "Unread")}
              value={unreadCount}
              accent="#DC2626"
              caption={t("notifications.summaryNeedsAttention", "Need your attention")}
            />
            <SummaryCard
              label={t("notifications.summaryRead", "Read")}
              value={readCount}
              accent="#15803D"
              caption={t("notifications.summaryAlreadySeen", "Already seen")}
            />
            <SummaryCard
              label={t("notifications.priority_high", "High")}
              value={prioritySummary.urgent + prioritySummary.high}
              accent="#EA580C"
              caption={t("notifications.summaryPriority", "Urgent + High")}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Button
            variant="secondary"
            onClick={() => setScope("mine")}
            style={{
              background:
                scope === "mine" ? "var(--primary)" : "var(--surface)",
              border:
                scope === "mine"
                  ? "1px solid var(--primary)"
                  : "1px solid var(--border)",
              color: scope === "mine" ? "#fff" : "var(--text-primary)",
            }}
          >
            {t("notifications.tabMine", "My notifications")}
          </Button>

          {canViewCompanyFeed ? (
            <Button
              variant="secondary"
              onClick={() => setScope("company")}
              style={{
                background:
                  scope === "company" ? "var(--primary)" : "var(--surface)",
                border:
                  scope === "company"
                    ? "1px solid var(--primary)"
                    : "1px solid var(--border)",
                color: scope === "company" ? "#fff" : "var(--text-primary)",
              }}
            >
              {t("notifications.tabCompany", "Company notifications")}
            </Button>
          ) : null}
        </div>

        <div
          style={{
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            overflow: "hidden",
            minHeight: 340,
          }}
        >
          <div
            style={{
              padding: "11px 14px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
              background: "var(--surface-warm)",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {scope === "mine"
                ? t("notifications.tabMine", "My notifications")
                : t("notifications.tabCompany", "Company notifications")}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Company selector for company notifications - MOVED TO RIGHT */}
              {scope === "company" &&
                canViewCompanyFeed &&
                companies.length > 0 && (
                  <div ref={companyPickerRef} style={{ position: "relative", zIndex: 100 }}>
                    <button
                      type="button"
                      onClick={() =>
                        setCompanyDropdownOpen(!companyDropdownOpen)
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: selectedFilterCompany
                          ? "4px 8px"
                          : "4px 10px",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        background: "var(--surface)",
                        cursor: "pointer",
                        minWidth: 160,
                        height: 32,
                      }}
                    >
                      {selectedFilterCompany ? (
                        <>
                          <span
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 5,
                              overflow: "hidden",
                              border: "1px solid var(--border)",
                              background: getCompanyLogoUrl(selectedFilterCompany.logoFilename)
                                ? "rgba(13,33,55,0.08)"
                                : "linear-gradient(135deg, #0D2137 0%, #0F766E 100%)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {getCompanyLogoUrl(
                              selectedFilterCompany.logoFilename,
                            ) ? (
                              <img
                                src={
                                  getCompanyLogoUrl(
                                    selectedFilterCompany.logoFilename,
                                  ) ?? ""
                                }
                                alt={selectedFilterCompany.name}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  fontSize: 8,
                                  fontWeight: 800,
                                  color: "#fff",
                                }}
                              >
                                {selectedFilterCompany.name
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                            )}
                          </span>
                          <span
                            style={{ flex: 1, minWidth: 0, textAlign: "left" }}
                          >
                            <span
                              style={{
                                display: "block",
                                fontSize: 11,
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                lineHeight: 1.2,
                              }}
                            >
                              {selectedFilterCompany.name}
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            style={{
                              flex: 1,
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            {t("notifications.allCompanies", "All Companies")}
                          </span>
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              color: "var(--text-muted)",
                            }}
                          >
                            {notifications.length}
                          </span>
                        </>
                      )}
                      <ChevronDown
                        size={11}
                        color="var(--text-muted)"
                        style={{ flexShrink: 0 }}
                      />
                    </button>

                    {companyDropdownOpen && (
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "calc(100% + 6px)",
                          zIndex: 10,
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          background: "var(--surface)",
                          boxShadow: "0 16px 30px rgba(0,0,0,0.15)",
                          minWidth: 320,
                          maxHeight: 280,
                          overflowY: "auto",
                        }}
                      >
                        {/* All Companies Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCompanyId(null);
                            setCompanyDropdownOpen(false);
                          }}
                          style={{
                            width: "100%",
                            border: "none",
                            borderBottom: "1px solid var(--border)",
                            background:
                              selectedCompanyId === null
                                ? "var(--surface-warm)"
                                : "var(--surface)",
                            padding: "10px 12px",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--text-primary)",
                            }}
                          >
                            {t("notifications.allCompanies", "All Companies")}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "var(--text-secondary)",
                            }}
                          >
                            {notifications.length}
                          </span>
                        </button>

                        {/* Individual Companies */}
                        {companies.map((company) => {
                          const count =
                            notificationCountByCompany.get(company.id) || 0;
                          return (
                            <button
                              key={company.id}
                              type="button"
                              onClick={() => {
                                setSelectedCompanyId(company.id);
                                setCompanyDropdownOpen(false);
                              }}
                              style={{
                                width: "100%",
                                border: "none",
                                borderBottom: "1px solid var(--border)",
                                background:
                                  selectedCompanyId === company.id
                                    ? "var(--surface-warm)"
                                    : "var(--surface)",
                                padding: "9px 10px",
                                textAlign: "left",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                              }}
                            >
                              <span
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  border: "1px solid var(--border)",
                                  background: "rgba(13,33,55,0.08)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                {getCompanyLogoUrl(company.logoFilename) ? (
                                  <img
                                    src={
                                      getCompanyLogoUrl(company.logoFilename) ??
                                      ""
                                    }
                                    alt={company.name}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: "var(--primary)",
                                    }}
                                  >
                                    {company.name.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {company.name}
                                </span>
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 10.5,
                                    color: "var(--text-muted)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {company.ownerName
                                    ? `${company.ownerName}${company.ownerSurname ? ` ${company.ownerSurname}` : ""}`
                                    : t(
                                        "companies.ownerMissing",
                                        "No owner assigned",
                                      )}
                                </span>
                              </span>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "var(--text-secondary)",
                                  flexShrink: 0,
                                }}
                              >
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              {/* Delete Mode Button */}
              {scope === "mine" && notifications.length > 0 && (
                <Button
                  variant={deleteMode ? "danger" : "secondary"}
                  size="sm"
                  onClick={() => {
                    setDeleteMode(!deleteMode);
                    setSelectedNotificationIds(new Set());
                  }}
                >
                  {deleteMode ? (
                    <>
                      <X size={14} style={{ marginRight: 5 }} />
                      {t("common.cancel", "Cancel")}
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} style={{ marginRight: 5 }} />
                      {t("notifications.delete", "Delete")}
                    </>
                  )}
                </Button>
              )}

              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setUnreadOnly(false)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 6,
                    background: !unreadOnly ? "var(--primary)" : "transparent",
                    color: !unreadOnly ? "#fff" : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {t("notifications.filterAll", "All")}
                </button>
                <button
                  onClick={() => setUnreadOnly(true)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 6,
                    background: unreadOnly ? "var(--primary)" : "transparent",
                    color: unreadOnly ? "#fff" : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {t("notifications.filterUnread", "Unread")} ({unreadCount})
                </button>
              </div>
              {scope === "mine" && unreadCount > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleMarkAll}
                  disabled={markingAll}
                >
                  <CheckCheck size={14} style={{ marginRight: 5 }} />
                  {markingAll
                    ? t("common.loading")
                    : t("notifications.markAllRead")}
                </Button>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div
              style={{
                padding: 22,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              {t("common.loading")}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div style={{ padding: "34px 16px", textAlign: "center", position: "relative", zIndex: 1 }}>
              <div
                style={{
                  display: "inline-flex",
                  marginBottom: 10,
                  color: "var(--text-muted)",
                }}
              >
                <Bell size={28} />
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {t("notifications.empty")}
              </div>
            </div>
          ) : (
            <>
              {/* Delete Mode Actions Bar */}
              {deleteMode && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "var(--surface-warm)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={selectedNotificationIds.size === filteredNotifications.length && filteredNotifications.length > 0}
                      onChange={toggleSelectAll}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {selectedNotificationIds.size > 0
                        ? // The count has to travel as an interpolation value, not baked
                          // into the fallback string: a translated label would otherwise
                          // render the placeholder verbatim.
                          t("notifications.selectedCount", "{{n}} selected", {
                            n: selectedNotificationIds.size,
                          })
                        : t("notifications.selectAll", "Select all")}
                    </span>
                  </div>
                  {selectedNotificationIds.size > 0 && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={deleting}
                    >
                      <Trash2 size={14} style={{ marginRight: 5 }} />
                      {deleting
                        ? t("common.deleting", "Deleting...")
                        : t("notifications.deleteSelected", "Delete ({{n}})", {
                            n: selectedNotificationIds.size,
                          })}
                    </Button>
                  )}
                </div>
              )}

              <div style={{ display: "grid" }}>
                {filteredNotifications.map((item) => {
                  const priority = PRIORITY_COLORS[item.priority];
                  const visual = typeVisual(item.type);
                  const Icon = visual.icon;
                  const canMark = scope === "mine" && !item.isRead;
                  const recipientName = item.recipientName
                    ? `${item.recipientName}${item.recipientSurname ? ` ${item.recipientSurname}` : ""}`
                    : null;
                  const navigationUrl = getNotificationNavigationUrl(item);
                  const isHovered = hoveredNotificationId === item.id;

                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setHoveredNotificationId(item.id)}
                      onMouseLeave={() => setHoveredNotificationId(null)}
                      style={{
                        position: "relative",
                        border: "none",
                        borderBottom: "1px solid var(--border-light)",
                        background: item.isRead
                          ? "rgba(22,163,74,0.05)"
                          : "rgba(201,151,58,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: deleteMode ? "40px 5px minmax(0,1fr)" : "5px minmax(0,1fr)",
                          gap: 0,
                        }}
                      >
                        {deleteMode && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "12px 0",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedNotificationIds.has(item.id)}
                              onChange={() => toggleNotificationSelection(item.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: 16, height: 16, cursor: "pointer" }}
                            />
                          </div>
                        )}
                        <span
                          style={{
                            background: item.isRead
                              ? "#16A34A"
                              : priority.accent,
                            opacity: item.isRead ? 0.6 : 1,
                          }}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!deleteMode) {
                              if (canMark) {
                                await handleMarkRead(item);
                              }
                              if (navigationUrl) {
                                navigate(navigationUrl);
                              }
                            }
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            textAlign: "left",
                            cursor: (canMark || navigationUrl) && !deleteMode ? "pointer" : "default",
                            padding: "12px 14px 11px",
                            width: "100%",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "38px minmax(0,1fr)",
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 10,
                                background: visual.bg,
                                color: visual.color,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginTop: 2,
                              }}
                            >
                              <Icon size={16} />
                            </span>

                            <div>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 13.5,
                                    fontWeight: item.isRead ? 600 : 800,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {notificationTitle(item, t)}
                                </span>
                                <span
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    color: priority.accent,
                                    background: priority.chipBg,
                                    borderRadius: 999,
                                    padding: "2px 7px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.03em",
                                  }}
                                >
                                  {t(`notifications.priority_${item.priority}`)}
                                </span>
                              </div>

                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 12.5,
                                  color: "var(--text-secondary)",
                                  lineHeight: 1.45,
                                }}
                              >
                                {notificationMessage(item, t)}
                              </div>

                              <div
                                style={{
                                  marginTop: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {timeAgo(item.createdAt, t)}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      color: "var(--text-muted)",
                                      borderRadius: 999,
                                      border: "1px solid var(--border)",
                                      padding: "1px 7px",
                                    }}
                                  >
                                    {typeLabel(item.type, t)}
                                  </span>

                                  {item.locale && (
                                    <span
                                      title={item.locale.toUpperCase()}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                      }}
                                    >
                                      <FlagIcon
                                        locale={item.locale}
                                        size={16}
                                      />
                                    </span>
                                  )}

                                  {scope === "company" && recipientName && (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "2px 8px 2px 4px",
                                        borderRadius: 999,
                                        border: "1px solid var(--border)",
                                        background: "var(--surface-warm)",
                                      }}
                                    >
                                      <UserAvatar
                                        name={item.recipientName || ""}
                                        surname={item.recipientSurname || ""}
                                        avatarFilename={
                                          item.recipientAvatarFilename || null
                                        }
                                        size={18}
                                        showTooltip={false}
                                      />
                                      <span
                                        style={{
                                          fontSize: 10.5,
                                          color: "var(--text-secondary)",
                                          fontWeight: 500,
                                        }}
                                      >
                                        {recipientName}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {item.isRead && item.readAt ? (
                                  <span
                                    style={{
                                      fontSize: 10.5,
                                      color: "#166534",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {t("notifications.readAt", "Read")}:{" "}
                                    {timeAgo(item.readAt, t)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>

                      {/* View/Navigate Button on Hover */}
                      {isHovered && navigationUrl && !deleteMode && (
                        <a
                          href={navigationUrl}
                          onClick={async (e) => {
                            e.preventDefault();
                            if (canMark) {
                              await handleMarkRead(item);
                            }
                            navigate(navigationUrl);
                          }}
                          style={{
                            position: "absolute",
                            top: 12,
                            right: 12,
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: "var(--primary)",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 600,
                            textDecoration: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            cursor: "pointer",
                            zIndex: 10,
                          }}
                          title={t("notifications.viewSource", "Go to source")}
                        >
                          <ExternalLink size={12} />
                          {t("notifications.view", "View")}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              {notifications.length < total ? (
                <div
                  style={{
                    padding: 12,
                    display: "flex",
                    justifyContent: "center",
                    background: "var(--surface-warm)",
                  }}
                >
                  <Button
                    variant="secondary"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore
                      ? t("common.loading")
                      : t("notifications.loadMore", "Load more")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t("notifications.settingsTitle", "Notification settings")}
        footer={
          <div>
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
              {t("common.close", "Close")}
            </Button>
          </div>
        }
      >
        {!canManageSettings ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {t(
              "notifications.settingsForbidden",
              "Only administrators can change notification settings.",
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {/* Company Selector - Full Width at Top */}
            {companies.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontSize: "12.5px",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    letterSpacing: "0.01em",
                  }}
                >
                  {t("employees.companyField", "Company")} *
                </div>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() =>
                      setSettingsCompanyDropdownOpen(
                        !settingsCompanyDropdownOpen,
                      )
                    }
                    style={{
                      width: "100%",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface)",
                      minHeight: 46,
                      padding: selectedSettingsCompany ? "7px 10px" : "0 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      cursor: "pointer",
                    }}
                  >
                    {selectedSettingsCompany ? (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            overflow: "hidden",
                            border: "1px solid var(--border)",
                            background: "rgba(13,33,55,0.08)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {getCompanyLogoUrl(
                            selectedSettingsCompany.logoFilename,
                          ) ? (
                            <img
                              src={
                                getCompanyLogoUrl(
                                  selectedSettingsCompany.logoFilename,
                                ) ?? ""
                              }
                              alt={selectedSettingsCompany.name}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: "var(--primary)",
                              }}
                            >
                              {selectedSettingsCompany.name
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span style={{ minWidth: 0, textAlign: "left" }}>
                          <span
                            style={{
                              display: "block",
                              fontSize: 13,
                              fontWeight: 700,
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {selectedSettingsCompany.name}
                          </span>
                          <span
                            style={{
                              display: "block",
                              fontSize: 11,
                              color: "var(--text-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {selectedSettingsCompany.ownerName
                              ? `${selectedSettingsCompany.ownerName}${selectedSettingsCompany.ownerSurname ? ` ${selectedSettingsCompany.ownerSurname}` : ""}`
                              : t(
                                  "companies.ownerMissing",
                                  "No owner assigned",
                                )}
                          </span>
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            borderRadius: 999,
                            border: "1px solid rgba(21,128,61,0.3)",
                            background: "rgba(34,197,94,0.1)",
                            color: "#166534",
                            padding: "2px 7px",
                            fontSize: 10,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t("notifications.canEdit", "Can Edit")}
                        </span>
                      </span>
                    ) : (
                      <span
                        style={{ fontSize: 13, color: "var(--text-muted)" }}
                      >
                        {t("employees.selectCompany", "Select company")}
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      color="var(--text-muted)"
                      style={{ flexShrink: 0 }}
                    />
                  </button>

                  {settingsCompanyDropdownOpen && (
                    <>
                      <div
                        style={{
                          position: "fixed",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 999,
                        }}
                        onClick={() => setSettingsCompanyDropdownOpen(false)}
                      />
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: "calc(100% + 6px)",
                          zIndex: 1000,
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          background: "var(--surface)",
                          boxShadow: "0 16px 30px rgba(0,0,0,0.15)",
                          maxHeight: 280,
                          overflowY: "auto",
                        }}
                      >
                        {companies.map((company) => {
                          const progress = notificationProgressByCompany.get(
                            company.id,
                          ) || {
                            enabled: 0,
                            total: NOTIFICATION_EVENT_DEFINITIONS.length,
                          };
                          const progressPercent =
                            progress.total > 0
                              ? Math.round(
                                  (progress.enabled / progress.total) * 100,
                                )
                              : 0;
                          const canEdit = canEditCompany(company.id);

                          return (
                            <button
                              key={company.id}
                              type="button"
                              onClick={() => {
                                setSettingsCompanyId(company.id);
                                setSettingsCompanyDropdownOpen(false);
                              }}
                              style={{
                                width: "100%",
                                border: "none",
                                borderBottom: "1px solid var(--border)",
                                background:
                                  settingsCompanyId === company.id
                                    ? "var(--surface-warm)"
                                    : "var(--surface)",
                                padding: "9px 10px",
                                textAlign: "left",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                cursor: "pointer",
                              }}
                            >
                              <span
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 8,
                                  overflow: "hidden",
                                  border: "1px solid var(--border)",
                                  background: "rgba(13,33,55,0.08)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                {getCompanyLogoUrl(company.logoFilename) ? (
                                  <img
                                    src={
                                      getCompanyLogoUrl(company.logoFilename) ??
                                      ""
                                    }
                                    alt={company.name}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      color: "var(--primary)",
                                    }}
                                  >
                                    {company.name.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {company.name}
                                </span>
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: 10.5,
                                    color: "var(--text-muted)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {company.ownerName
                                    ? `${company.ownerName}${company.ownerSurname ? ` ${company.ownerSurname}` : ""}`
                                    : t(
                                        "companies.ownerMissing",
                                        "No owner assigned",
                                      )}
                                </span>
                              </span>

                              {/* Progress bar and Can Edit indicator */}
                              <span
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                  gap: 4,
                                  flexShrink: 0,
                                }}
                              >
                                {/* Progress bar */}
                                <span
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 40,
                                      height: 6,
                                      borderRadius: 999,
                                      background: "var(--border)",
                                      overflow: "hidden",
                                      position: "relative",
                                    }}
                                  >
                                    <span
                                      style={{
                                        position: "absolute",
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: `${progressPercent}%`,
                                        background:
                                          progressPercent > 75
                                            ? "#16A34A"
                                            : progressPercent > 50
                                              ? "#C9973A"
                                              : "#DC2626",
                                        transition: "width 0.3s ease",
                                      }}
                                    />
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: "var(--text-secondary)",
                                      minWidth: 28,
                                      textAlign: "right",
                                    }}
                                  >
                                    {progress.enabled}/{progress.total}
                                  </span>
                                </span>

                                {/* Can Edit indicator */}
                                {canEdit ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 3,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      color: "#166534",
                                      background: "rgba(34,197,94,0.1)",
                                      border: "1px solid rgba(21,128,61,0.3)",
                                      borderRadius: 999,
                                      padding: "1px 5px",
                                    }}
                                  >
                                    <CheckCircle2 size={10} strokeWidth={2.5} />
                                    {t("notifications.canEdit", "Can Edit")}
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 3,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      color: "#991B1B",
                                      background: "rgba(220,38,38,0.1)",
                                      border: "1px solid rgba(185,28,28,0.3)",
                                      borderRadius: 999,
                                      padding: "1px 5px",
                                    }}
                                  >
                                    <XCircle size={10} strokeWidth={2.5} />
                                    {t("notifications.viewOnly", "View Only")}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {settingsLoading ? (
              <div style={{ display: "grid", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((id) => (
                  <div
                    key={id}
                    className="skeleton"
                    style={{ height: 68, borderRadius: 10 }}
                  />
                ))}
              </div>
            ) : (
              <>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                  }}
                >
                  {t(
                    "notifications.settingsSubtitle",
                    "Enable or disable events, review trigger actions, and verify recipient roles/users.",
                  )}
                </p>

                {groupedDefinitions.map(({ category, events }) => {
                  const CategoryIcon = CATEGORY_ICONS[category.key];
                  return (
                    <div
                      key={category.key}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          background: "var(--surface-warm)",
                          borderBottom: "1px solid var(--border)",
                          fontSize: 12,
                          fontWeight: 800,
                          color: "var(--text-secondary)",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <CategoryIcon size={14} />
                          {t(category.i18nKey)}
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--text-muted)",
                            background: "var(--surface)",
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid var(--border)",
                            textTransform: "capitalize",
                          }}
                        >
                          {category.key}
                        </span>
                      </div>

                      <div style={{ display: "grid" }}>
                        {events.map((def) => {
                          const current = settingByKey.get(def.eventKey);
                          const enabled = current ? current.enabled : true;
                          const roles = current?.roles?.length
                            ? current.roles
                            : def.defaultRoles;
                          const priority = current?.priority || "medium";
                          const recipients =
                            recentRecipients.get(def.eventKey) ?? [];
                          const actionKey = `notifications.settingsAction_${def.eventKey.replace(/\./g, "_")}`;
                          const isSaving = settingsSavingKey === def.eventKey;

                          const priorityColors: Record<string, string> = {
                            urgent: "#DC2626",
                            high: "#EA580C",
                            medium: "#C9973A",
                            low: "#64748B",
                          };

                          return (
                            <div
                              key={def.eventKey}
                              style={{
                                padding: "10px 12px",
                                borderBottom: "1px solid var(--border-light)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: 13.5,
                                        fontWeight: 700,
                                        color: "var(--text-primary)",
                                      }}
                                    >
                                      {typeLabel(def.eventKey, t)}
                                    </div>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: priorityColors[priority],
                                        background: `${priorityColors[priority]}15`,
                                        borderRadius: 999,
                                        padding: "2px 7px",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.03em",
                                      }}
                                    >
                                      {t(
                                        `notifications.priority_${priority}`,
                                        priority,
                                      )}
                                    </span>
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 3,
                                      fontSize: 12,
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {t(actionKey, def.eventKey)}
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 8,
                                      display: "grid",
                                      gap: 5,
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: "var(--text-muted)",
                                      }}
                                    >
                                      {t(
                                        "notifications.settingsRecipients",
                                        "Recipient roles/users",
                                      )}
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {roles.map((role) => (
                                        <span
                                          key={`${def.eventKey}-${role}`}
                                          style={{
                                            fontSize: 10.5,
                                            color: "var(--text-secondary)",
                                            borderRadius: 999,
                                            border: "1px solid var(--border)",
                                            padding: "1px 7px",
                                          }}
                                        >
                                          {roleLabel(role, t)}
                                        </span>
                                      ))}
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        marginTop: 8,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: 10.5,
                                          color: "var(--text-muted)",
                                        }}
                                      >
                                        {t(
                                          "notifications.recentRecipients",
                                          "Recipients (last 24h)",
                                        )}
                                      </span>
                                      <div
                                        style={{
                                          display: "flex",
                                          marginLeft: 8,
                                        }}
                                      >
                                        {recipients.length > 0 ? (
                                          recipients.map((recipient, index) => (
                                            <div
                                              key={`${def.eventKey}-${recipient.userId}`}
                                              style={{
                                                marginLeft: index > 0 ? -8 : 0,
                                                zIndex:
                                                  recipients.length - index,
                                              }}
                                            >
                                              <UserAvatar
                                                name={recipient.name}
                                                surname={recipient.surname}
                                                avatarFilename={
                                                  recipient.avatarFilename
                                                }
                                                size={28}
                                                showTooltip={true}
                                              />
                                            </div>
                                          ))
                                        ) : (
                                          <span
                                            style={{
                                              fontSize: 10.5,
                                              color: "var(--text-muted)",
                                              fontStyle: "italic",
                                            }}
                                          >
                                            {t(
                                              "notifications.noRecentRecipients",
                                              "None",
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleEditRoles(def)}
                                    style={{
                                      border: "none",
                                      background: "none",
                                      padding: "4px",
                                      cursor: "pointer",
                                      color: "var(--primary)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                    title={t(
                                      "notifications.editSettings",
                                      "Edit settings",
                                    )}
                                  >
                                    <Edit2 size={16} />
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => {
                                      void handleToggleSetting(def);
                                    }}
                                    style={{
                                      border: "none",
                                      background: "none",
                                      padding: 0,
                                      cursor: isSaving
                                        ? "not-allowed"
                                        : "pointer",
                                      opacity: isSaving ? 0.6 : 1,
                                    }}
                                    aria-label={
                                      enabled
                                        ? t(
                                            "notifications.disableEvent",
                                            "Disable event",
                                          )
                                        : t(
                                            "notifications.enableEvent",
                                            "Enable event",
                                          )
                                    }
                                  >
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        width: 42,
                                        height: 23,
                                        borderRadius: 999,
                                        background: enabled
                                          ? "#0F766E"
                                          : "#9CA3AF",
                                        position: "relative",
                                        transition: "background 0.2s ease",
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 19,
                                          height: 19,
                                          borderRadius: "50%",
                                          background: "#fff",
                                          position: "absolute",
                                          top: 2,
                                          left: enabled ? 21 : 2,
                                          transition: "left 0.2s ease",
                                          boxShadow:
                                            "0 1px 3px rgba(0,0,0,0.25)",
                                        }}
                                      />
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </Modal>

      <RoleEditModal
        open={roleEditOpen}
        onClose={() => {
          setRoleEditOpen(false);
          setEditingEvent(null);
        }}
        eventKey={editingEvent?.eventKey || ""}
        eventTitle={editingEvent ? typeLabel(editingEvent.eventKey, t) : ""}
        eventDescription={
          editingEvent
            ? t(
                `notifications.settingsAction_${editingEvent.eventKey.replace(/\./g, "_")}`,
                editingEvent.eventKey,
              )
            : ""
        }
        currentRoles={
          editingEvent
            ? settingByKey.get(editingEvent.eventKey)?.roles ||
              editingEvent.defaultRoles
            : []
        }
        currentPriority={
          editingEvent
            ? settingByKey.get(editingEvent.eventKey)?.priority || "medium"
            : "medium"
        }
        onSave={handleSaveRoles}
        companyName={selectedSettingsCompany?.name}
        companyLogoFilename={selectedSettingsCompany?.logoFilename}
        companyOwnerName={selectedSettingsCompany?.ownerName}
        companyOwnerSurname={selectedSettingsCompany?.ownerSurname}
      />
    </>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  caption,
}: {
  label: string;
  value: number;
  accent: string;
  caption: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--surface)",
        padding: "10px 12px",
        display: "grid",
        gap: 4,
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 23,
          lineHeight: 1,
          fontWeight: 800,
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {caption}
      </span>
    </div>
  );
}
