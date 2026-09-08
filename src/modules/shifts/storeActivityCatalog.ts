import type { TFunction } from 'i18next';
import { CUSTOM_ACTIVITY_TYPE, StoreActivityType } from '../../api/windowDisplay';

type ActivityPalette = {
  background: string;
  border: string;
  color: string;
  accentBorder: string;
};

type StoreActivityDefinition = {
  type: StoreActivityType;
  labelKey: string;
  labelFallback: string;
  defaultIcon: string;
  palette: ActivityPalette;
};

const VISUAL_PALETTE: ActivityPalette = {
  background: 'rgba(254,243,199,0.86)',
  border: 'rgba(217,119,6,0.32)',
  color: '#92400e',
  accentBorder: '#d97706',
};

const OPERATIONS_PALETTE: ActivityPalette = {
  background: 'rgba(220,252,231,0.86)',
  border: 'rgba(22,163,74,0.32)',
  color: '#166534',
  accentBorder: '#16a34a',
};

const INVENTORY_PALETTE: ActivityPalette = {
  background: 'rgba(219,234,254,0.86)',
  border: 'rgba(37,99,235,0.32)',
  color: '#1d4ed8',
  accentBorder: '#2563eb',
};

const PEOPLE_PALETTE: ActivityPalette = {
  background: 'rgba(224,231,255,0.86)',
  border: 'rgba(79,70,229,0.32)',
  color: '#3730a3',
  accentBorder: '#4f46e5',
};

const CUSTOM_PALETTE: ActivityPalette = {
  background: 'rgba(226,232,240,0.9)',
  border: 'rgba(71,85,105,0.34)',
  color: '#334155',
  accentBorder: '#475569',
};

export const STORE_ACTIVITY_DEFINITIONS: Record<StoreActivityType, StoreActivityDefinition> = {
  window_display: {
    type: 'window_display',
    labelKey: 'shifts.activityType.windowDisplay',
    labelFallback: 'Window display',
    defaultIcon: '🪟',
    palette: VISUAL_PALETTE,
  },
  campaign_launch: {
    type: 'campaign_launch',
    labelKey: 'shifts.activityType.campaignLaunch',
    labelFallback: 'Campaign launch',
    defaultIcon: '🚀',
    palette: VISUAL_PALETTE,
  },
  visual_merchandising: {
    type: 'visual_merchandising',
    labelKey: 'shifts.activityType.visualMerchandising',
    labelFallback: 'Visual merchandising refresh',
    defaultIcon: '🧥',
    palette: VISUAL_PALETTE,
  },
  promo_setup: {
    type: 'promo_setup',
    labelKey: 'shifts.activityType.promoSetup',
    labelFallback: 'Promo setup',
    defaultIcon: '🏷️',
    palette: VISUAL_PALETTE,
  },
  event_activation: {
    type: 'event_activation',
    labelKey: 'shifts.activityType.eventActivation',
    labelFallback: 'Event activation',
    defaultIcon: '🎉',
    palette: VISUAL_PALETTE,
  },
  seasonal_changeover: {
    type: 'seasonal_changeover',
    labelKey: 'shifts.activityType.seasonalChangeover',
    labelFallback: 'Seasonal changeover',
    defaultIcon: '🍂',
    palette: VISUAL_PALETTE,
  },
  pop_up_corner: {
    type: 'pop_up_corner',
    labelKey: 'shifts.activityType.popUpCorner',
    labelFallback: 'Pop-up corner setup',
    defaultIcon: '🧩',
    palette: VISUAL_PALETTE,
  },
  store_cleaning: {
    type: 'store_cleaning',
    labelKey: 'shifts.activityType.storeCleaning',
    labelFallback: 'Store cleaning',
    defaultIcon: '🧹',
    palette: OPERATIONS_PALETTE,
  },
  deep_cleaning: {
    type: 'deep_cleaning',
    labelKey: 'shifts.activityType.deepCleaning',
    labelFallback: 'Deep cleaning',
    defaultIcon: '🧼',
    palette: OPERATIONS_PALETTE,
  },
  maintenance_repair: {
    type: 'maintenance_repair',
    labelKey: 'shifts.activityType.maintenanceRepair',
    labelFallback: 'Maintenance / repair',
    defaultIcon: '🛠️',
    palette: OPERATIONS_PALETTE,
  },
  decoration_renovation: {
    type: 'decoration_renovation',
    labelKey: 'shifts.activityType.decorationRenovation',
    labelFallback: 'Decoration / renovation',
    defaultIcon: '🎨',
    palette: OPERATIONS_PALETTE,
  },
  layout_change: {
    type: 'layout_change',
    labelKey: 'shifts.activityType.layoutChange',
    labelFallback: 'Layout change',
    defaultIcon: '📐',
    palette: OPERATIONS_PALETTE,
  },
  store_reset: {
    type: 'store_reset',
    labelKey: 'shifts.activityType.storeReset',
    labelFallback: 'Store reset',
    defaultIcon: '🔁',
    palette: OPERATIONS_PALETTE,
  },
  product_restock: {
    type: 'product_restock',
    labelKey: 'shifts.activityType.productRestock',
    labelFallback: 'Product restock',
    defaultIcon: '📦',
    palette: INVENTORY_PALETTE,
  },
  inventory_count: {
    type: 'inventory_count',
    labelKey: 'shifts.activityType.inventoryCount',
    labelFallback: 'Inventory count',
    defaultIcon: '📊',
    palette: INVENTORY_PALETTE,
  },
  price_update: {
    type: 'price_update',
    labelKey: 'shifts.activityType.priceUpdate',
    labelFallback: 'Price update',
    defaultIcon: '💶',
    palette: INVENTORY_PALETTE,
  },
  audit_inspection: {
    type: 'audit_inspection',
    labelKey: 'shifts.activityType.auditInspection',
    labelFallback: 'Audit / inspection',
    defaultIcon: '🕵️',
    palette: INVENTORY_PALETTE,
  },
  staff_training: {
    type: 'staff_training',
    labelKey: 'shifts.activityType.staffTraining',
    labelFallback: 'Staff training',
    defaultIcon: '🎓',
    palette: PEOPLE_PALETTE,
  },
  custom_activity: {
    type: 'custom_activity',
    labelKey: 'shifts.activityType.customActivity',
    labelFallback: 'Custom activity',
    defaultIcon: '⭐',
    palette: CUSTOM_PALETTE,
  },
};

