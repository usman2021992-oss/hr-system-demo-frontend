import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Database,
  Eye,
  Link2,
  CalendarRange,
  RefreshCcw,
  Server,
  Store,
  Trash2,
  Unlink,
  Users,
  WandSparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '../../components/ui/DatePicker';
import { Input } from '../../components/ui/Input';
import {
  ExternalAffluencePreviewResponse,
  ExternalDbOverview,
  ExternalDepositoRow,
  ExternalIngressiResponse,
  ExternalStoreMapping,
  ExternalTableDataResponse,
  ExternalTableCatalogItem,
  getExternalAffluencePreview,
  getExternalCatalog,
  getExternalIngressi,
  getExternalOverview,
  getExternalTableData,
  listExternalDepositi,
  listExternalMappings,
  upsertExternalMapping,
  deleteExternalMapping,
} from '../../api/externalAffluence';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { getCompanies } from '../../api/companies';
import { getStores } from '../../api/stores';
import { getAvatarUrl, getCompanyLogoUrl, getStoreLogoUrl } from '../../api/client';
import { Company, Store as LocalStore } from '../../types';

const WRITER_ROLES = ['admin', 'hr', 'area_manager'] as const;
type WriterRole = typeof WRITER_ROLES[number];

type PanelKey = 'companies' | 'stores' | 'employees' | 'internalDb' | 'externalDb';

const DICTIONARY_TRANSLATIONS_STORAGE_KEY = 'external_affluence_dictionary_en_fields_v2';

type DictionaryTableModel = {
  tableName: string;
  englishName: string;
  used: boolean;
  rowEstimate: number | null;
  totalSizePretty: string | null;
  fieldCount: number;
  columns: Array<{
    itField: string;
    enField: string;
    type: string;
    description: string;
  }>;
};

type DictionaryViewByTable = Record<string, 'fields' | 'data'>;

type LocalDictionaryPanelProps = {
  tx: Record<string, string>;
  sectionStyle: React.CSSProperties;
  panelShellStyle: React.CSSProperties;
  tinyCell: React.CSSProperties;
  dictionaryTables: DictionaryTableModel[];
  openDictionaryTables: string[];
  toggleDictionaryTable: (tableName: string) => void;
  dictionaryViewByTable: DictionaryViewByTable;
  setDictionaryTableView: (tableName: string, view: 'fields' | 'data') => void;
  dictionaryDataByTable: Record<string, ExternalTableDataResponse>;
  dictionaryDataLoadingByTable: Record<string, boolean>;
  dictionaryDataErrorByTable: Record<string, string | null>;
  getDisplayFieldLabel: (tableName: string, fieldName: string) => string;
  formatDynamicCell: (value: string | number | boolean | null | undefined, columnName: string) => string;
};

const TABLE_NAME_TRANSLATIONS: Record<string, string> = {
  depositi: 'Stores Registry',
  ingressi: 'Daily Foot Traffic',
  artmaster: 'Products Master',
  chiusure: 'Store Closures / Cash Closings',
  // Best-effort names for other tables commonly found in an Italian fashion-retail
  // ERP. Only used for display and only when the table actually exists, so an
  // unused entry is harmless. Refine against the live schema when confirmed.
  articoli: 'Products',
  vendite: 'Sales',
  venduto: 'Sales (Sold Items)',
  scontrini: 'Receipts',
  documenti: 'Sales Documents',
  righe: 'Document Lines',
  movimenti: 'Stock Movements',
  giacenze: 'Inventory / Stock',
  magazzino: 'Warehouse Stock',
  inventario: 'Inventory Counts',
  clienti: 'Customers',
  fornitori: 'Suppliers',
  ordini: 'Orders',
  listini: 'Price Lists',
  taglie: 'Sizes',
  colori: 'Colours',
  varianti: 'Product Variants',
  famiglie: 'Merchandise Families',
  reparti: 'Departments',
  operatori: 'Operators / Salespeople',
  venditori: 'Salespeople',
  incassi: 'Takings / Payments',
  pagamenti: 'Payments',
  promozioni: 'Promotions',
  resi: 'Returns',
  fidelity: 'Loyalty Cards',
  tessere: 'Loyalty Cards',
};

const TABLE_FIELD_TRANSLATIONS: Record<string, Record<string, string>> = {
  depositi: {
    coddep: 'external_store_code',
    deposito: 'store_name',
    user: 'source_user',
    listino: 'price_list',
    azienda: 'company_name',
    indirizzo: 'store_address',
    cap: 'postal_code',
    citta: 'city',
    provincia: 'province',
    regione: 'region',
    nazione: 'country',
    telefono: 'phone',
    email: 'email',
    gruppo: 'group_name',
    tipo: 'store_type',
    zona: 'area',
    attivo: 'is_active',
    data_apertura: 'opening_date',
    data_chiusura: 'closing_date',
    orario_apertura: 'opening_time',
    orario_chiusura: 'closing_time',
    codice_fiscale: 'tax_code',
    piva: 'vat_number',
  },
  ingressi: {
    id: 'row_id',
    deposito: 'external_store_code',
    data: 'date',
    valore: 'visitors',
    ingressi: 'visitors',
    uscite: 'exits',
    utente: 'source_user',
    user: 'source_user',
    ora: 'hour',
    fascia: 'time_slot',
    giorno: 'day',
    settimana: 'iso_week',
    mese: 'month',
    anno: 'year',
    promozione: 'promotion_flag',
    evento: 'event_name',
    note: 'notes',
    totale: 'total',
  },
  artmaster: {
    codart: 'article_code',
    descart: 'article_description',
    articolo: 'article_name',
    desart: 'article_description',
    descrizione: 'article_description',
    famiglia: 'family',
    sottofamiglia: 'subfamily',
    reparto: 'department',
    sottoreparto: 'subdepartment',
    linea: 'line',
    marca: 'brand',
    stagione: 'season',
    colore: 'color',
    taglia: 'size',
    fornitore: 'supplier',
    prezzo: 'price',
    prezzo_lordo: 'gross_price',
    prezzo_netto: 'net_price',
    iva: 'vat_rate',
    barcode: 'barcode',
    ean: 'ean',
    um: 'unit_of_measure',
    categoria: 'category',
    sottocategoria: 'subcategory',
    modello: 'model',
    model: 'model',
    target: 'target',
    gender: 'gender',
    attivo: 'is_active',
    note: 'notes',
  },
  chiusure: {
    id: 'row_id',
    data: 'date',
    deposito: 'external_store_code',
    coddep: 'external_store_code',
    tipopagamento: 'payment_type',
    importo: 'amount',
    user: 'source_user',
    chiuso: 'is_closed',
    chiusura: 'closure_flag',
    causale: 'reason',
    motivo: 'reason',
    tipo: 'closure_type',
    stato: 'status',
    note: 'notes',
    ora_apertura: 'opening_time',
    ora_chiusura: 'closing_time',
    apertura: 'opening_time',
    chiusura_da: 'closure_start',
    chiusura_a: 'closure_end',
    giorno: 'day',
    settimana: 'iso_week',
    mese: 'month',
    anno: 'year',
    festivo: 'holiday_flag',
    straordinario: 'exceptional_closure',
  },
};

const WHOLE_FIELD_TRANSLATIONS: Record<string, string> = {
  coddep: 'external_store_code',
  deposito: 'store_name',
  azienda: 'company_name',
  valore: 'visitors',
  data: 'date',
  utente: 'source_user',
  user: 'source_user',
  codart: 'article_code',
  descart: 'article_description',
  desart: 'article_description',
  listino: 'price_list',
  codfor: 'supplier_code',
  colli: 'packages',
  costo: 'cost',
  codsam: 'sample_code',
  tipopagamento: 'payment_type',
  importo: 'amount',
};

const FIELD_TOKEN_TRANSLATIONS: Record<string, string> = {
  id: 'id',
  codice: 'code',
  cod: 'code',
  coddep: 'external_store_code',
  codart: 'article_code',
  articolo: 'article',
  nome: 'name',
  cognome: 'surname',
  azienda: 'company',
  gruppo: 'group',
  negozio: 'store',
  deposito: 'store',
  indirizzo: 'address',
  cap: 'postal_code',
  citta: 'city',
  provincia: 'province',
  regione: 'region',
  nazione: 'country',
  telefono: 'phone',
  data: 'date',
  ora: 'time',
  orario: 'time',
  inizio: 'start',
  fine: 'end',
  ingresso: 'entry',
  ingressi: 'visitors',
  uscita: 'exit',
  uscite: 'exits',
  valore: 'value',
  stato: 'status',
  tipo: 'type',
  descrizione: 'description',
  des: 'description',
  note: 'notes',
  giorno: 'day',
  settimana: 'week',
  mese: 'month',
  anno: 'year',
  quantita: 'quantity',
  numero: 'number',
  tot: 'total',
  totale: 'total',
  utente: 'user',
  user: 'user',
  attivo: 'active',
  chiuso: 'closed',
  chiusura: 'closure',
  apertura: 'opening',
  causale: 'reason',
  motivo: 'reason',
  reparto: 'department',
  sotto: 'sub',
  famiglia: 'family',
  marca: 'brand',
  stagione: 'season',
  colore: 'color',
  taglia: 'size',
  fornitore: 'supplier',
  prezzo: 'price',
  listino: 'price_list',
  codfor: 'supplier_code',
  colli: 'packages',
  costo: 'cost',
  codsam: 'sample_code',
  pagamento: 'payment',
  importo: 'amount',
  netto: 'net',
  lordo: 'gross',
  iva: 'vat',
  ean: 'ean',
  barcode: 'barcode',
  festivo: 'holiday',
  straordinario: 'exceptional',
  vendita: 'sale',
  vendite: 'sales',
  venduto: 'sold',
  cliente: 'customer',
  clienti: 'customers',
  operatore: 'operator',
  venditore: 'salesperson',
  cassa: 'register',
  cassiere: 'cashier',
  incasso: 'takings',
  scontrino: 'receipt',
  documento: 'document',
  riga: 'line',
  righe: 'lines',
  sconto: 'discount',
  giacenza: 'stock',
  magazzino: 'warehouse',
  scorta: 'stock',
  collezione: 'collection',
  variante: 'variant',
  modello: 'model',
  reso: 'return',
  resi: 'returns',
  matricola: 'serial_number',
  ordine: 'order',
  qta: 'quantity',
  qty: 'quantity',
};

function loadDictionaryTranslations(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DICTIONARY_TRANSLATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistDictionaryTranslations(map: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DICTIONARY_TRANSLATIONS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore localStorage failures.
  }
}

function autoTranslateFieldToEnglish(rawField: string, tableName?: string): string {
  const lowered = rawField.trim().toLowerCase();
  if (!lowered) return rawField;

  const loweredTable = (tableName ?? '').trim().toLowerCase();
  const tableMap = TABLE_FIELD_TRANSLATIONS[loweredTable];
  if (tableMap?.[lowered]) {
    return tableMap[lowered];
  }

  if (WHOLE_FIELD_TRANSLATIONS[lowered]) {
    return WHOLE_FIELD_TRANSLATIONS[lowered];
  }

  const normalized = lowered
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const tokens = normalized.split('_').filter(Boolean);
  if (tokens.length === 0) return lowered;

  return tokens
    .map((token) => FIELD_TOKEN_TRANSLATIONS[token] ?? token)
    .join('_');
}

