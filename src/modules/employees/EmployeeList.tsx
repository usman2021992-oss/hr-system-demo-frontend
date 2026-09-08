import { useEffect, useState, useCallback, useMemo } from "react";
import { Upload, Download, Filter, Search, X, MoreVertical, Plus } from "lucide-react";
import { useLicenses, LicenseNotice } from '../billing/useLicenses';
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight } from "lucide-react";
import { createPortal } from "react-dom";
import { getEmployees } from "../../api/employees";
import apiClient, { getAvatarUrl } from "../../api/client";
import { listTransfers, TransferAssignment } from "../../api/transfers";
import { translateApiError } from "../../utils/apiErrors";
import { getStores } from "../../api/stores";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { Employee, Store, UserRole } from "../../types";
import { Table, Column } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { Input } from "../../components/ui/Input";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { EmployeeForm } from "./EmployeeForm";
import { BulkImportModal } from "./BulkImportModal";
import { ExportConfirmModal } from "./ExportConfirmModal";
import { FilterModal, FilterValues } from "./FilterModal";
import { exportEmployeesToExcel } from "./bulkImportUtils";
import CustomSelect, { SelectOption } from "../../components/ui/CustomSelect";

interface CompanyOption {
  id: number;
  name: string;
}

const ROLE_BADGE_VARIANT: Record<
  UserRole,
  "accent" | "primary" | "info" | "success" | "warning" | "neutral"
> = {
  admin: "accent",
  hr: "info",
  area_manager: "success",
  store_manager: "warning",
  employee: "neutral",
  store_terminal: "neutral",
};