export const STORE_ACTIVITY_GROUPS: Array<{
  key: string;
  labelKey: string;
  labelFallback: string;
  types: StoreActivityType[];
}> = [
  {
    key: 'visual',
    labelKey: 'shifts.activityTypeGroup.visual',
    labelFallback: 'Visual & campaigns',
    types: [
      'window_display',
      'campaign_launch',
      'visual_merchandising',
      'promo_setup',
      'event_activation',
      'seasonal_changeover',
      'pop_up_corner',
    ],
  },
  {
    key: 'operations',
    labelKey: 'shifts.activityTypeGroup.operations',
    labelFallback: 'Operations & setup',
    types: [
      'store_cleaning',
      'deep_cleaning',
      'maintenance_repair',
      'decoration_renovation',
      'layout_change',
      'store_reset',
    ],
  },
  {
    key: 'inventory',
    labelKey: 'shifts.activityTypeGroup.inventory',
    labelFallback: 'Stock & controls',
    types: [
      'product_restock',
      'inventory_count',
      'price_update',
      'audit_inspection',
    ],
  },
  {
    key: 'people',
    labelKey: 'shifts.activityTypeGroup.people',
    labelFallback: 'People',
    types: ['staff_training'],
  },
  {
    key: 'custom',
    labelKey: 'shifts.activityTypeGroup.custom',
    labelFallback: 'Custom',
    types: [CUSTOM_ACTIVITY_TYPE],
  },
];

export const ACTIVITY_ICON_OPTIONS = [
  { value: '🪟', label: '🪟 Window' },
  { value: '🚀', label: '🚀 Launch' },
  { value: '🧥', label: '🧥 Visual' },
  { value: '🏷️', label: '🏷️ Promo' },
  { value: '🎉', label: '🎉 Event' },
  { value: '🍂', label: '🍂 Seasonal' },
  { value: '🧩', label: '🧩 Pop-up' },
  { value: '🧹', label: '🧹 Cleaning' },
  { value: '🧼', label: '🧼 Deep clean' },
  { value: '🛠️', label: '🛠️ Maintenance' },
  { value: '🎨', label: '🎨 Renovation' },
  { value: '📐', label: '📐 Layout' },
  { value: '🔁', label: '🔁 Reset' },
  { value: '📦', label: '📦 Restock' },
  { value: '📊', label: '📊 Inventory' },
  { value: '💶', label: '💶 Price' },
  { value: '🕵️', label: '🕵️ Audit' },
  { value: '🎓', label: '🎓 Training' },
  { value: '⭐', label: '⭐ Star' },
  { value: '⚙️', label: '⚙️ Gear' },
  { value: '✨', label: '✨ Spark' },
  { value: '📍', label: '📍 Pin' },
  { value: '💡', label: '💡 Idea' },
] as const;

export function isCustomActivityType(type: StoreActivityType): boolean {
  return type === CUSTOM_ACTIVITY_TYPE;
}

export function getActivityDefaultIcon(type: StoreActivityType): string {
  return STORE_ACTIVITY_DEFINITIONS[type].defaultIcon;
}

export function getActivityIcon(type: StoreActivityType, activityIcon?: string | null): string {
  const value = activityIcon?.trim();
  return value && value.length > 0 ? value : getActivityDefaultIcon(type);
}

export function getActivityTypeLabel(
  t: TFunction,
  type: StoreActivityType,
  customActivityName?: string | null,
): string {
  if (type === CUSTOM_ACTIVITY_TYPE) {
    const value = customActivityName?.trim();
    if (value) return value;
  }

  const definition = STORE_ACTIVITY_DEFINITIONS[type];
  return t(definition.labelKey, definition.labelFallback);
}

export function getActivityPalette(type: StoreActivityType): ActivityPalette {
  return STORE_ACTIVITY_DEFINITIONS[type].palette;
}