// ---------------------------------------------------------------------------
// Field descriptions (local dictionary reference, English for the reviewer).
// The backend catalog only carries descriptions for `depositi` and `ingressi`,
// so every other table used to render "-" in the dictionary. These curated maps
// plus the humanised-label fallback in `describeExternalField` guarantee that
// every discovered column shows a meaningful English description.
// NOTE: `chiusure` semantics (daily cash-closing vs. store-closed days) should be
// confirmed against live rows — see the field notes below.
// ---------------------------------------------------------------------------
const TABLE_FIELD_DESCRIPTIONS: Record<string, Record<string, string>> = {
  depositi: {
    coddep: 'Unique external store code; primary key used to join foot-traffic, sales and closure rows.',
    deposito: 'Store (point of sale) name as recorded in the external ERP.',
    azienda: 'Owning company / brand label in the external system.',
    listino: 'Default price list assigned to the store.',
    indirizzo: 'Street address of the store.',
    cap: 'Postal (CAP) code of the store.',
    citta: 'City where the store is located.',
    provincia: 'Italian province (sigla) of the store.',
    regione: 'Italian region of the store.',
    nazione: 'Country of the store.',
    telefono: 'Store contact phone number.',
    email: 'Store contact email address.',
    gruppo: 'Store group / cluster the point of sale belongs to.',
    tipo: 'Store type (e.g. flagship, outlet, franchising).',
    zona: 'Commercial area / sales zone of the store.',
    attivo: 'Whether the store is currently active in the ERP.',
    data_apertura: 'Date the store was opened.',
    data_chiusura: 'Date the store was closed (if dismissed).',
    orario_apertura: 'Default daily opening time.',
    orario_chiusura: 'Default daily closing time.',
    codice_fiscale: 'Italian tax code (codice fiscale) of the store entity.',
    piva: 'VAT registration number (Partita IVA) of the store entity.',
    user: 'ERP user / source that created or last edited the store record.',
  },
  ingressi: {
    id: 'Row identifier for the traffic record.',
    deposito: 'External store code (joins to DEPOSITI.coddep).',
    data: 'Calendar date of the foot-traffic reading.',
    valore: 'People-counter value: number of visitors for the store on that date.',
    ingressi: 'Number of entries (visitors) recorded by the people counter.',
    uscite: 'Number of exits recorded by the people counter.',
    ora: 'Hour of the reading (for intra-day counters).',
    fascia: 'Time band / slot of the reading (e.g. 12:00-18:00).',
    giorno: 'Day-of-week of the record.',
    settimana: 'ISO week number of the record.',
    mese: 'Month of the record.',
    anno: 'Year of the record.',
    promozione: 'Flags whether a promotion was running on that date.',
    evento: 'Name of any event affecting traffic that day.',
    note: 'Free-text notes on the traffic record.',
    totale: 'Total visitors aggregated for the period.',
    user: 'ERP user / source that produced the record.',
    utente: 'ERP user / source that produced the record.',
  },
  artmaster: {
    codart: 'Unique article (product) code.',
    descart: 'Product description / commercial name.',
    articolo: 'Product / article name.',
    desart: 'Product description / commercial name.',
    descrizione: 'Product description.',
    famiglia: 'Merchandise family classification.',
    sottofamiglia: 'Merchandise sub-family classification.',
    reparto: 'Department the product belongs to.',
    sottoreparto: 'Sub-department the product belongs to.',
    linea: 'Product line / collection.',
    marca: 'Brand of the product.',
    stagione: 'Fashion season (e.g. SS/AW) the product belongs to.',
    colore: 'Colour of the article variant.',
    taglia: 'Size of the article variant.',
    fornitore: 'Supplier of the product.',
    codfor: 'Supplier code (joins to the supplier master).',
    prezzo: 'Retail selling price.',
    prezzo_lordo: 'Gross price (VAT included).',
    prezzo_netto: 'Net price (VAT excluded).',
    costo: 'Purchase / landed cost of the article.',
    listino: 'Price list the article belongs to.',
    iva: 'VAT rate applied to the product.',
    barcode: 'Barcode used for scanning at POS.',
    ean: 'EAN code of the article.',
    um: 'Unit of measure.',
    colli: 'Number of packages / cartons per unit.',
    codsam: 'Sample code linked to the article.',
    categoria: 'Product category.',
    sottocategoria: 'Product sub-category.',
    modello: 'Model / style code of the article.',
    target: 'Commercial target segment of the product.',
    gender: 'Target gender of the product (man/woman/unisex).',
    attivo: 'Whether the article is active / sellable.',
    note: 'Free-text notes on the article.',
    user: 'ERP user / source that created the article.',
  },
  chiusure: {
    id: 'Row identifier for the closure record.',
    data: 'Business date of the closure.',
    deposito: 'External store code (joins to DEPOSITI.coddep).',
    coddep: 'External store code (joins to DEPOSITI.coddep).',
    tipopagamento: 'Payment method for the amount (cash, card, voucher, …).',
    importo: 'Monetary amount for the closure line (e.g. daily takings by payment type).',
    chiuso: 'Whether the till / store was closed.',
    chiusura: 'Closure flag / status of the till or store.',
    causale: 'Accounting / operational reason code for the closure.',
    motivo: 'Reason for the closure or adjustment.',
    tipo: 'Type of closure (cash closing, holiday, exceptional, …).',
    stato: 'Status of the closure record.',
    ora_apertura: 'Opening time on the closure date.',
    ora_chiusura: 'Closing time on the closure date.',
    apertura: 'Opening reference for the closure.',
    chiusura_da: 'Start of the closed period.',
    chiusura_a: 'End of the closed period.',
    giorno: 'Day-of-week of the record.',
    settimana: 'ISO week number of the record.',
    mese: 'Month of the record.',
    anno: 'Year of the record.',
    festivo: 'Marks whether the date is a public holiday.',
    straordinario: 'Marks an exceptional (non-standard) closure.',
    note: 'Free-text notes on the closure.',
    user: 'ERP user / source that produced the record.',
  },
};

// Descriptions that apply regardless of the table they appear in.
const WHOLE_FIELD_DESCRIPTIONS: Record<string, string> = {
  id: 'Primary-key row identifier.',
  data: 'Date value of the record.',
  user: 'ERP user / source that produced the record.',
  utente: 'ERP user / source that produced the record.',
  note: 'Free-text notes.',
  attivo: 'Active / enabled flag.',
  stato: 'Status of the record.',
  tipo: 'Type / classification of the record.',
  importo: 'Monetary amount.',
  prezzo: 'Price value.',
  costo: 'Cost value.',
  iva: 'VAT rate or amount.',
  quantita: 'Quantity.',
  totale: 'Total value.',
  sconto: 'Discount applied.',
  barcode: 'Barcode used for scanning.',
  ean: 'EAN code.',
};