const AVATAR_PALETTE = [
  "#0D2137",
  "#163352",
  "#8B6914",
  "#1B4D3E",
  "#2C5282",
  "#5B2333",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function formatTransferDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function truncateText(value: string | null | undefined, max: number): string {
  const text = value ?? "—";
  if (text === "—" || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export function EmployeeList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, allowedCompanyIds = [] } = useAuth();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [showNewForm, setShowNewForm] = useState(false);
  // Paid allowance, so the create action can be honest before the form opens.
  const { licenses, enforced, canAddEmployee, refresh: refreshLicenses } = useLicenses();
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newFormInstance, setNewFormInstance] = useState(0);
  const [listReloadTick, setListReloadTick] = useState(0);
  const [exporting, setExporting] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [activeTransfersByUser, setActiveTransfersByUser] = useState<
    Record<number, TransferAssignment>
  >({});
  const [hoveredTransferUserId, setHoveredTransferUserId] = useState<
    number | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  // Memoize the parsed arrays to prevent infinite loops
  const storeIdsArray = useMemo(() => 
    searchParams.get("store_ids")?.split(",").filter(Boolean) ?? [], 
    [searchParams]
  );
  
  const companyIdsArray = useMemo(() => 
    searchParams.get("company_ids")?.split(",").filter(Boolean) ?? [], 
    [searchParams]
  );

  const search = searchParams.get("search") ?? "";
  const storeIds = storeIdsArray;
  const department = searchParams.get("department") ?? "";
  const status = searchParams.get("status") ?? "";
  const role = searchParams.get("role") ?? "";
  const companyIds = companyIdsArray;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 20;

  const { isMobile } = useBreakpoint();
  const isAdminOrHr =
    user?.role === "admin" ||
    user?.role === "hr" ||
    user?.role === "area_manager";
  const isSuperAdmin = user?.isSuperAdmin === true;
  const tRole = (roleKey: string) =>
    (t as (k: string) => string)(`roles.${roleKey}`);
  const hasActiveFilters = !!(
    search ||
    storeIds.length > 0 ||
    department ||
    status ||
    role ||
    companyIds.length > 0
  );

  const companyOptions = useMemo<SelectOption[]>(() => {
    return companies.map((c) => ({
      value: String(c.id),
      label: c.name,
    }));
  }, [companies]);

  const storeOptions = useMemo<SelectOption[]>(() => {
    return stores.map((s) => ({
      value: String(s.id),
      label: s.companyName ? `${s.name} (${s.companyName})` : s.name,
    }));
  }, [stores]);

  const statusOptions = useMemo<SelectOption[]>(
    () => [
      { value: "active", label: t("employees.statusActive") },
      { value: "inactive", label: t("employees.statusInactive") },
    ],
    [t],
  );

  const roleOptions = useMemo<SelectOption[]>(
    () => [
      { value: "admin", label: tRole("admin") },
      { value: "hr", label: tRole("hr") },
      { value: "area_manager", label: tRole("area_manager") },
      { value: "store_manager", label: tRole("store_manager") },
      { value: "employee", label: tRole("employee") },
    ],
    [t, tRole],
  );

  const handleExportClick = useCallback(() => {
    setShowExportModal(true);
  }, []);

  const handleExportConfirm = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // For multiple stores or companies, we need to fetch all employees and filter client-side
      const res = await getEmployees({
        search: search || undefined,
        storeId: storeIds.length === 1 ? parseInt(storeIds[0], 10) : undefined,
        department: department || undefined,
        status: status || undefined,
        role: role || undefined,
        page: 1,
        limit: 10000,
        targetCompanyId: companyIds.length === 1 ? parseInt(companyIds[0], 10) : undefined,
        includeSensitive: true,
      });
      
      let employeesToExport = res.employees;
      
      // If multiple companies selected, filter client-side
      if (companyIds.length > 1) {
        const companyIdNumbers = companyIds.map((id) => parseInt(id, 10));
        employeesToExport = employeesToExport.filter((emp) => 
          emp.companyId && companyIdNumbers.includes(emp.companyId)
        );
      }
      
      // If multiple stores selected, filter client-side
      if (storeIds.length > 1) {
        const storeIdNumbers = storeIds.map((id) => parseInt(id, 10));
        employeesToExport = employeesToExport.filter((emp) => 
          emp.storeId && storeIdNumbers.includes(emp.storeId)
        );
      }
      
      const safeName = `employees_${new Date().toISOString().slice(0, 10)}.xlsx`;
      exportEmployeesToExcel(employeesToExport, safeName);
      setShowExportModal(false);
      showToast(t("employees.exportSuccess", "Employees exported successfully"), "success");
    } catch {
      showToast(t("employees.exportError", "Failed to export employees"), "error");
    } finally {
      setExporting(false);
    }
  }, [exporting, search, storeIds, department, status, role, companyIds, t, showToast]);

  const estimatedFileSize = useMemo(() => {
    const avgBytesPerEmployee = 500; // Rough estimate
    const sizeInKB = (total * avgBytesPerEmployee) / 1024;
    if (sizeInKB < 1024) {
      return `${Math.round(sizeInKB)} KB`;
    }
    return `${(sizeInKB / 1024).toFixed(2)} MB`;
  }, [total]);

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        if (key !== "page") next.set("page", "1");
        return next;
      });
    },
    [setSearchParams],
  );

  const handleApplyFilters = useCallback(
    (filters: FilterValues) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        
        // Handle company_ids array
        if (filters.company_ids.length > 0) {
          next.set("company_ids", filters.company_ids.join(","));
        } else {
          next.delete("company_ids");
        }
        
        // Handle store_ids array
        if (filters.store_ids.length > 0) {
          next.set("store_ids", filters.store_ids.join(","));
        } else {
          next.delete("store_ids");
        }
        
        // Handle other filters
        if (filters.department) {
          next.set("department", filters.department);
        } else {
          next.delete("department");
        }
        
        if (filters.status) {
          next.set("status", filters.status);
        } else {
          next.delete("status");
        }
        
        if (filters.role) {
          next.set("role", filters.role);
        } else {
          next.delete("role");
        }
        
        next.set("page", "1");
        return next;
      });
    },
    [setSearchParams],
  );

  const removeFilter = useCallback(
    (key: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        
        // Handle company removal
        if (key.startsWith("company_")) {
          const companyId = key.replace("company_", "");
          const currentIds = next.get("company_ids")?.split(",").filter(Boolean) ?? [];
          const newIds = currentIds.filter((id) => id !== companyId);
          if (newIds.length > 0) {
            next.set("company_ids", newIds.join(","));
          } else {
            next.delete("company_ids");
          }
        }
        // Handle store removal
        else if (key.startsWith("store_")) {
          const storeId = key.replace("store_", "");
          const currentIds = next.get("store_ids")?.split(",").filter(Boolean) ?? [];
          const newIds = currentIds.filter((id) => id !== storeId);
          if (newIds.length > 0) {
            next.set("store_ids", newIds.join(","));
          } else {
            next.delete("store_ids");
          }
        }
        // Handle other filters
        else {
          next.delete(key);
        }
        
        next.set("page", "1");
        return next;
      });
    },
    [setSearchParams],
  );

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ key: string; label: string; value: string }> = [];
    
    // Handle multiple companies
    if (companyIds.length > 0) {
      companyIds.forEach((companyId) => {
        const company = companies.find((c) => String(c.id) === companyId);
        if (company) {
          tags.push({ key: `company_${companyId}`, label: t("employees.filterCompany", "Company"), value: company.name });
        }
      });
    }
    
    // Handle multiple stores
    if (storeIds.length > 0) {
      storeIds.forEach((storeId) => {
        const store = stores.find((s) => String(s.id) === storeId);
        if (store) {
          tags.push({ key: `store_${storeId}`, label: t("employees.filterStore", "Store"), value: store.name });
        }
      });
    }
    
    if (department) {
      tags.push({ key: "department", label: t("employees.filterDepartment", "Department"), value: department });
    }
    
    if (status) {
      const statusLabel = status === "active" ? t("employees.statusActive") : t("employees.statusInactive");
      tags.push({ key: "status", label: t("employees.filterStatus", "Status"), value: statusLabel });
    }
    
    if (role) {
      tags.push({ key: "role", label: t("employees.filterRole", "Role"), value: tRole(role) });
    }
    
    return tags;
  }, [companyIds, storeIds, department, status, role, companies, stores, t, tRole]);

  // Re-fetch stores whenever the company filter changes (super admin viewing a different company)
  useEffect(() => {
    const targetId = companyIds.length === 1 ? parseInt(companyIds[0], 10) : undefined;
    getStores(targetId ? { targetCompanyId: targetId } : undefined)
      .then(setStores)
      .catch(() => {});
  }, [companyIds.join(",")]);

  useEffect(() => {
    if (!isAdminOrHr && !isSuperAdmin) return;
    apiClient
      .get<{ data: CompanyOption[] }>("/companies")
      .then((res) => {
        const data = res.data?.data;
        if (Array.isArray(data)) {
          setCompanies(data.map((c) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {});
  }, [isAdminOrHr, isSuperAdmin]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getEmployees({
      search: search || undefined,
      storeId: storeIds.length === 1 ? parseInt(storeIds[0], 10) : undefined,
      department: department || undefined,
      status: status || undefined,
      role: role || undefined,
      page,
      limit,
      targetCompanyId: companyIds.length === 1 ? parseInt(companyIds[0], 10) : undefined,
    })
      .then((res) => {
        let filteredEmployees = res.employees;
        
        // If multiple companies selected, filter client-side
        if (companyIds.length > 1) {
          const companyIdNumbers = companyIds.map((id) => parseInt(id, 10));
          filteredEmployees = filteredEmployees.filter((emp) => 
            emp.companyId && companyIdNumbers.includes(emp.companyId)
          );
        }
        
        // If multiple stores selected, filter client-side
        if (storeIds.length > 1) {
          const storeIdNumbers = storeIds.map((id) => parseInt(id, 10));
          filteredEmployees = filteredEmployees.filter((emp) => 
            emp.storeId && storeIdNumbers.includes(emp.storeId)
          );
        }
        
        const needsClientSideFiltering = companyIds.length > 1 || storeIds.length > 1;
        setEmployees(filteredEmployees);
        setTotal(needsClientSideFiltering ? filteredEmployees.length : res.total);
        setPages(needsClientSideFiltering ? Math.ceil(filteredEmployees.length / limit) : res.pages);
      })
      .catch((err) => {
        setError(translateApiError(err, t, t("employees.errorLoad")));
      })
      .finally(() => setLoading(false));
  }, [
    search,
    storeIds,
    department,
    status,
    role,
    companyIds,
    page,
    listReloadTick,
    limit,
    t,
  ]);

  useEffect(() => {
    let mounted = true;
    listTransfers({ status: "active" })
      .then((res) => {
        if (!mounted) return;
        const byUser = new Map<number, TransferAssignment>();
        for (const tr of res.transfers) {
          const current = byUser.get(tr.userId);
          if (!current || tr.startDate > current.startDate) {
            byUser.set(tr.userId, tr);
          }
        }
        setActiveTransfersByUser(
          Object.fromEntries(Array.from(byUser.entries())),
        );
      })
      .catch(() => {
        if (!mounted) return;
        setActiveTransfersByUser({});
      });

    return () => {
      mounted = false;
    };
  }, [companyIds.join(","), page, limit, allowedCompanyIds.join(",")]);

  // Show company column when admin/hr/super admin is viewing all companies (no specific company filter)
  const showCompanyColumn = (isAdminOrHr || isSuperAdmin) && companyIds.length === 0;

  const columns: Column<Employee>[] = [
    {
      key: "name",
      label: t("employees.colName"),
      render: (row) => {
        const fullName =
          [row.name, row.surname].filter(Boolean).join(" ") || "Utente";
        const rawInitials = (row.name?.[0] ?? "") + (row.surname?.[0] ?? "");
        const initials = (rawInitials || "?").toUpperCase();
        const bg = getAvatarColor(fullName);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                background: row.avatarFilename ? "transparent" : bg,
                color: "#fff",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                fontFamily: "var(--font-display)",
                overflow: "hidden",
              }}
            >
              {row.avatarFilename ? (
                <img
                  src={getAvatarUrl(row.avatarFilename) ?? ""}
                  alt={fullName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                initials
              )}
            </div>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontSize: "13.5px",
                  lineHeight: 1.3,
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fullName}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  lineHeight: 1.4,
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {truncateText(row.email, 18)}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "uniqueId",
      label: t("employees.colUniqueId"),
      render: (row) => (
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "12px",
            letterSpacing: "0.04em",
            color: row.uniqueId
              ? "var(--text-secondary)"
              : "var(--text-disabled)",
          }}
        >
          {row.uniqueId ?? "—"}
        </span>
      ),
    },
    {
      key: "role",
      label: t("employees.colRole"),
      render: (row) => (
        <Badge variant={ROLE_BADGE_VARIANT[row.role]}>
          {row.isSuperAdmin ? t("roles.super_admin") : tRole(row.role)}
        </Badge>
      ),
    },
    ...(showCompanyColumn
      ? [
          {
            key: "companyName" as keyof Employee,
            label: t("employees.colCompany"),
            render: (row: Employee) => (
              <div style={{ display: "grid", gap: 2, maxWidth: 170 }}>
                <span
                  style={{
                    fontSize: "13px",
                    color: row.companyName
                      ? "var(--text-secondary)"
                      : "var(--text-disabled)",
                    display: "inline-block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {truncateText(row.companyName, 16)}
                </span>
                {row.companyGroupName ? (
                  <span
                    style={{
                      fontSize: "10.5px",
                      color: "#9A6808",
                      display: "inline-block",
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {truncateText(row.companyGroupName, 18)}
                  </span>
                ) : null}
              </div>
            ),
          },
        ]
      : []),
    {
      key: "storeName",
      label: t("employees.colStore"),
      render: (row) => {
        const transfer = activeTransfersByUser[row.id];
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const isExpired = transfer && transfer.endDate && transfer.endDate < todayStr;
        if (transfer && !isExpired) {
          const showPopover = hoveredTransferUserId === row.id;
          return (
            <div
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 5,
                position: "relative",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  maxWidth: 160,
                  display: "inline-block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {truncateText(transfer.originStoreName || row.storeName, 16)}
              </span>

              <button
                type="button"
                onMouseEnter={() => setHoveredTransferUserId(row.id)}
                onMouseLeave={() =>
                  setHoveredTransferUserId((prev) =>
                    prev === row.id ? null : prev,
                  )
                }
                onFocus={() => setHoveredTransferUserId(row.id)}
                onBlur={() =>
                  setHoveredTransferUserId((prev) =>
                    prev === row.id ? null : prev,
                  )
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(15,118,110,0.35)",
                  background: "rgba(13,148,136,0.12)",
                  color: "#115e59",
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  cursor: "help",
                }}
                title={`${transfer.originStoreName} -> ${transfer.targetStoreName}`}
              >
                <ArrowLeftRight size={11} strokeWidth={2.3} />
                {t("transfers.transfer", "Transfer")}
              </button>

              {showPopover && (
                <div
                  onMouseEnter={() => setHoveredTransferUserId(row.id)}
                  onMouseLeave={() =>
                    setHoveredTransferUserId((prev) =>
                      prev === row.id ? null : prev,
                    )
                  }
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    minWidth: 250,
                    maxWidth: 320,
                    zIndex: 15,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "#fff",
                    boxShadow: "0 14px 30px rgba(0,0,0,0.16)",
                    padding: "10px 11px",
                    display: "grid",
                    gap: 5,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "var(--primary)",
                    }}
                  >
                    {transfer.originStoreName}
                    {" -> "}
                    {transfer.targetStoreName}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {t("transfers.form.startDate", "Start date")}:{" "}
                    <strong>{formatTransferDate(transfer.startDate)}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {t("transfers.form.endDate", "End date")}:{" "}
                    <strong>{formatTransferDate(transfer.endDate)}</strong>
                  </div>
                  {transfer.reason && (
                    <div
                      style={{ fontSize: 11, color: "var(--text-secondary)" }}
                    >
                      {t("transfers.form.reason", "Reason")}: {transfer.reason}
                    </div>
                  )}
                  {transfer.notes && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {t("common.notes", "Notes")}: {transfer.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }
        return (
          <span
            style={{
              fontSize: "13px",
              color: row.storeName
                ? "var(--text-secondary)"
                : "var(--text-disabled)",
              maxWidth: 160,
              display: "inline-block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {truncateText(row.storeName, 16)}
          </span>
        );
      },
    },
    {
      key: "department",
      label: t("employees.colDept"),
      render: (row) => (
        <span
          style={{
            fontSize: "13px",
            color: row.department
              ? "var(--text-secondary)"
              : "var(--text-disabled)",
            maxWidth: 160,
            display: "inline-block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.department ? truncateText(row.department, 16) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      label: t("employees.colStatus"),
      render: (row) => (
        <Badge variant={row.status === "active" ? "success" : "danger"}>
          {row.status === "active"
            ? t("employees.statusActive")
            : t("employees.statusInactive")}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: t('employees.colActions', 'Action'),
      width: '80px',
      align: 'right',
      render: (row) => (
        <button
          onClick={() => navigate(`/dipendenti/${row.id}`)}
          className="emp-open-btn"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--accent)",
            fontFamily: "var(--font-body)",
            padding: "5px 10px",
            borderRadius: "var(--radius-sm)",
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            whiteSpace: "nowrap",
          }}
        >
          {t("common.open")} →
        </button>
      ),
    },
  ];

  return (
    <div
      className="page-enter"
      style={{ maxWidth: "1200px", margin: "0 auto" }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          marginBottom: "24px",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "3px",
            }}
          >
            <h1
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {t("employees.title")}
            </h1>
            {total > 0 && !loading && (
              <span
                style={{
                  background: "var(--primary)",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 700,
                  fontFamily: "var(--font-display)",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  letterSpacing: "0.04em",
                }}
              >
                {total}
              </span>
            )}
          </div>
          <p
            style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}
          >
            {hasActiveFilters
              ? t("employees.foundResults", { count: total })
              : t("employees.subtitle")}
          </p>
        </div>

        {isAdminOrHr && (
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexShrink: 0,
              width: isMobile ? "auto" : "auto",
              flexDirection: isMobile ? "row" : "row",
            }}
          >
            {isMobile ? (
              /* Mobile: Three dots menu button */
              <button
                onClick={() => setMobileMenuOpen(true)}
                style={{
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                  border: "1.5px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "9px 12px",
                  fontSize: "13px",
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                  height: "38px",
                  minWidth: "38px",
                }}
              >
                <MoreVertical size={18} strokeWidth={2.5} />
              </button>
            ) : (
              /* Desktop: All buttons inline */
              <>
                <button
                  onClick={handleExportClick}
                  disabled={exporting}
                  style={{
                    background: "var(--surface)",
                    color: "var(--primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "9px 18px",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                    cursor: exporting ? "not-allowed" : "pointer",
                    opacity: exporting ? 0.65 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    flexShrink: 0,
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                >
                  <Download size={15} />
                  {exporting
                    ? t("common.loading", "Exporting…")
                    : t("employees.exportBtn", "Export Employees")}
                </button>
                <button
                  onClick={() => setShowBulkImport(true)}
                  style={{
                    background: "var(--surface)",
                    color: "var(--primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "9px 18px",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    flexShrink: 0,
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                >
                  <Upload size={15} />
                  {t("employees.bulkImportBtn", "Import Employees")}
                </button>
                <button
                  onClick={() => setShowNewForm(true)}
                  disabled={!canAddEmployee}
                  title={
                    canAddEmployee
                      ? undefined
                      : t(
                          'billing.employeeLicensesFullShort',
                          'Licenze dipendenti esaurite: acquistane altre da Fatturazione'
                        )
                  }
                  className="btn btn-primary"
                  style={{
                    background: "var(--primary)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius)",
                    padding: "9px 18px",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    flexShrink: 0,
                    boxShadow: "0 2px 8px rgba(13,33,55,0.18)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "17px",
                      lineHeight: 1,
                      marginTop: "-1px",
                      fontWeight: 300,
                    }}
                  >
                    +
                  </span>
                  {t("employees.newEmployee")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <LicenseNotice resource="employee" licenses={licenses} enforced={enforced} />

      {/* Filter bar - New Improved Design */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        {/* Search and Filter Button Row */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "10px 12px",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          {/* Universal Search Input */}
          <div style={{ flex: 1, position: "relative" }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <Input
              placeholder={t("employees.universalSearchPlaceholder", "Search by name or ID...")}
              value={search}
              onChange={(e) => updateParam("search", e.target.value)}
              style={{
                paddingLeft: "40px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: "14px",
              }}
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilterModal(true)}
            style={{
              background: hasActiveFilters
                ? "linear-gradient(135deg, var(--accent) 0%, #B48719 100%)"
                : "var(--surface)",
              color: hasActiveFilters ? "#fff" : "var(--text-secondary)",
              border: hasActiveFilters ? "none" : "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
              transition: "all 0.2s",
              boxShadow: hasActiveFilters ? "0 2px 8px rgba(139,105,20,0.24)" : "none",
              position: "relative",
            }}
          >
            <Filter size={16} strokeWidth={2.5} />
            {t("employees.filters", "Filters")}
            {activeFilterTags.length > 0 && (
              <span
                style={{
                  background: "#fff",
                  color: "var(--accent)",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: "999px",
                  minWidth: "18px",
                  textAlign: "center",
                }}
              >
                {activeFilterTags.length}
              </span>
            )}
          </button>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={() => setSearchParams(new URLSearchParams())}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "10px 14px",
                fontSize: "13px",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexShrink: 0,
                transition: "border-color 0.15s, color 0.15s",
              }}
              title={t("employees.resetFilters", "Reset all filters")}
            >
              <X size={16} />
              {!isMobile && t("employees.reset", "Reset")}
            </button>
          )}
        </div>

        {/* Active Filter Tags */}
        {activeFilterTags.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              padding: "0 4px",
            }}
          >
            {activeFilterTags.map((tag) => (
              <div
                key={tag.key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "linear-gradient(135deg, rgba(139,105,20,0.08) 0%, rgba(180,135,25,0.08) 100%)",
                  border: "1px solid rgba(139,105,20,0.25)",
                  borderRadius: "8px",
                  padding: "6px 10px 6px 12px",
                  fontSize: "12px",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                  {tag.label}:
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {tag.value}
                </span>
                <button
                  onClick={() => removeFilter(tag.key)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    borderRadius: "4px",
                    transition: "background 0.15s, color 0.15s",
                  }}
                  title={t("employees.removeFilter", "Remove filter")}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: "16px" }}>
          <Alert variant="danger" title={t("common.error")}>
            {error}
          </Alert>
        </div>
      )}

      <Table<Employee>
        columns={columns}
        data={employees}
        loading={loading}
        emptyText={t('employees.noEmployees')}
        headerBackground="var(--primary)"
        headerTextColor="#ffffff"
        headerBorderBottom="none"
      />

      <Pagination
        page={page}
        pages={pages}
        total={total}
        limit={limit}
        onPageChange={(p) => updateParam("page", String(p))}
      />

      {isAdminOrHr && (
        <EmployeeForm
          key={`new-employee-form-${newFormInstance}`}
          open={showNewForm}
          onCreated={() => {
            setListReloadTick((prev) => prev + 1);
          }}
          onSuccess={() => {
            setShowNewForm(false);
            setNewFormInstance((prev) => prev + 1);
            setListReloadTick((prev) => prev + 1);
            showToast(t("employees.createdSuccess"), "success");
            updateParam("page", "1");
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {isAdminOrHr && (
        <BulkImportModal
          open={showBulkImport}
          onClose={() => setShowBulkImport(false)}
          onComplete={() => setListReloadTick((prev) => prev + 1)}
        />
      )}

      {/* Export Confirmation Modal */}
      <ExportConfirmModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        onConfirm={handleExportConfirm}
        employeeCount={total}
        estimatedSize={estimatedFileSize}
        exporting={exporting}
      />

      {/* Filter Modal */}
      <FilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApply={handleApplyFilters}
        initialFilters={{
          company_ids: companyIds,
          store_ids: storeIds,
          department: department,
          status: status,
          role: role,
        }}
        companyOptions={companyOptions}
        storeOptions={storeOptions}
        statusOptions={statusOptions}
        roleOptions={roleOptions}
        showCompanyFilter={(isAdminOrHr || isSuperAdmin) && companies.length > 0}
      />

      {/* Mobile Menu Sidebar */}
      {isMobile && isAdminOrHr && createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1400,
              background: "rgba(13,33,55,0.55)",
              backdropFilter: "blur(3px)",
              opacity: mobileMenuOpen ? 1 : 0,
              pointerEvents: mobileMenuOpen ? "auto" : "none",
              transition: "opacity 0.3s ease",
            }}
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Sidebar */}
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(320px, 85vw)",
              background: "var(--surface)",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              transform: mobileMenuOpen ? "translateX(0)" : "translateX(100%)",
              transition: "transform 0.3s ease",
              zIndex: 1401,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                background: "var(--primary)",
                color: "#fff",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.2,
                    opacity: 0.7,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  {t("employees.title", "Employees")}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "1.1rem",
                  }}
                >
                  {t("common.options", "Options")}
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  color: "#fff",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Menu Items */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 0",
              }}
            >
              {/* New Employee */}
              <button
                onClick={() => {
                  setShowNewForm(true);
                  setMobileMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 20px",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                  borderBottom: "1px solid var(--border)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--background)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background:
                      "linear-gradient(135deg, var(--primary), var(--accent))",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Plus size={16} strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}
                  >
                    {t("employees.newEmployee", "New Employee")}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 2,
                      lineHeight: 1.3,
                    }}
                  >
                    {t("employees.newEmployeeDesc", "Add a new employee")}
                  </div>
                </div>
              </button>

              {/* Export Employees */}
              <button
                onClick={() => {
                  handleExportClick();
                  setMobileMenuOpen(false);
                }}
                disabled={exporting}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 20px",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: exporting ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                  borderBottom: "1px solid var(--border)",
                  opacity: exporting ? 0.5 : 1,
                }}
                onMouseEnter={(e) =>
                  !exporting &&
                  (e.currentTarget.style.background = "var(--background)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(13,124,102,0.12)",
                    color: "var(--primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Download size={16} strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}
                  >
                    {t("employees.exportBtn", "Export Employees")}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 2,
                      lineHeight: 1.3,
                    }}
                  >
                    {t(
                      "employees.exportDesc",
                      "Download employee data to Excel"
                    )}
                  </div>
                </div>
              </button>

              {/* Import Employees */}
              <button
                onClick={() => {
                  setShowBulkImport(true);
                  setMobileMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 20px",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                  borderBottom: "1px solid var(--border)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--background)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(139,105,20,0.12)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Upload size={16} strokeWidth={2.5} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}
                  >
                    {t("employees.bulkImportBtn", "Import Employees")}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 2,
                      lineHeight: 1.3,
                    }}
                  >
                    {t(
                      "employees.importDesc",
                      "Upload employee data from Excel"
                    )}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export default EmployeeList;