// Turn an English snake_case label into a short readable sentence, so unknown
// columns still get a sensible description instead of a bare "-".
function humanizeEnglishLabel(label: string): string {
  const words = (label ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return '';
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

function describeExternalField(tableName: string, fieldName: string, englishLabel: string): string {
  const table = (tableName ?? '').trim().toLowerCase();
  const lowered = (fieldName ?? '').trim().toLowerCase();
  const normalized = normalizeFieldTranslationKey(fieldName);

  const tableMap = TABLE_FIELD_DESCRIPTIONS[table];
  if (tableMap?.[lowered]) return tableMap[lowered];
  if (tableMap?.[normalized]) return tableMap[normalized];

  if (WHOLE_FIELD_DESCRIPTIONS[lowered]) return WHOLE_FIELD_DESCRIPTIONS[lowered];
  if (WHOLE_FIELD_DESCRIPTIONS[normalized]) return WHOLE_FIELD_DESCRIPTIONS[normalized];

  const humanized = humanizeEnglishLabel(englishLabel || autoTranslateFieldToEnglish(fieldName, tableName));
  return humanized || '—';
}

const EN = {
  title: 'External Database Integration',
  subtitle: 'Connect local stores to external DEPOSITI and INGRESSI with a clear, auditable flow.',
  refresh: 'Refresh',
  loading: 'Loading integration data...',

  cardsTitle: 'Integration Snapshot',
  companies: 'Companies',
  stores: 'Stores',
  employees: 'Employees',
  internalDb: 'Internal Database',
  externalDb: 'External Database',
  connecting: 'Connecting...',
  connected: 'Connected',
  failed: 'Failed',
  disconnected: 'Disconnected',
  configured: 'Configured',
  notConfigured: 'Not configured',
  checkedAt: 'Checked at',
  engine: 'Engine',
  dbName: 'Database',
  tableCount: 'Tables',

  companiesPanelTitle: 'Companies In Scope',
  storesPanelTitle: 'Stores In Scope',
  employeesPanelTitle: 'Employees In Scope',
  internalDbPanelTitle: 'PostgreSQL Tables Overview',
  externalDbPanelTitle: 'MySQL Tables Overview',
  removePanel: 'Remove table',

  colCompany: 'Company',
  colStore: 'Store',
  colCode: 'Code',
  colEmployees: 'Employees',
  colEmployee: 'Employee',
  colEmail: 'Email',
  colStatus: 'Status',
  colActive: 'Active',
  colTable: 'Table',
  colRows: 'Rows',
  colSize: 'Size',
  colFields: 'Fields',
  colFieldList: 'Field names',

  noCompanies: 'No companies available in your scope.',
  noStores: 'No stores available in your scope.',
  noEmployees: 'No employees available in your scope.',
  noTables: 'No table metadata available.',
  metadataHiddenLive: 'Table metadata is intentionally hidden in live mode.',

  step1Title: '1) Local Store and External Store Configuration',
  step1Hint: 'Select local company and store, search external stores, then save integration to local DB.',
  selectCompany: 'Local company',
  selectStore: 'Local store',
  companyPlaceholder: 'Select company',
  storePlaceholder: 'Select store',
  companyDetails: 'Company details',
  storeDetails: 'Store details',
  companyGroup: 'Group',
  owner: 'Owner',
  founded: 'Founded',
  storesOwned: 'Stores owned',
  searchExternal: 'Search external stores',
  searchPlaceholder: 'Search by external code, store, or company',
  externalCode: 'External code',
  externalStore: 'External store',
  externalCompany: 'External company',
  availableRange: 'Available data range',
  mappedLocalStore: 'Mapped local store',
  localStoreId: 'Local store ID',
  integrationBy: 'Integrated by',
  action: 'Action',
  storeIntegrationAction: 'Store Integration',
  saving: 'Saving...',
  noExternalStores: 'No external stores found.',
  selectStoreFirst: 'Select local company and local store first.',

  savedIntegrationsTitle: 'Saved Integration Records (local table: external_store_mappings)',
  savedIntegrationsHint: 'Saved records avoid repeated manual integrations.',
  updatedAt: 'Updated at',
  remove: 'Remove',
  noMappings: 'No saved integrations in your scope.',
  mapSavedToast: 'Integration saved to local database.',
  mapDeletedToast: 'Integration removed from local database.',

  step2Title: '2) External Traffic Query (INGRESSI)',
  step2Hint: 'Use platform date pickers and load visitors traffic from mapped external store.',
  fromDate: 'From date',
  toDate: 'To date',
  selectedStore: 'Selected local store',
  noStore: 'No store selected',
  loadIngressi: 'Load INGRESSI',
  loadingTraffic: 'Loading...',
  totalDays: 'Total days',
  totalVisitors: 'Total visitors',
  selectedMonth: 'Selected month',
  monthVisitors: 'Month visitors',
  rangeLabel: 'Range',
  avgDay: 'Average/day',
  minMax: 'Min - Max',
  date: 'Date',
  visitors: 'Visitors',
  trafficRawFields: 'Raw fields from INGRESSI',
  noTrafficRows: 'No traffic rows found for selected range.',

  step3Title: '3) Affluence Preview and Recommendation',
  step3Hint: 'Preview recommended staffing with traffic formula and current scheduled shifts baseline.',
  generatePreview: 'Generate Preview',
  generating: 'Generating...',
  overwrite: 'Replace existing default local affluence on sync',
  applyToLocal: 'Apply To Local Affluence',
  syncing: 'Syncing...',
  syncToast: 'Affluence data synced to local database.',
  notMappedWarning: 'This store is not mapped yet. Complete step 1 first.',

  formulaTitle: 'Recommendation logic',
  formulaLine1: 'Estimated visitors per slot = weekday average visitors * slot weight.',
  formulaLine2Prefix: 'Recommended staff = ceil(estimated visitors /',
  formulaLine2Suffix: 'visitors per staff).',
  formulaLine3: 'Current scheduled staff is calculated from confirmed/scheduled shifts in selected date range.',
  formulaLine4: 'Gap compares recommended staff with planned shifts to mark under, balanced, or over coverage.',

  day: 'Day',
  timeSlot: 'Time slot',
  level: 'Level',
  estimatedVisitors: 'Estimated visitors',
  recommendedStaff: 'Recommended',
  scheduledStaff: 'Scheduled',
  gap: 'Gap',
  currentDefault: 'Current default',
  noRecommendations: 'No recommendations available for selected range.',

  low: 'Low',
  medium: 'Medium',
  high: 'High',
  under: 'Under-staffed',
  balanced: 'Balanced',
  over: 'Over-staffed',

  dictionaryTitle: '4) External Fields Dictionary (IT + EN)',
  dictionaryHint: 'Original source fields and English labels are shown side by side for quick understanding.',
  usedTag: 'Used',
  itField: 'Italian source',
  enField: 'English label',
  fieldType: 'Type',
  fieldDescription: 'Description',
  fieldsView: 'Fields',
  dataView: 'Data',
  loadingTableData: 'Loading table data...',
  noTableData: 'No table data available for this table.',
  tableDataLoadError: 'Unable to load table data.',

  stepError: 'Step error',
};

const IT = {
  title: 'Integrazione Database Esterno',
  subtitle: 'Collega i negozi locali a DEPOSITI e INGRESSI con un flusso chiaro e tracciabile.',
  refresh: 'Aggiorna',
  loading: 'Caricamento dati integrazione...',

  cardsTitle: 'Riepilogo Integrazione',
  companies: 'Aziende',
  stores: 'Negozi',
  employees: 'Dipendenti',
  internalDb: 'Database Interno',
  externalDb: 'Database Esterno',
  connecting: 'Connessione in corso...',
  connected: 'Connesso',
  failed: 'Fallita',
  disconnected: 'Disconnesso',
  configured: 'Configurato',
  notConfigured: 'Non configurato',
  checkedAt: 'Verificato alle',
  engine: 'Motore',
  dbName: 'Database',
  tableCount: 'Tabelle',

  companiesPanelTitle: 'Aziende Nel Perimetro',
  storesPanelTitle: 'Negozi Nel Perimetro',
  employeesPanelTitle: 'Dipendenti Nel Perimetro',
  internalDbPanelTitle: 'Panoramica Tabelle PostgreSQL',
  externalDbPanelTitle: 'Panoramica Tabelle MySQL',
  removePanel: 'Rimuovi tabella',

  colCompany: 'Azienda',
  colStore: 'Negozio',
  colCode: 'Codice',
  colEmployees: 'Dipendenti',
  colEmployee: 'Dipendente',
  colEmail: 'Email',
  colStatus: 'Stato',
  colActive: 'Attivo',
  colTable: 'Tabella',
  colRows: 'Righe',
  colSize: 'Dimensione',
  colFields: 'Campi',
  colFieldList: 'Nomi campi',

  noCompanies: 'Nessuna azienda disponibile nel tuo perimetro.',
  noStores: 'Nessun negozio disponibile nel tuo perimetro.',
  noEmployees: 'Nessun dipendente disponibile nel tuo perimetro.',
  noTables: 'Nessun metadato tabella disponibile.',
  metadataHiddenLive: 'I metadati delle tabelle sono nascosti intenzionalmente in ambiente live.',

  step1Title: '1) Configurazione Negozio Locale e Negozio Esterno',
  step1Hint: 'Seleziona azienda e negozio locale, cerca negozio esterno, poi salva integrazione nel DB locale.',
  selectCompany: 'Azienda locale',
  selectStore: 'Negozio locale',
  companyPlaceholder: 'Seleziona azienda',
  storePlaceholder: 'Seleziona negozio',
  companyDetails: 'Dettagli azienda',
  storeDetails: 'Dettagli negozio',
  companyGroup: 'Gruppo',
  owner: 'Proprietario',
  founded: 'Fondata il',
  storesOwned: 'Negozi gestiti',
  searchExternal: 'Cerca negozi esterni',
  searchPlaceholder: 'Cerca per codice esterno, negozio o azienda',
  externalCode: 'Codice esterno',
  externalStore: 'Negozio esterno',
  externalCompany: 'Azienda esterna',
  availableRange: 'Range dati disponibile',
  mappedLocalStore: 'Negozio locale collegato',
  localStoreId: 'ID negozio locale',
  integrationBy: 'Integrato da',
  action: 'Azione',
  storeIntegrationAction: 'Salva Integrazione',
  saving: 'Salvataggio...',
  noExternalStores: 'Nessun negozio esterno trovato.',
  selectStoreFirst: 'Seleziona prima azienda locale e negozio locale.',

  savedIntegrationsTitle: 'Record Integrazione Salvati (tabella locale: external_store_mappings)',
  savedIntegrationsHint: 'I record salvati evitano integrazioni manuali ripetute.',
  updatedAt: 'Aggiornato il',
  remove: 'Rimuovi',
  noMappings: 'Nessuna integrazione salvata nel tuo perimetro.',
  mapSavedToast: 'Integrazione salvata nel database locale.',
  mapDeletedToast: 'Integrazione rimossa dal database locale.',

  step2Title: '2) Query Traffico Esterno (INGRESSI)',
  step2Hint: 'Usa i date picker della piattaforma e carica il traffico visitatori dal negozio esterno collegato.',
  fromDate: 'Data da',
  toDate: 'Data a',
  selectedStore: 'Negozio locale selezionato',
  noStore: 'Nessun negozio selezionato',
  loadIngressi: 'Carica INGRESSI',
  loadingTraffic: 'Caricamento...',
  totalDays: 'Giorni totali',
  totalVisitors: 'Visitatori totali',
  selectedMonth: 'Mese selezionato',
  monthVisitors: 'Visitatori del mese',
  rangeLabel: 'Intervallo',
  avgDay: 'Media/giorno',
  minMax: 'Min - Max',
  date: 'Data',
  visitors: 'Visitatori',
  trafficRawFields: 'Campi grezzi da INGRESSI',
  noTrafficRows: 'Nessun record traffico nel periodo selezionato.',

  step3Title: '3) Anteprima Affluenza e Raccomandazioni',
  step3Hint: 'Anteprima del fabbisogno staff con formula traffico e baseline dei turni attuali.',
  generatePreview: 'Genera Anteprima',
  generating: 'Generazione...',
  overwrite: 'Sostituisci affluenza locale default esistente in sincronizzazione',
  applyToLocal: 'Applica Ad Affluenza Locale',
  syncing: 'Sincronizzazione...',
  syncToast: 'Dati affluenza sincronizzati nel database locale.',
  notMappedWarning: 'Questo negozio non e ancora collegato. Completa prima lo step 1.',

  formulaTitle: 'Logica raccomandazione',
  formulaLine1: 'Visitatori stimati per fascia = media visitatori del giorno * peso fascia.',
  formulaLine2Prefix: 'Staff consigliato = ceil(visitatori stimati /',
  formulaLine2Suffix: 'visitatori per addetto).',
  formulaLine3: 'Lo staff schedulato attuale e calcolato dai turni confermati/schedulati nel periodo selezionato.',
  formulaLine4: 'Il gap confronta staff consigliato e turni pianificati per evidenziare copertura sotto, bilanciata o sopra.',

  day: 'Giorno',
  timeSlot: 'Fascia oraria',
  level: 'Livello',
  estimatedVisitors: 'Visitatori stimati',
  recommendedStaff: 'Consigliato',
  scheduledStaff: 'Schedulato',
  gap: 'Scostamento',
  currentDefault: 'Default attuale',
  noRecommendations: 'Nessuna raccomandazione disponibile nel periodo selezionato.',

  low: 'Basso',
  medium: 'Medio',
  high: 'Alto',
  under: 'Sotto organico',
  balanced: 'Bilanciato',
  over: 'Sovra organico',

  dictionaryTitle: '4) Dizionario Campi Esterni (IT + EN)',
  dictionaryHint: 'Campi sorgente originali e etichette in inglese mostrati affiancati.',
  usedTag: 'Usata',
  itField: 'Sorgente italiana',
  enField: 'Etichetta inglese',
  fieldType: 'Tipo',
  fieldDescription: 'Descrizione',
  fieldsView: 'Campi',
  dataView: 'Dati',
  loadingTableData: 'Caricamento dati tabella...',
  noTableData: 'Nessun dato disponibile per questa tabella.',
  tableDataLoadError: 'Impossibile caricare i dati tabella.',

  stepError: 'Errore step',
};

function dateToInputValue(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseApiError(err: unknown): string {
  const anyErr = err as {
    response?: {
      data?: {
        error?: string;
        code?: string;
      };
    };
    message?: string;
  };

  return anyErr.response?.data?.error
    ?? anyErr.response?.data?.code
    ?? anyErr.message
    ?? 'Unknown error';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
function formatCompactDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '-';
  const normalized = String(value).trim();
  const dateOnlyMatch = normalized.match(/^\d{4}-\d{2}-\d{2}$/);
  const parsed = dateOnlyMatch
    ? new Date(`${normalized}T00:00:00`)
    : new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function normalizeDateCellToIso(value: string | number | boolean | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return null;

  const asString = String(value).trim();
  if (!asString) return null;

  const directMatch = asString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) return null;

  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const d = String(parsed.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDynamicCell(value: string | number | boolean | null | undefined, columnName: string): string {
  if (value == null || value === '') return '-';

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : '-';
  }

  const normalizedColumn = columnName.toLowerCase();
  if (normalizedColumn.includes('data') || normalizedColumn.includes('date')) {
    return formatDateOnly(value);
  }

  return String(value);
}

function formatOwnerDisplayName(companyProfile: Company | null | undefined): string {
  if (!companyProfile) return '-';
  const fullName = `${companyProfile.ownerName ?? ''} ${companyProfile.ownerSurname ?? ''}`.trim();
  if (!fullName || /^\d+$/.test(fullName)) return '-';
  return fullName;
}

function toMonthKey(dateValue: string): string {
  return dateValue.slice(0, 7);
}

function normalizeFieldTranslationKey(fieldName: string): string {
  return (fieldName ?? '')
    .trim()
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isLocalHostname(hostname: string): boolean {
  const host = (hostname ?? '').trim().toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  if (/^127(\.|$)/.test(host)) return true;
  return false;
}

function formatMonthKey(monthKey: string, isItalian: boolean): string {
  const [yy, mm] = monthKey.split('-').map((part) => parseInt(part, 10));
  if (!Number.isFinite(yy) || !Number.isFinite(mm)) return monthKey;
  const date = new Date(yy, (mm - 1), 1);
  return date.toLocaleDateString(isItalian ? 'it-IT' : 'en-GB', { month: 'long', year: 'numeric' });
}

function weekdayLabel(dayOfWeek: number, isItalian: boolean): string {
  const en: Record<number, string> = {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday',
  };
  const it: Record<number, string> = {
    1: 'Lunedi',
    2: 'Martedi',
    3: 'Mercoledi',
    4: 'Giovedi',
    5: 'Venerdi',
    6: 'Sabato',
    7: 'Domenica',
  };
  return (isItalian ? it : en)[dayOfWeek] ?? String(dayOfWeek);
}

const sectionStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-sm)',
  padding: 18,
  display: 'grid',
  gap: 12,
};

const panelShellStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--surface-warm)',
  overflow: 'hidden',
};

const tinyCell: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  verticalAlign: 'top',
};

type ConnectionBadgeStatus = 'connecting' | 'connected' | 'failed';

function StatusPill({
  status,
  connecting,
  connected,
  failed,
}: {
  status: ConnectionBadgeStatus;
  connecting: string;
  connected: string;
  failed: string;
}) {
  const palette = status === 'connected'
    ? {
      background: 'rgba(22,163,74,0.14)',
      color: '#166534',
      border: 'rgba(22,163,74,0.3)',
      label: connected,
    }
    : status === 'connecting'
      ? {
        background: 'rgba(245,158,11,0.16)',
        color: '#92400e',
        border: 'rgba(245,158,11,0.35)',
        label: connecting,
      }
      : {
        background: 'rgba(220,38,38,0.12)',
        color: '#991b1b',
        border: 'rgba(220,38,38,0.3)',
        label: failed,
      };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '3px 8px',
        fontSize: 11,
        fontWeight: 700,
        background: palette.background,
        color: palette.color,
        border: `1px solid ${palette.border}`,
      }}
    >
      {palette.label}
    </span>
  );
}

const ArrowIcon = ({ open }: { open: boolean }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ 
      transition: 'transform 0.2s ease', 
      transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      color: 'var(--text-muted)',
      flexShrink: 0
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default function ExternalAffluencePage() {
  const { i18n } = useTranslation();
  const { showToast } = useToast();
  const { targetCompanyId, user } = useAuth();

  const isItalian = i18n.language.startsWith('it');
  const tx = isItalian ? IT : EN;
  const canWrite = Boolean(user && WRITER_ROLES.includes(user.role as WriterRole));
  const tEn = useMemo(() => i18n.getFixedT('en'), [i18n]);
  const tIt = useMemo(() => i18n.getFixedT('it'), [i18n]);
  const isLocalRuntime = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      /\b192\.168\.\d+\.\d+\b/.test(window.location.hostname) ||
      /\b10\.\d+\.\d+\.\d+\b/.test(window.location.hostname)
    );
  }, []);

  const [step1Open, setStep1Open] = useState(false);
  const [step2Open, setStep2Open] = useState(false);
  const [step3Open, setStep3Open] = useState(false);

  const getLocaleFieldLabel = (
    tableName: string,
    fieldName: string,
    lang: 'en' | 'it',
  ): string | null => {
    const normalizedTable = (tableName ?? '').trim().toLowerCase();
    const normalizedField = normalizeFieldTranslationKey(fieldName);
    if (!normalizedTable || !normalizedField) return null;

    const key = `externalAffluenceFields.${normalizedTable}.${normalizedField}`;
    const translator = lang === 'en' ? tEn : tIt;
    const label = translator(key, { defaultValue: '' }).trim();
    return label || null;
  };

  const getDisplayFieldLabel = (tableName: string, fieldName: string): string => {
    const currentLang: 'en' | 'it' = isItalian ? 'it' : 'en';
    const localized = getLocaleFieldLabel(tableName, fieldName, currentLang);
    if (localized) return localized;

    if (!isItalian) {
      return autoTranslateFieldToEnglish(fieldName, tableName);
    }

    return fieldName;
  };

  const [dictionaryTranslations, setDictionaryTranslations] = useState<Record<string, string>>(() => loadDictionaryTranslations());
  const [openDictionaryTables, setOpenDictionaryTables] = useState<string[]>([]);
  const [dictionaryViewByTable, setDictionaryViewByTable] = useState<Record<string, 'fields' | 'data'>>({});
  const [dictionaryDataByTable, setDictionaryDataByTable] = useState<Record<string, ExternalTableDataResponse>>({});
  const [dictionaryDataLoadingByTable, setDictionaryDataLoadingByTable] = useState<Record<string, boolean>>({});
  const [dictionaryDataErrorByTable, setDictionaryDataErrorByTable] = useState<Record<string, string | null>>({});
  const [LocalDictionaryPanel, setLocalDictionaryPanel] = useState<React.ComponentType<LocalDictionaryPanelProps> | null>(null);

  const [overview, setOverview] = useState<ExternalDbOverview | null>(null);
  const [catalog, setCatalog] = useState<ExternalTableCatalogItem[]>([]);
  const [mappings, setMappings] = useState<ExternalStoreMapping[]>([]);
  const [depositiRows, setDepositiRows] = useState<ExternalDepositoRow[]>([]);
  const [companyProfiles, setCompanyProfiles] = useState<Company[]>([]);
  const [storeProfiles, setStoreProfiles] = useState<LocalStore[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [externalSearch, setExternalSearch] = useState<string>('');
  const [companySearch, setCompanySearch] = useState<string>('');
  const [storeSearch, setStoreSearch] = useState<string>('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState<boolean>(false);
  const [storePickerOpen, setStorePickerOpen] = useState<boolean>(false);
  const companyPickerRef = useRef<HTMLDivElement | null>(null);
  const storePickerRef = useRef<HTMLDivElement | null>(null);

  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 56);
    return dateToInputValue(d);
  });
  const [toDate, setToDate] = useState<string>(() => dateToInputValue(new Date()));

  const [trafficData, setTrafficData] = useState<ExternalIngressiResponse | null>(null);
  const [selectedTrafficMonth, setSelectedTrafficMonth] = useState<string>('');
  const [previewData, setPreviewData] = useState<ExternalAffluencePreviewResponse | null>(null);

  const [hoveredCard, setHoveredCard] = useState<PanelKey | null>(null);
  const [openPanels, setOpenPanels] = useState<Record<PanelKey, boolean>>({
    companies: false,
    stores: false,
    employees: false,
    internalDb: false,
    externalDb: false,
  });

  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);
  const [loadingMappings, setLoadingMappings] = useState<boolean>(false);
  const [loadingDepositi, setLoadingDepositi] = useState<boolean>(false);
  const [loadingTraffic, setLoadingTraffic] = useState<boolean>(false);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [savingMappingCode, setSavingMappingCode] = useState<string | null>(null);

  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [step3Error, setStep3Error] = useState<string | null>(null);

  const selectedCompanyIdNum = useMemo(() => {
    const parsed = parseInt(selectedCompanyId, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [selectedCompanyId]);

  const companies = overview?.companies ?? [];
  const stores = overview?.stores ?? [];
  const employees = overview?.employees ?? [];

  const companyProfileById = useMemo(() => {
    const map = new Map<number, Company>();
    for (const company of companyProfiles) {
      map.set(company.id, company);
    }
    return map;
  }, [companyProfiles]);

  const storeProfileById = useMemo(() => {
    const map = new Map<number, LocalStore>();
    for (const store of storeProfiles) {
      map.set(store.id, store);
    }
    return map;
  }, [storeProfiles]);

  const employeeNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const employee of employees) {
      const fullName = `${employee.name ?? ''} ${employee.surname ?? ''}`.trim();
      if (fullName) {
        map.set(employee.id, fullName);
      }
    }
    return map;
  }, [employees]);

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((company) => {
      const profile = companyProfileById.get(company.id);
      const ownerLabel = (() => {
        const formatted = formatOwnerDisplayName(profile);
        if (formatted !== '-') return formatted;
        const fallbackName = profile?.ownerUserId ? employeeNameById.get(profile.ownerUserId) : null;
        return fallbackName ?? '';
      })().toLowerCase();
      const groupLabel = (profile?.groupName ?? '').toLowerCase();
      return company.name.toLowerCase().includes(q)
        || ownerLabel.includes(q)
        || groupLabel.includes(q);
    });
  }, [companies, companyProfileById, companySearch, employeeNameById]);

  const companyStores = useMemo(() => {
    if (!selectedCompanyIdNum) return [];
    return stores.filter((store) => store.companyId === selectedCompanyIdNum);
  }, [stores, selectedCompanyIdNum]);

  const filteredCompanyStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    if (!q) return companyStores;
    return companyStores.filter((store) => {
      const profile = storeProfileById.get(store.id);
      return store.name.toLowerCase().includes(q)
        || store.code.toLowerCase().includes(q)
        || (profile?.city ?? '').toLowerCase().includes(q)
        || (profile?.address ?? '').toLowerCase().includes(q)
        || store.companyName.toLowerCase().includes(q);
    });
  }, [companyStores, storeProfileById, storeSearch]);

  const selectedStore = useMemo(() => {
    const id = parseInt(selectedStoreId, 10);
    if (!Number.isFinite(id)) return null;
    return stores.find((store) => store.id === id) ?? null;
  }, [stores, selectedStoreId]);

  const selectedCompany = useMemo(() => {
    const id = parseInt(selectedCompanyId, 10);
    if (!Number.isFinite(id)) return null;
    return companies.find((company) => company.id === id) ?? null;
  }, [companies, selectedCompanyId]);

  const selectedCompanyProfile = selectedCompany ? (companyProfileById.get(selectedCompany.id) ?? null) : null;
  const selectedStoreProfile = selectedStore ? (storeProfileById.get(selectedStore.id) ?? null) : null;

  const mappingByStore = useMemo(() => {
    const map = new Map<number, ExternalStoreMapping>();
    for (const item of mappings) {
      map.set(item.localStoreId, item);
    }
    return map;
  }, [mappings]);

  const selectedStoreMapping = selectedStore ? (mappingByStore.get(selectedStore.id) ?? null) : null;

  const trafficMonths = useMemo(() => {
    if (!trafficData) return [] as string[];
    return Array.from(new Set(trafficData.rows.map((row) => toMonthKey(row.date)))).sort();
  }, [trafficData]);

  const trafficRowsBySelectedMonth = useMemo(() => {
    if (!trafficData || !selectedTrafficMonth) return [] as ExternalIngressiResponse['rows'];
    return trafficData.rows.filter((row) => toMonthKey(row.date) === selectedTrafficMonth);
  }, [trafficData, selectedTrafficMonth]);

  const maxTrafficRow = useMemo(() => {
    if (!trafficData || trafficData.rows.length === 0) return null;
    return trafficData.rows.reduce((best, row) => (row.visitors > best.visitors ? row : best), trafficData.rows[0]);
  }, [trafficData]);

  const minTrafficRow = useMemo(() => {
    if (!trafficData || trafficData.rows.length === 0) return null;
    return trafficData.rows.reduce((best, row) => (row.visitors < best.visitors ? row : best), trafficData.rows[0]);
  }, [trafficData]);

  const selectedMonthVisitors = useMemo(() => {
    return trafficRowsBySelectedMonth.reduce((acc, row) => acc + row.visitors, 0);
  }, [trafficRowsBySelectedMonth]);

  const selectedMonthAvgPerDay = useMemo(() => {
    if (trafficRowsBySelectedMonth.length === 0) return 0;
    return selectedMonthVisitors / trafficRowsBySelectedMonth.length;
  }, [trafficRowsBySelectedMonth, selectedMonthVisitors]);

  const trafficRowsVisible = useMemo(() => {
    if (!trafficData) return [] as ExternalIngressiResponse['rows'];
    if (!selectedTrafficMonth) return trafficData.rows;
    return trafficRowsBySelectedMonth;
  }, [trafficData, selectedTrafficMonth, trafficRowsBySelectedMonth]);

  const internalConnectionStatus = useMemo<ConnectionBadgeStatus>(() => {
    if (loadingOverview || !overview) return 'connecting';
    return overview.connections.internal.ok ? 'connected' : 'failed';
  }, [loadingOverview, overview]);

  const externalConnectionStatus = useMemo<ConnectionBadgeStatus>(() => {
    if (loadingOverview || !overview) return 'connecting';
    return overview.connections.external.ok ? 'connected' : 'failed';
  }, [loadingOverview, overview]);

  const trafficDetailDateColumn = useMemo(() => {
    if (!trafficData || trafficData.detailColumns.length === 0) return null;
    const preferred = ['data', 'date', 'giorno', 'dt'];
    const loweredMap = new Map<string, string>();
    for (const column of trafficData.detailColumns) {
      loweredMap.set(column.toLowerCase(), column);
    }
    for (const key of preferred) {
      const found = loweredMap.get(key);
      if (found) return found;
    }
    const fallback = trafficData.detailColumns.find((column) => {
      const lowered = column.toLowerCase();
      return lowered.includes('data') || lowered.includes('date');
    });
    return fallback ?? null;
  }, [trafficData]);

  const trafficDetailRowsVisible = useMemo(() => {
    if (!trafficData) return [] as ExternalIngressiResponse['detailRows'];
    if (!selectedTrafficMonth || !trafficDetailDateColumn) {
      return trafficData.detailRows;
    }

    return trafficData.detailRows.filter((row) => {
      const rawDate = row[trafficDetailDateColumn];
      const normalizedDate = normalizeDateCellToIso(rawDate);
      if (!normalizedDate) return true;
      return toMonthKey(normalizedDate) === selectedTrafficMonth;
    });
  }, [trafficData, selectedTrafficMonth, trafficDetailDateColumn]);

  const previewRowsSorted = useMemo(() => {
    if (!previewData) return [] as ExternalAffluencePreviewResponse['recommendations'];
    return [...previewData.recommendations].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.timeSlot.localeCompare(b.timeSlot);
    });
  }, [previewData]);

  const previewDayRowSpans = useMemo(() => {
    const spans = new Map<number, number>();

    let idx = 0;
    while (idx < previewRowsSorted.length) {
      const day = previewRowsSorted[idx].dayOfWeek;
      let end = idx + 1;
      while (end < previewRowsSorted.length && previewRowsSorted[end].dayOfWeek === day) {
        end += 1;
      }
      spans.set(idx, end - idx);
      idx = end;
    }

    return spans;
  }, [previewRowsSorted]);

  const dictionaryTables = useMemo(() => {
    const catalogByTable = new Map<string, ExternalTableCatalogItem>();
    for (const table of catalog) {
      catalogByTable.set(table.table.toLowerCase(), table);
    }

    const usedNames = new Set(catalog.map((table) => table.table.toLowerCase()));
    const baseTables: Array<{
      tableName: string;
      englishName: string;
      used: boolean;
      rowEstimate: number | null;
      totalSizePretty: string | null;
      fieldCount: number;
      columns: Array<{
        itField: string;
        enField: string;
        type: string;
        description: string;
      }>;
    }> = (overview?.externalTableDetails ?? []).map((table) => {
      const loweredTableName = table.tableName.toLowerCase();
      const match = catalogByTable.get(loweredTableName);
      const tableFieldTranslations = TABLE_FIELD_TRANSLATIONS[loweredTableName];
      const matchFieldMap = new Map((match?.columns ?? []).map((col) => [col.field.toLowerCase(), col]));

      return {
        tableName: table.tableName,
        englishName: match?.englishName ?? TABLE_NAME_TRANSLATIONS[loweredTableName] ?? table.tableName,
        used: usedNames.has(loweredTableName),
        rowEstimate: table.rowEstimate,
        totalSizePretty: table.totalSizePretty,
        fieldCount: table.columns.length,
        columns: table.columns.map((column) => {
          const loweredColumn = column.columnName.toLowerCase();
          const normalizedColumn = normalizeFieldTranslationKey(column.columnName);
          const known = matchFieldMap.get(loweredColumn);
          const translationKey = `${table.tableName.toLowerCase()}.${normalizedColumn}`;
          const localeEnField = getLocaleFieldLabel(table.tableName, column.columnName, 'en');
          const forcedEnField = tableFieldTranslations?.[loweredColumn] ?? tableFieldTranslations?.[normalizedColumn];
          const fallbackEnField = forcedEnField
            ?? localeEnField
            ?? dictionaryTranslations[translationKey]
            ?? autoTranslateFieldToEnglish(column.columnName, table.tableName);
          const enField = known?.englishLabel ?? fallbackEnField;
          return {
            itField: column.columnName,
            enField,
            type: column.dataType,
            description: known?.description ?? describeExternalField(table.tableName, column.columnName, enField),
          };
        }),
      };
    });

    const existingNames = new Set(baseTables.map((table) => table.tableName.toLowerCase()));
    for (const table of catalog) {
      if (existingNames.has(table.table.toLowerCase())) continue;
      baseTables.push({
        tableName: table.table,
        englishName: table.englishName,
        used: true,
        rowEstimate: null,
        totalSizePretty: '-',
        fieldCount: table.columns.length,
        columns: table.columns.map((column) => {
          const enField = getLocaleFieldLabel(table.table, column.field, 'en') ?? column.englishLabel;
          return {
            itField: column.field,
            enField,
            type: column.type,
            description: column.description || describeExternalField(table.table, column.field, enField),
          };
        }),
      });
    }

    return baseTables.sort((a, b) => {
      if (a.used !== b.used) return a.used ? -1 : 1;
      return a.tableName.localeCompare(b.tableName);
    });
  }, [catalog, dictionaryTranslations, overview, tEn]);

  useEffect(() => {
    if (!overview?.externalTableDetails || overview.externalTableDetails.length === 0) return;

    const catalogByTable = new Map<string, ExternalTableCatalogItem>();
    for (const table of catalog) {
      catalogByTable.set(table.table.toLowerCase(), table);
    }

    const additions: Record<string, string> = {};
    for (const table of overview.externalTableDetails) {
      const loweredTableName = table.tableName.toLowerCase();
      const match = catalogByTable.get(loweredTableName);
      const forcedTranslations = TABLE_FIELD_TRANSLATIONS[loweredTableName];
      const knownFields = new Set((match?.columns ?? []).map((column) => column.field.toLowerCase()));

      for (const column of table.columns) {
        const loweredColumn = column.columnName.toLowerCase();
        const normalizedColumn = normalizeFieldTranslationKey(column.columnName);
        const key = `${table.tableName.toLowerCase()}.${normalizedColumn}`;

        const localeEnField = getLocaleFieldLabel(table.tableName, column.columnName, 'en');
        if (localeEnField) {
          if (dictionaryTranslations[key] !== localeEnField) {
            additions[key] = localeEnField;
          }
          continue;
        }

        const forcedTranslation = forcedTranslations?.[loweredColumn] ?? forcedTranslations?.[normalizedColumn];
        if (forcedTranslation) {
          if (dictionaryTranslations[key] !== forcedTranslation) {
            additions[key] = forcedTranslation;
          }
          continue;
        }

        if (knownFields.has(loweredColumn)) continue;
        if (dictionaryTranslations[key]) continue;
        additions[key] = autoTranslateFieldToEnglish(column.columnName, table.tableName);
      }
    }

    if (Object.keys(additions).length === 0) return;

    const merged = {
      ...dictionaryTranslations,
      ...additions,
    };
    setDictionaryTranslations(merged);
    persistDictionaryTranslations(merged);
  }, [catalog, dictionaryTranslations, overview, tEn]);

  useEffect(() => {
    if (dictionaryTables.length === 0) {
      setOpenDictionaryTables([]);
      return;
    }

    setOpenDictionaryTables((prev) => {
      const existing = prev.filter((tableName) => dictionaryTables.some((table) => table.tableName === tableName));
      if (existing.length > 0) return existing;
      return dictionaryTables.filter((table) => table.used).map((table) => table.tableName);
    });
  }, [dictionaryTables]);

  const toggleDictionaryTable = (tableName: string) => {
    setOpenDictionaryTables((prev) => (
      prev.includes(tableName)
        ? prev.filter((name) => name !== tableName)
        : [...prev, tableName]
    ));
  };

  const loadDictionaryTableData = async (tableName: string) => {
    if (dictionaryDataLoadingByTable[tableName]) return;

    setDictionaryDataLoadingByTable((prev) => ({
      ...prev,
      [tableName]: true,
    }));
    setDictionaryDataErrorByTable((prev) => ({
      ...prev,
      [tableName]: null,
    }));

    try {
      const data = await getExternalTableData({
        tableName,
        limit: 80,
        targetCompanyId: selectedCompanyIdNum ?? targetCompanyId ?? undefined,
      });

      setDictionaryDataByTable((prev) => ({
        ...prev,
        [tableName]: data,
      }));
    } catch (err) {
      const message = parseApiError(err);
      setDictionaryDataErrorByTable((prev) => ({
        ...prev,
        [tableName]: message,
      }));
      showToast(message || tx.tableDataLoadError, 'error');
    } finally {
      setDictionaryDataLoadingByTable((prev) => ({
        ...prev,
        [tableName]: false,
      }));
    }
  };

  const setDictionaryTableView = (tableName: string, view: 'fields' | 'data') => {
    setDictionaryViewByTable((prev) => ({
      ...prev,
      [tableName]: view,
    }));

    if (view === 'data' && !dictionaryDataByTable[tableName] && !dictionaryDataLoadingByTable[tableName]) {
      void loadDictionaryTableData(tableName);
    }
  };

  const openPanel = (key: PanelKey) => {
    setOpenPanels((prev) => ({ ...prev, [key]: true }));
  };

  const closePanel = (key: PanelKey) => {
    setOpenPanels((prev) => ({ ...prev, [key]: false }));
  };

  const loadOverview = async () => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const data = await getExternalOverview(targetCompanyId ?? undefined);
      setOverview(data);

      setSelectedCompanyId((prev) => {
        if (!prev) return '';
        const asNum = parseInt(prev, 10);
        return data.companies.some((company) => company.id === asNum) ? prev : '';
      });

      setSelectedStoreId((prev) => {
        if (!prev) return '';
        const asNum = parseInt(prev, 10);
        return data.stores.some((store) => store.id === asNum) ? prev : '';
      });
    } catch (err) {
      const message = parseApiError(err);
      setOverviewError(message);
      showToast(message, 'error');
    } finally {
      setLoadingOverview(false);
    }
  };

  const loadCatalog = async () => {
    if (!isLocalRuntime) {
      setCatalog([]);
      return;
    }

    setLoadingCatalog(true);
    try {
      const rows = await getExternalCatalog(targetCompanyId ?? undefined);
      setCatalog(rows);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setCatalog([]);
        return;
      }
      showToast(parseApiError(err), 'error');
    } finally {
      setLoadingCatalog(false);
    }
  };

  const loadCompanyStoreProfiles = async () => {
    try {
      const [companiesRows, storesRows] = await Promise.all([
        getCompanies(),
        getStores(),
      ]);
      setCompanyProfiles(companiesRows);
      setStoreProfiles(storesRows);
    } catch (err) {
      showToast(parseApiError(err), 'error');
    }
  };

  const loadMappings = async (companyId: number | null) => {
    setLoadingMappings(true);
    try {
      const rows = await listExternalMappings(companyId ?? undefined);
      setMappings(rows);
      setStep1Error(null);
    } catch (err) {
      const message = parseApiError(err);
      setStep1Error(message);
      showToast(message, 'error');
    } finally {
      setLoadingMappings(false);
    }
  };

  const loadDepositi = async (search: string, companyId: number | null) => {
    if (!companyId) {
      setDepositiRows([]);
      return;
    }

    setLoadingDepositi(true);
    try {
      const rows = await listExternalDepositi({
        search,
        limit: 300,
        targetCompanyId: companyId,
      });
      setDepositiRows(rows);
      setStep1Error(null);
    } catch (err) {
      const message = parseApiError(err);
      setStep1Error(message);
      showToast(message, 'error');
    } finally {
      setLoadingDepositi(false);
    }
  };

  useEffect(() => {
    if (!isLocalRuntime) {
      setLocalDictionaryPanel(null);
      return;
    }

    const moduleCandidates = [
      '/src/modules/externalAffluence/local-only/ExternalAffluenceDictionary.local.tsx',
      '/src/modules/externalAffluence/local-only/ExternalAffluenceDictionary.local',
    ];

    const tryLoadModule = async () => {
      for (const modulePath of moduleCandidates) {
        try {
          const mod = await import(/* @vite-ignore */ modulePath);
          const dynamicModule = mod as { default?: React.ComponentType<LocalDictionaryPanelProps> };
          if (dynamicModule.default) {
            setLocalDictionaryPanel(() => dynamicModule.default as React.ComponentType<LocalDictionaryPanelProps>);
            return;
          }
        } catch {
          // Try next candidate path.
        }
      }
      setLocalDictionaryPanel(null);
    };

    void tryLoadModule();
  }, [isLocalRuntime]);

  useEffect(() => {
    const tasks = [loadOverview(), loadCompanyStoreProfiles(), loadMappings(null)] as Promise<unknown>[];
    if (isLocalRuntime) {
      tasks.push(loadCatalog());
    }
    void Promise.all(tasks);
  }, [isLocalRuntime]);

  useEffect(() => {
    setSelectedStoreId('');
    setTrafficData(null);
    setPreviewData(null);

    if (!selectedCompanyIdNum) {
      setDepositiRows([]);
      return;
    }

    void loadDepositi(externalSearch, selectedCompanyIdNum);
  }, [selectedCompanyIdNum]);

  useEffect(() => {
    if (!selectedCompanyIdNum) return;
    const timer = window.setTimeout(() => {
      void loadDepositi(externalSearch, selectedCompanyIdNum);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [externalSearch]);

  useEffect(() => {
    if (!trafficData) {
      setSelectedTrafficMonth('');
      return;
    }
    const months = Array.from(new Set(trafficData.rows.map((row) => toMonthKey(row.date)))).sort();
    setSelectedTrafficMonth((prev) => {
      if (prev && months.includes(prev)) return prev;
      return months[months.length - 1] ?? '';
    });
  }, [trafficData]);

  useEffect(() => {
    if (!companyPickerOpen && !storePickerOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (companyPickerOpen && !companyPickerRef.current?.contains(target)) {
        setCompanyPickerOpen(false);
      }
      if (storePickerOpen && !storePickerRef.current?.contains(target)) {
        setStorePickerOpen(false);
      }
    };

    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [companyPickerOpen, storePickerOpen]);

  const refreshAll = async () => {
    const tasks = [
      loadOverview(),
      loadCompanyStoreProfiles(),
      loadMappings(null),
      loadDepositi(externalSearch, selectedCompanyIdNum),
    ] as Promise<unknown>[];

    if (isLocalRuntime) {
      tasks.push(loadCatalog());
    }

    await Promise.all(tasks);
  };

  const handleMapStore = async (externalStoreCode: string) => {
    if (!selectedStore || !selectedCompanyIdNum) {
      setStep1Error(tx.selectStoreFirst);
      showToast(tx.selectStoreFirst, 'warning');
      return;
    }

    setSavingMappingCode(externalStoreCode);
    try {
      await upsertExternalMapping(selectedStore.id, {
        externalStoreCode,
        notes: null,
        targetCompanyId: selectedCompanyIdNum,
      });

      setStep1Error(null);
      showToast(tx.mapSavedToast, 'success');
      await Promise.all([
        loadMappings(null),
        loadDepositi(externalSearch, selectedCompanyIdNum),
      ]);
    } catch (err) {
      const message = parseApiError(err);
      setStep1Error(message);
      showToast(message, 'error');
    } finally {
      setSavingMappingCode(null);
    }
  };

  const handleDeleteMapping = async (storeId: number) => {
    try {
      await deleteExternalMapping(storeId);
      setStep1Error(null);
      showToast(tx.mapDeletedToast, 'success');
      await Promise.all([
        loadMappings(null),
        loadDepositi(externalSearch, selectedCompanyIdNum),
      ]);
    } catch (err) {
      const message = parseApiError(err);
      setStep1Error(message);
      showToast(message, 'error');
    }
  };

  const handleLoadTraffic = async () => {
    if (!selectedStore || !selectedCompanyIdNum) {
      setStep2Error(tx.selectStoreFirst);
      showToast(tx.selectStoreFirst, 'warning');
      return;
    }

    if (!selectedStoreMapping) {
      setStep2Error(tx.notMappedWarning);
      showToast(tx.notMappedWarning, 'warning');
      return;
    }

    setLoadingTraffic(true);
    setStep2Error(null);
    try {
      const data = await getExternalIngressi({
        storeId: selectedStore.id,
        targetCompanyId: selectedCompanyIdNum,
        fromDate,
        toDate,
      });
      setTrafficData(data);
    } catch (err) {
      const message = parseApiError(err);
      setStep2Error(message);
      setTrafficData(null);
      showToast(message, 'error');
    } finally {
      setLoadingTraffic(false);
    }
  };

  const handleLoadPreview = async () => {
    if (!selectedStore || !selectedCompanyIdNum) {
      setStep3Error(tx.selectStoreFirst);
      showToast(tx.selectStoreFirst, 'warning');
      return;
    }

    if (!selectedStoreMapping) {
      setStep3Error(tx.notMappedWarning);
      showToast(tx.notMappedWarning, 'warning');
      return;
    }

    setLoadingPreview(true);
    setStep3Error(null);
    try {
      const data = await getExternalAffluencePreview({
        storeId: selectedStore.id,
        targetCompanyId: selectedCompanyIdNum,
        fromDate,
        toDate,
      });
      setPreviewData(data);
    } catch (err) {
      const message = parseApiError(err);
      setStep3Error(message);
      setPreviewData(null);
      showToast(message, 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const showLoading = loadingOverview || loadingCatalog;

  return (
    <div className="page-enter" style={{ display: 'grid', gap: 16 }}>
      <section style={{ ...sectionStyle, background: 'linear-gradient(165deg, rgba(13,33,55,0.04) 0%, rgba(201,151,58,0.08) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--primary)' }}>{tx.title}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{tx.subtitle}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { void refreshAll(); }}
            disabled={showLoading || loadingMappings || loadingDepositi}
          >
            <RefreshCcw size={14} />
            {tx.refresh}
          </button>
        </div>

        {overviewError && (
          <div style={{ border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, padding: 10, fontSize: 13 }}>
            {overviewError}
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {tx.cardsTitle}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div
            onMouseEnter={() => setHoveredCard('companies')}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              position: 'relative',
              borderRadius: 12,
              padding: 14,
              color: '#fff',
              background: 'linear-gradient(140deg, #0D2137 0%, #163352 100%)',
              boxShadow: '0 8px 20px rgba(13,33,55,0.28)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.9 }}><Building2 size={14} /> {tx.companies}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Building2 size={18} />
              <div style={{ fontSize: 30, fontWeight: 800 }}>{overview?.counts.companies ?? 0}</div>
            </div>
            <button
              type="button"
              onClick={() => openPanel('companies')}
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                width: 30,
                height: 30,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.35)',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: hoveredCard === 'companies' ? 1 : 0,
                transition: 'opacity 0.18s ease',
              }}
            >
              <Eye size={14} />
            </button>
          </div>

          <div
            onMouseEnter={() => setHoveredCard('stores')}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              position: 'relative',
              borderRadius: 12,
              padding: 14,
              color: '#fff',
              background: 'linear-gradient(140deg, #163352 0%, #1A3B5C 100%)',
              boxShadow: '0 8px 20px rgba(22,51,82,0.24)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.9 }}><Store size={14} /> {tx.stores}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Store size={18} />
              <div style={{ fontSize: 30, fontWeight: 800 }}>{overview?.counts.stores ?? 0}</div>
            </div>
            <button
              type="button"
              onClick={() => openPanel('stores')}
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                width: 30,
                height: 30,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.35)',
                background: 'rgba(255,255,255,0.15)',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: hoveredCard === 'stores' ? 1 : 0,
                transition: 'opacity 0.18s ease',
              }}
            >
              <Eye size={14} />
            </button>
          </div>

          <div
            onMouseEnter={() => setHoveredCard('employees')}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              position: 'relative',
              borderRadius: 12,
              padding: 14,
              color: '#3f2b08',
              background: 'linear-gradient(140deg, #C9973A 0%, #E0B363 100%)',
              boxShadow: '0 8px 20px rgba(201,151,58,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.92 }}><Users size={14} /> {tx.employees}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Users size={18} />
              <div style={{ fontSize: 30, fontWeight: 800 }}>{overview?.counts.employees ?? 0}</div>
            </div>
            <button
              type="button"
              onClick={() => openPanel('employees')}
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                width: 30,
                height: 30,
                borderRadius: 999,
                border: '1px solid rgba(63,43,8,0.24)',
                background: 'rgba(255,255,255,0.55)',
                color: '#3f2b08',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: hoveredCard === 'employees' ? 1 : 0,
                transition: 'opacity 0.18s ease',
              }}
            >
              <Eye size={14} />
            </button>
          </div>

          <div
            onMouseEnter={() => setHoveredCard('internalDb')}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              position: 'relative',
              borderRadius: 12,
              padding: 14,
              border: '1px solid rgba(13,33,55,0.12)',
              background: 'linear-gradient(180deg, #ffffff 0%, #f7f5f1 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
              <Server size={14} /> {tx.internalDb}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>
              {overview?.databases.internal.databaseName ?? '-'}
            </div>
            <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>Status:</strong> {internalConnectionStatus === 'connected' ? tx.connected : internalConnectionStatus === 'connecting' ? tx.connecting : tx.failed}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Name:</strong> {overview?.databases.internal.databaseName ?? '-'}</div>
              <div>{tx.engine}: {overview?.databases.internal.engine ?? 'PostgreSQL'}</div>
              <div>{tx.checkedAt}: {formatDateTime(overview?.databases.internal.checkedAt)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Building2 size={12} color="var(--primary)" />
                  <strong style={{ color: 'var(--text-primary)' }}>{tx.companies}: {overview?.counts?.companies ?? 0}</strong>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Store size={12} color="var(--accent)" />
                  <strong style={{ color: 'var(--text-primary)' }}>{tx.stores}: {overview?.counts?.stores ?? 0}</strong>
                </span>
              </div>
              <StatusPill
                status={internalConnectionStatus}
                connecting={tx.connecting}
                connected={tx.connected}
                failed={tx.failed}
              />
            </div>
            <button
              type="button"
              onClick={() => openPanel('internalDb')}
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                width: 30,
                height: 30,
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: '#fff',
                color: 'var(--primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: hoveredCard === 'internalDb' ? 1 : 0,
                transition: 'opacity 0.18s ease',
              }}
            >
              <Eye size={14} />
            </button>
          </div>

          <div
            onMouseEnter={() => setHoveredCard('externalDb')}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              position: 'relative',
              borderRadius: 12,
              padding: 14,
              border: '1px solid rgba(13,33,55,0.12)',
              background: 'linear-gradient(180deg, #ffffff 0%, #f7f5f1 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}><Database size={14} /> {tx.externalDb}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>
              {overview?.databases.external.databaseName ?? '-'}
            </div>
            <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>Status:</strong> {externalConnectionStatus === 'connected' ? tx.connected : externalConnectionStatus === 'connecting' ? tx.connecting : tx.failed}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Name:</strong> {overview?.databases.external.databaseName ?? '-'}</div>
              <div>{tx.engine}: {overview?.databases.external.engine ?? 'MySQL'}</div>
              <div>{tx.tableCount}: {overview?.databases.external.tableCount ?? 0}</div>
              <div>{tx.checkedAt}: {formatDateTime(overview?.databases.external.checkedAt)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Building2 size={12} color="var(--primary)" />
                  <strong style={{ color: 'var(--text-primary)' }}>{tx.companies}: {overview?.counts?.companies ?? 0}</strong>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Store size={12} color="var(--accent)" />
                  <strong style={{ color: 'var(--text-primary)' }}>{tx.stores}: {overview?.counts?.stores ?? 0}</strong>
                </span>
              </div>
              <StatusPill
                status={externalConnectionStatus}
                connecting={tx.connecting}
                connected={tx.connected}
                failed={tx.failed}
              />
            </div>
            <button
              type="button"
              onClick={() => openPanel('externalDb')}
              style={{
                position: 'absolute',
                right: 10,
                top: 10,
                width: 30,
                height: 30,
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: '#fff',
                color: 'var(--primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: hoveredCard === 'externalDb' ? 1 : 0,
                transition: 'opacity 0.18s ease',
              }}
            >
              <Eye size={14} />
            </button>
          </div>
        </div>

        {openPanels.companies && (
          <div style={panelShellStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--primary)', fontSize: 13 }}>{tx.companiesPanelTitle}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => closePanel('companies')} title={tx.removePanel}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(13,33,55,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colCompany}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.stores}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colEmployees}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colActive}</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ padding: 8, fontSize: 13 }}>{company.name}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{company.storeCount}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{company.employeeCount}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{company.isActive ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                  {companies.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.noCompanies}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {openPanels.stores && (
          <div style={panelShellStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--primary)', fontSize: 13 }}>{tx.storesPanelTitle}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => closePanel('stores')} title={tx.removePanel}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(13,33,55,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colCompany}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colCode}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colStore}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colEmployees}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colActive}</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store) => (
                    <tr key={store.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ padding: 8, fontSize: 13 }}>{store.companyName}</td>
                      <td style={{ padding: 8, fontSize: 13, fontFamily: 'monospace' }}>{store.code}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{store.name}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{store.employeeCount}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{store.isActive ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                  {stores.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.noStores}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {openPanels.employees && (
          <div style={panelShellStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--primary)', fontSize: 13 }}>{tx.employeesPanelTitle}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => closePanel('employees')} title={tx.removePanel}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(13,33,55,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colCompany}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colStore}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colEmployee}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colEmail}</th>
                    <th style={{ textAlign: 'left', padding: 8, fontSize: 12 }}>{tx.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ padding: 8, fontSize: 13 }}>{employee.companyName}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{employee.storeName ?? '-'}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{`${employee.name} ${employee.surname}`.trim()}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{employee.email}</td>
                      <td style={{ padding: 8, fontSize: 13 }}>{employee.status}</td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.noEmployees}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {openPanels.internalDb && (
          <div style={panelShellStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--primary)', fontSize: 13 }}>{tx.internalDbPanelTitle}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => closePanel('internalDb')} title={tx.removePanel}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>
              {tx.engine}: PostgreSQL | {tx.dbName}: {overview?.databases.internal.databaseName ?? '-'} | {tx.tableCount}: {isLocalRuntime ? (overview?.databases.internal.tableCount ?? 0) : 0} | {tx.checkedAt}: {formatDateTime(overview?.databases.internal.checkedAt)}
            </div>
            <div style={{ maxHeight: 270, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(13,33,55,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colTable}</th>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colRows}</th>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colSize}</th>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colFields}</th>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colFieldList}</th>
                  </tr>
                </thead>
                <tbody>
                  {!isLocalRuntime && (
                    <tr><td colSpan={5} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.metadataHiddenLive}</td></tr>
                  )}
                  {isLocalRuntime && (overview?.localTableDetails ?? []).map((table) => (
                    <tr key={`local-${table.tableName}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ ...tinyCell, padding: 7, fontFamily: 'monospace' }}>{table.tableName}</td>
                      <td style={{ ...tinyCell, padding: 7 }}>{table.rowEstimate}</td>
                      <td style={{ ...tinyCell, padding: 7 }}>{table.totalSizePretty}</td>
                      <td style={{ ...tinyCell, padding: 7 }}>{table.columns.length}</td>
                      <td style={{ ...tinyCell, padding: 7 }}>{table.columns.map((column) => column.columnName).join(', ')}</td>
                    </tr>
                  ))}
                  {isLocalRuntime && (overview?.localTableDetails ?? []).length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.noTables}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {openPanels.externalDb && (
          <div style={panelShellStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ color: 'var(--primary)', fontSize: 13 }}>{tx.externalDbPanelTitle}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => closePanel('externalDb')} title={tx.removePanel}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>
              {tx.engine}: MySQL | {tx.dbName}: {overview?.databases.external.databaseName ?? '-'} | {tx.tableCount}: {isLocalRuntime ? (overview?.databases.external.tableCount ?? 0) : 0} | {tx.checkedAt}: {formatDateTime(overview?.databases.external.checkedAt)}
            </div>
            <div style={{ maxHeight: 270, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(13,33,55,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colTable}</th>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colRows}</th>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colSize}</th>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colFields}</th>
                    <th style={{ textAlign: 'left', padding: 7, fontSize: 11 }}>{tx.colFieldList}</th>
                  </tr>
                </thead>
                <tbody>
                  {!isLocalRuntime && (
                    <tr><td colSpan={5} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.metadataHiddenLive}</td></tr>
                  )}
                  {isLocalRuntime && (overview?.externalTableDetails ?? []).map((table) => (
                    <tr key={`external-${table.tableName}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ ...tinyCell, padding: 7, fontFamily: 'monospace' }}>{table.tableName}</td>
                      <td style={{ ...tinyCell, padding: 7 }}>{table.rowEstimate}</td>
                      <td style={{ ...tinyCell, padding: 7 }}>{table.totalSizePretty}</td>
                      <td style={{ ...tinyCell, padding: 7 }}>{table.columns.length}</td>
                      <td style={{ ...tinyCell, padding: 7 }}>{table.columns.map((column) => column.columnName).join(', ')}</td>
                    </tr>
                  ))}
                  {isLocalRuntime && (overview?.externalTableDetails ?? []).length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.noTables}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <div 
          onClick={() => setStep1Open(!step1Open)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={16} color="var(--primary)" />
            <h3 style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>{tx.step1Title}</h3>
          </div>
          <ArrowIcon open={step1Open} />
        </div>

        {step1Open && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{tx.step1Hint}</p>

            {step1Error && (
              <div style={{ border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, padding: 10, fontSize: 13 }}>
                <strong>{tx.stepError}: </strong>{step1Error}
              </div>
            )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 10 }}>
          <div ref={companyPickerRef} style={{ position: 'relative', display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{tx.selectCompany}</label>
            <button
              type="button"
              onClick={() => {
                setStorePickerOpen(false);
                setCompanyPickerOpen((prev) => !prev);
              }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                minHeight: 42,
                background: '#fff',
                cursor: 'pointer',
                padding: '8px 10px',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {selectedCompany ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    background: 'rgba(13,33,55,0.14)',
                    color: '#0D2137',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {getCompanyLogoUrl(selectedCompanyProfile?.logoFilename) ? (
                      <img
                        src={getCompanyLogoUrl(selectedCompanyProfile?.logoFilename) ?? ''}
                        alt={selectedCompany.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : selectedCompany.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedCompany.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.storesOwned}: {selectedCompany.storeCount} · {tx.colEmployees}: {selectedCompany.employeeCount}
                    </span>
                  </span>
                </span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tx.companyPlaceholder}</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{companyPickerOpen ? '▲' : '▼'}</span>
            </button>

            {companyPickerOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                zIndex: 30,
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: '#fff',
                boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: 8, borderBottom: '1px solid var(--border-light)' }}>
                  <Input
                    value={companySearch}
                    onChange={(event) => setCompanySearch(event.target.value)}
                    placeholder={tx.searchPlaceholder}
                  />
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {filteredCompanies.map((company) => {
                    const profile = companyProfileById.get(company.id);
                    const selected = String(company.id) === selectedCompanyId;
                    const ownerFullName = (() => {
                      const formatted = formatOwnerDisplayName(profile);
                      if (formatted !== '-') return formatted;
                      const fallbackName = profile?.ownerUserId ? employeeNameById.get(profile.ownerUserId) : null;
                      return fallbackName ?? '-';
                    })();
                    return (
                      <button
                        key={company.id}
                        type="button"
                        onClick={() => {
                          setSelectedCompanyId(String(company.id));
                          setSelectedStoreId('');
                          setCompanyPickerOpen(false);
                          setCompanySearch('');
                        }}
                        style={{
                          width: '100%',
                          border: 'none',
                          borderBottom: '1px solid var(--border-light)',
                          padding: '9px 10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          background: selected ? 'var(--surface-warm)' : '#fff',
                          display: 'flex',
                          gap: 8,
                          alignItems: 'flex-start',
                        }}
                      >
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'rgba(13,33,55,0.14)',
                          color: '#0D2137',
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {getCompanyLogoUrl(profile?.logoFilename) ? (
                            <img src={getCompanyLogoUrl(profile?.logoFilename) ?? ''} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : company.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{company.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {tx.companyGroup}: {profile?.groupName ?? '-'} · {tx.owner}: {ownerFullName || '-'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {tx.storesOwned}: {company.storeCount} · {tx.founded}: {formatDateOnly(profile?.createdAt ?? null)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div ref={storePickerRef} style={{ position: 'relative', display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{tx.selectStore}</label>
            <button
              type="button"
              disabled={!selectedCompanyIdNum}
              onClick={() => {
                if (!selectedCompanyIdNum) return;
                setCompanyPickerOpen(false);
                setStorePickerOpen((prev) => !prev);
              }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                minHeight: 42,
                background: '#fff',
                cursor: selectedCompanyIdNum ? 'pointer' : 'not-allowed',
                opacity: selectedCompanyIdNum ? 1 : 0.65,
                padding: '8px 10px',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {selectedStore ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    background: 'rgba(13,33,55,0.14)',
                    color: '#0D2137',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {getStoreLogoUrl(selectedStoreProfile?.logoFilename) ? (
                      <img src={getStoreLogoUrl(selectedStoreProfile?.logoFilename) ?? ''} alt={selectedStore.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : selectedStore.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedStore.code} - {selectedStore.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedStore.companyName} · {tx.colEmployees}: {selectedStore.employeeCount}
                    </span>
                  </span>
                </span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tx.storePlaceholder}</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{storePickerOpen ? '▲' : '▼'}</span>
            </button>

            {storePickerOpen && selectedCompanyIdNum && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                zIndex: 30,
                border: '1px solid var(--border)',
                borderRadius: 10,
                background: '#fff',
                boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: 8, borderBottom: '1px solid var(--border-light)' }}>
                  <Input
                    value={storeSearch}
                    onChange={(event) => setStoreSearch(event.target.value)}
                    placeholder={tx.searchPlaceholder}
                  />
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {filteredCompanyStores.map((store) => {
                    const profile = storeProfileById.get(store.id);
                    const selected = String(store.id) === selectedStoreId;
                    return (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => {
                          setSelectedStoreId(String(store.id));
                          setStorePickerOpen(false);
                          setStoreSearch('');
                        }}
                        style={{
                          width: '100%',
                          border: 'none',
                          borderBottom: '1px solid var(--border-light)',
                          padding: '9px 10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          background: selected ? 'var(--surface-warm)' : '#fff',
                          display: 'flex',
                          gap: 8,
                          alignItems: 'flex-start',
                        }}
                      >
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'rgba(13,33,55,0.14)',
                          color: '#0D2137',
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {getStoreLogoUrl(profile?.logoFilename) ? (
                            <img src={getStoreLogoUrl(profile?.logoFilename) ?? ''} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : store.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{store.code} - {store.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {store.companyName} · {tx.colEmployees}: {store.employeeCount}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {tx.founded}: {formatDateOnly(profile?.createdAt ?? null)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <Input
            label={tx.searchExternal}
            value={externalSearch}
            onChange={(event) => setExternalSearch(event.target.value)}
            placeholder={tx.searchPlaceholder}
            disabled={!selectedCompanyIdNum}
          />
        </div>

        <div style={{ ...panelShellStyle, background: '#fff' }}>
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(13,33,55,0.04)' }}>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.externalCode}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.externalStore}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.externalCompany}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.availableRange}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.colCode}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.colStore}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.action}</th>
                </tr>
              </thead>
              <tbody>
                {depositiRows.map((row) => (
                  <tr key={row.externalStoreCode} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: 9, fontSize: 13, fontFamily: 'monospace' }}>{row.externalStoreCode}</td>
                    <td style={{ padding: 9, fontSize: 13 }}>{row.storeName ?? '-'}</td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Building2 size={12} color="var(--primary)" />
                          <span>{row.companyName ?? '-'}</span>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Store size={12} color="var(--muted)" />
                          <span>{row.storeName ?? '-'}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{row.externalStoreCode}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Building2 size={12} color="var(--primary)" />
                          <span>{row.companyName ?? '-'}</span>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Store size={12} color="var(--muted)" />
                          <span>{row.storeName ?? '-'}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div>{row.availableDays ?? 0} {isItalian ? 'giorni' : 'days'}</div>
                        <div>{row.availableFromDate && row.availableToDate
                          ? `${formatDateOnly(row.availableFromDate)} -> ${formatDateOnly(row.availableToDate)}`
                          : '-'}</div>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      {row.mappedLocalStoreCode ? (
                        <div style={{ display: 'grid', gap: 2 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Store size={12} color="var(--accent)" />
                            <span style={{ fontFamily: 'monospace' }}>{row.mappedLocalStoreCode}</span>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {tx.localStoreId}: {row.mappedLocalStoreId ?? '-'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {tx.integrationBy}: {row.mappedLocalStoreId
                              ? `${mappingByStore.get(row.mappedLocalStoreId)?.createdByName ?? mappingByStore.get(row.mappedLocalStoreId)?.updatedByName ?? '-'} ${mappingByStore.get(row.mappedLocalStoreId)?.createdBySurname ?? mappingByStore.get(row.mappedLocalStoreId)?.updatedBySurname ?? ''}`.trim()
                              : '-'}
                          </span>
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      {row.mappedLocalStoreName ? (
                        <div style={{ display: 'grid', gap: 2 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Building2 size={12} color="var(--primary)" />
                            <span>{row.mappedLocalStoreName}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{row.mappedLocalStoreCode}</span>
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {tx.integrationBy}: {row.mappedLocalStoreId
                              ? `${mappingByStore.get(row.mappedLocalStoreId)?.createdByName ?? mappingByStore.get(row.mappedLocalStoreId)?.updatedByName ?? '-'} ${mappingByStore.get(row.mappedLocalStoreId)?.createdBySurname ?? mappingByStore.get(row.mappedLocalStoreId)?.updatedBySurname ?? ''}`.trim()
                              : '-'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {formatCompactDateTime(mappingByStore.get(row.mappedLocalStoreId ?? -1)?.updatedAt ?? null)}
                          </span>
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ padding: 9 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => { void handleMapStore(row.externalStoreCode); }}
                        disabled={!selectedStore || !canWrite || savingMappingCode === row.externalStoreCode}
                      >
                        {savingMappingCode === row.externalStoreCode ? tx.saving : tx.storeIntegrationAction}
                      </button>
                    </td>
                  </tr>
                ))}
                {depositiRows.length === 0 && !loadingDepositi && (
                  <tr>
                    <td colSpan={7} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.noExternalStores}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ ...panelShellStyle, background: '#fff' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{tx.savedIntegrationsTitle}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{tx.savedIntegrationsHint}</div>
          </div>
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0D2137' }}>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12, color: '#fff' }}>{tx.externalCompany}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12, color: '#fff' }}>{tx.colCode}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12, color: '#fff' }}>{tx.colStore}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12, color: '#fff' }}>{tx.externalCode}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12, color: '#fff' }}>{tx.externalStore}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12, color: '#fff' }}>{tx.integrationBy}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12, color: '#fff' }}>{tx.updatedAt}</th>
                  <th style={{ textAlign: 'left', padding: 9, fontSize: 12, color: '#fff' }}>{tx.action}</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping, idx) => {
                  const integratedName = `${mapping.createdByName ?? mapping.updatedByName ?? '-'} ${mapping.createdBySurname ?? mapping.updatedBySurname ?? ''}`.trim();
                  const integratedAvatar = getAvatarUrl(mapping.createdByAvatarFilename ?? mapping.updatedByAvatarFilename);
                  return (
                  <tr key={mapping.id} style={{ borderTop: '1px solid var(--border-light)', background: idx % 2 === 0 ? 'rgba(13,33,55,0.02)' : '#fff' }}>
                    <td style={{ padding: 9, fontSize: 13, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Building2 size={12} color="#c9973a" />
                          <span>{mapping.externalCompanyName ?? '-'}</span>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Store size={12} color="var(--accent)" />
                          <span>{mapping.externalStoreName ?? '-'}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{mapping.externalStoreCode}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Building2 size={12} color="#c9973a" />
                          <span>{mapping.localStoreName ?? '-'}</span>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Store size={12} color="var(--accent)" />
                          <span>{mapping.localStoreName ?? '-'}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{mapping.localStoreCode}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Store size={12} color="var(--accent)" />
                          <span style={{ fontFamily: 'monospace' }}>{mapping.localStoreCode}</span>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tx.localStoreId}: {mapping.localStoreId}</span>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Building2 size={12} color="var(--primary)" />
                        <span>{mapping.localStoreName}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{mapping.localStoreCode}</span>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 13, fontFamily: 'monospace' }}>{mapping.externalStoreCode}</td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Store size={12} color="var(--muted)" />
                          <span>{mapping.externalStoreName ?? '-'}</span>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatCompactDateTime(mapping.updatedAt)}</span>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            background: 'rgba(13,33,55,0.14)',
                            color: '#0D2137',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {integratedAvatar ? (
                              <img src={integratedAvatar} alt={integratedName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : integratedName.slice(0, 2).toUpperCase()}
                          </span>
                          <span>{integratedName || '-'}</span>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {formatCompactDateTime(mapping.updatedAt)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 13 }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <span>{formatDateTime(mapping.updatedAt)}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {tx.integrationBy}: {integratedName || '-' }
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 9 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => { void handleDeleteMapping(mapping.localStoreId); }}
                        disabled={!canWrite}
                      >
                        <Unlink size={13} /> {tx.remove}
                      </button>
                    </td>
                  </tr>
                )})}
                {mappings.length === 0 && !loadingMappings && (
                  <tr>
                    <td colSpan={8} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.noMappings}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}
      </section>

      <section style={sectionStyle}>
        <div 
          onClick={() => setStep2Open(!step2Open)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={16} color="var(--primary)" />
            <h3 style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>{tx.step2Title}</h3>
          </div>
          <ArrowIcon open={step2Open} />
        </div>

        {step2Open && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{tx.step2Hint}</p>

            {step2Error && (
              <div style={{ border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, padding: 10, fontSize: 13 }}>
                <strong>{tx.stepError}: </strong>{step2Error}
              </div>
            )}

        {!selectedStoreMapping && selectedStore && (
          <div style={{ border: '1px solid var(--warning-border)', background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: 10, padding: 10, fontSize: 13 }}>
            {tx.notMappedWarning}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, alignItems: 'end' }}>
          <DatePicker label={tx.fromDate} value={fromDate} onChange={setFromDate} />
          <DatePicker label={tx.toDate} value={toDate} onChange={setToDate} />

          <div style={{ display: 'grid', gap: 5 }}>
            <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{tx.selectedStore}</label>
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', padding: '9px 12px', minHeight: 39, fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedStore ? `${selectedStore.code} - ${selectedStore.name}` : tx.noStore}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { void handleLoadTraffic(); }}
            disabled={loadingTraffic || !selectedStore || !selectedStoreMapping}
          >
            {loadingTraffic ? tx.loadingTraffic : tx.loadIngressi}
          </button>
        </div>

        {trafficData && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <div style={{ display: 'grid', gap: 5 }}>
                <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{tx.selectedMonth}</label>
                <select
                  value={selectedTrafficMonth}
                  onChange={(event) => setSelectedTrafficMonth(event.target.value)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    background: '#fff',
                    padding: '8px 10px',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                  }}
                >
                  {trafficMonths.map((monthKey) => (
                    <option key={monthKey} value={monthKey}>{formatMonthKey(monthKey, isItalian)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: '#fff' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.totalDays}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--primary)' }}>{trafficData.summary.totalDays}</div>
                <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-muted)' }}>
                  {tx.rangeLabel}: {trafficData.fromDate}{' -> '}{trafficData.toDate}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: '#fff' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.totalVisitors}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--primary)' }}>{trafficData.summary.totalVisitors.toLocaleString()}</div>
                <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-muted)' }}>
                  {tx.selectedMonth}: {formatMonthKey(selectedTrafficMonth, isItalian)}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: '#fff' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.avgDay}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--primary)' }}>{selectedMonthAvgPerDay.toFixed(2)}</div>
                <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-muted)' }}>
                  {tx.monthVisitors}: {selectedMonthVisitors.toLocaleString()}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: '#fff' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.minMax}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>
                  {minTrafficRow?.visitors ?? trafficData.summary.minVisitors} - {maxTrafficRow?.visitors ?? trafficData.summary.maxVisitors}
                </div>
                <div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-muted)' }}>
                  Min: {minTrafficRow?.date ?? '-'} · Max: {maxTrafficRow?.date ?? '-'}
                </div>
              </div>
            </div>

            <div style={{ ...panelShellStyle, background: '#fff' }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-muted)' }}>
                {tx.trafficRawFields}
              </div>
              <div style={{ maxHeight: 260, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    {trafficData.detailColumns.length > 0 ? (
                      <tr style={{ background: 'rgba(13,33,55,0.04)' }}>
                        {trafficData.detailColumns.map((column) => (
                          <th key={`ingressi-col-${column}`} style={{ textAlign: 'left', padding: 9, fontSize: 12, whiteSpace: 'nowrap' }}>
                            {getDisplayFieldLabel('ingressi', column)}
                          </th>
                        ))}
                      </tr>
                    ) : (
                      <tr style={{ background: 'rgba(13,33,55,0.04)' }}>
                        <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.date}</th>
                        <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.externalCode}</th>
                        <th style={{ textAlign: 'left', padding: 9, fontSize: 12 }}>{tx.visitors}</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {trafficData.detailColumns.length > 0 ? (
                      <>
                        {trafficDetailRowsVisible.map((row, rowIndex) => (
                          <tr key={`ingressi-detail-${rowIndex}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                            {trafficData.detailColumns.map((column) => (
                              <td
                                key={`ingressi-detail-${rowIndex}-${column}`}
                                style={{
                                  padding: 9,
                                  fontSize: 12,
                                  color: 'var(--text-secondary)',
                                  fontFamily: /(^id$|cod|code|ean|barcode)/i.test(column) ? 'monospace' : undefined,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {formatDynamicCell(row[column], column)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {trafficDetailRowsVisible.length === 0 && (
                          <tr>
                            <td colSpan={Math.max(1, trafficData.detailColumns.length)} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                              {tx.noTrafficRows}
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      <>
                        {trafficRowsVisible.map((row) => (
                          <tr key={`${row.externalStoreCode}-${row.date}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                            <td style={{ padding: 9, fontSize: 13 }}>{row.date}</td>
                            <td style={{ padding: 9, fontSize: 13, fontFamily: 'monospace' }}>{row.externalStoreCode}</td>
                            <td style={{ padding: 9, fontSize: 13 }}>{row.visitors.toLocaleString()}</td>
                          </tr>
                        ))}
                        {trafficRowsVisible.length === 0 && (
                          <tr><td colSpan={3} style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>{tx.noTrafficRows}</td></tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
          </>
        )}
      </section>

      <section style={sectionStyle}>
        <div 
          onClick={() => setStep3Open(!step3Open)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WandSparkles size={16} color="var(--primary)" />
            <h3 style={{ margin: 0, color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>{tx.step3Title}</h3>
          </div>
          <ArrowIcon open={step3Open} />
        </div>

        {step3Open && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{tx.step3Hint}</p>

            {step3Error && (
              <div style={{ border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, padding: 10, fontSize: 13 }}>
                <strong>{tx.stepError}: </strong>{step3Error}
              </div>
            )}

        {!selectedStoreMapping && selectedStore && (
          <div style={{ border: '1px solid var(--warning-border)', background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: 10, padding: 10, fontSize: 13 }}>
            {tx.notMappedWarning}
          </div>
        )}

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'rgba(13,33,55,0.03)', fontSize: 12, color: 'var(--text-secondary)', display: 'grid', gap: 5 }}>
          <strong style={{ color: 'var(--primary)' }}>{tx.formulaTitle}</strong>
          <div>{tx.formulaLine1}</div>
          <div>{tx.formulaLine2Prefix} {previewData?.visitorsPerStaff ?? 10} {tx.formulaLine2Suffix}</div>
          <div>{tx.formulaLine3}</div>
          <div>{tx.formulaLine4}</div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { void handleLoadPreview(); }}
            disabled={loadingPreview || !selectedStore || !selectedStoreMapping}
          >
            {loadingPreview ? tx.generating : tx.generatePreview}
          </button>
        </div>

        {previewData && (
          <div style={{ ...panelShellStyle, background: '#fff' }}>
            {previewData.recommendations.length === 0 ? (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>{tx.noRecommendations}</div>
            ) : (
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#0D2137' }}>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 11, color: '#fff', textTransform: 'uppercase' }}>{tx.day}</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 11, color: '#fff', textTransform: 'uppercase' }}>{tx.timeSlot}</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 11, color: '#fff', textTransform: 'uppercase' }}>{tx.level}</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 11, color: '#fff', textTransform: 'uppercase' }}>{tx.estimatedVisitors}</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 11, color: '#fff', textTransform: 'uppercase' }}>{tx.recommendedStaff}</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 11, color: '#fff', textTransform: 'uppercase' }}>{tx.scheduledStaff}</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 11, color: '#fff', textTransform: 'uppercase' }}>{tx.currentDefault}</th>
                      <th style={{ textAlign: 'left', padding: 10, fontSize: 11, color: '#fff', textTransform: 'uppercase' }}>{tx.gap}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRowsSorted.map((row, idx) => {
                      const dayRowSpan = previewDayRowSpans.get(idx);

                      const levelColor = row.level === 'high'
                        ? '#b91c1c'
                        : row.level === 'medium'
                          ? '#a16207'
                          : '#166534';
                      const levelBg = row.level === 'high'
                        ? 'rgba(220,38,38,0.12)'
                        : row.level === 'medium'
                          ? 'rgba(202,138,4,0.12)'
                          : 'rgba(22,163,74,0.12)';

                      const coverageColor = row.coverageStatus === 'under'
                        ? '#b91c1c'
                        : row.coverageStatus === 'over'
                          ? '#1d4ed8'
                          : '#166534';
                      const coverageBg = row.coverageStatus === 'under'
                        ? 'rgba(220,38,38,0.12)'
                        : row.coverageStatus === 'over'
                          ? 'rgba(29,78,216,0.12)'
                          : 'rgba(22,163,74,0.12)';

                      const coverageLabel = row.coverageStatus === 'under'
                        ? tx.under
                        : row.coverageStatus === 'over'
                          ? tx.over
                          : tx.balanced;

                      return (
                        <tr key={`${row.dayOfWeek}-${row.timeSlot}`} style={{ borderTop: '1px solid var(--border-light)', background: idx % 2 === 0 ? 'rgba(13,33,55,0.02)' : '#fff' }}>
                          {dayRowSpan ? (
                            <td
                              rowSpan={dayRowSpan}
                              style={{
                                padding: 9,
                                fontSize: 12,
                                color: 'var(--text-primary)',
                                fontWeight: 700,
                                verticalAlign: 'top',
                              }}
                            >
                              {weekdayLabel(row.dayOfWeek, isItalian)}
                            </td>
                          ) : null}
                          <td style={{ padding: 9, fontSize: 12, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{row.timeSlot}</td>
                          <td style={{ padding: 9, fontSize: 12 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, background: levelBg, color: levelColor, fontSize: 10, fontWeight: 700 }}>
                              {row.level === 'low' ? tx.low : row.level === 'medium' ? tx.medium : tx.high}
                            </span>
                          </td>
                          <td style={{ padding: 9, fontSize: 12, color: 'var(--text-secondary)' }}>{row.estimatedVisitors.toFixed(2)}</td>
                          <td style={{ padding: 9, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}>{row.requiredStaff}</td>
                          <td style={{ padding: 9, fontSize: 12, color: 'var(--text-secondary)' }}>{row.currentScheduledStaff.toFixed(2)}</td>
                          <td style={{ padding: 9, fontSize: 12, color: 'var(--text-secondary)' }}>{row.currentRequiredStaff ?? '-'}</td>
                          <td style={{ padding: 9, fontSize: 12 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, background: coverageBg, color: coverageColor, fontSize: 10, fontWeight: 700 }}>
                              {row.deltaToScheduledStaff > 0 ? `+${row.deltaToScheduledStaff.toFixed(2)}` : row.deltaToScheduledStaff.toFixed(2)} ({coverageLabel})
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </section>

      {isLocalRuntime && LocalDictionaryPanel ? (
        <LocalDictionaryPanel
          tx={tx}
          sectionStyle={sectionStyle}
          panelShellStyle={panelShellStyle}
          tinyCell={tinyCell}
          dictionaryTables={dictionaryTables}
          openDictionaryTables={openDictionaryTables}
          toggleDictionaryTable={toggleDictionaryTable}
          dictionaryViewByTable={dictionaryViewByTable}
          setDictionaryTableView={setDictionaryTableView}
          dictionaryDataByTable={dictionaryDataByTable}
          dictionaryDataLoadingByTable={dictionaryDataLoadingByTable}
          dictionaryDataErrorByTable={dictionaryDataErrorByTable}
          getDisplayFieldLabel={getDisplayFieldLabel}
          formatDynamicCell={formatDynamicCell}
        />
      ) : null}

      {(showLoading || loadingMappings || loadingDepositi) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tx.loading}</div>
      )}
    </div>
  );
}
