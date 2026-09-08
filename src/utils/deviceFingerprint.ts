import { UAParser } from 'ua-parser-js';

export type DeviceFingerprintResult = {
  // Identity of this installation: `web-device-v2:<installId>[:<legacyProfileHash>]`.
  fingerprint: string;
  // Raw metadata describing the device (stored in DB as JSONB).
  metadata: Record<string, any>;
  // Random per-installation id backing the fingerprint.
  installId: string;
};

// ---------------------------------------------------------------------------
// Per-installation device id
// ---------------------------------------------------------------------------
// The device identity MUST come from a value minted once and then persisted —
// never from observable device characteristics. A profile-derived hash (model +
// OS + browser version + screen + locale) is identical across two units of the
// same hardware, so only one of them could ever hold a registration, and it also
// changes on every browser update, silently locking a device out of its own
// account. The install id has neither problem.

const INSTALL_ID_STORAGE_KEY = 'hr_device_install_id';
const IDB_NAME = 'hr_device_identity_db';
const IDB_STORE = 'device_identity';
const IDB_VERSION = 1;
const IDB_RECORD_KEY = 'install_id';

function generateInstallId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function isValidInstallId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{16,64}$/.test(value);
}

function readInstallIdFromLocalStorage(): string | null {
  try {
    const value = localStorage.getItem(INSTALL_ID_STORAGE_KEY);
    return isValidInstallId(value) ? value : null;
  } catch {
    return null;
  }
}

function writeInstallIdToLocalStorage(installId: string): void {
  try {
    localStorage.setItem(INSTALL_ID_STORAGE_KEY, installId);
  } catch {
    /* storage disabled or full — IndexedDB mirror still applies */
  }
}

function openIdentityDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

async function readInstallIdFromIDB(): Promise<string | null> {
  const db = await openIdentityDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_RECORD_KEY);
      request.onsuccess = () => resolve(isValidInstallId(request.result) ? request.result : null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeInstallIdToIDB(installId: string): Promise<void> {
  const db = await openIdentityDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(installId, IDB_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

let installIdPromise: Promise<string> | null = null;

/**
 * Return this installation's device id, creating it on first use.
 * Mirrored across localStorage and IndexedDB so clearing one of the two
 * (which browsers do independently) does not lose the device identity.
 */
export function getDeviceInstallId(): Promise<string> {
  if (installIdPromise) return installIdPromise;

  installIdPromise = (async () => {
    const fromLocalStorage = readInstallIdFromLocalStorage();
    const fromIDB = await readInstallIdFromIDB();

    // localStorage wins when both exist so the value stays stable if the two
    // ever diverge; the loser is re-synced below.
    const installId = fromLocalStorage ?? fromIDB ?? generateInstallId();

    if (fromLocalStorage !== installId) writeInstallIdToLocalStorage(installId);
    if (fromIDB !== installId) await writeInstallIdToIDB(installId);

    return installId;
  })();

  return installIdPromise;
}

function fnv1aHex(input: string, seed: number): string {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function sha256Hex(input: string): Promise<string> {
  // Prefer WebCrypto when available
  if (typeof window !== 'undefined' && window.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const enc = new TextEncoder().encode(input);
    const buf = await window.crypto.subtle.digest('SHA-256', enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: stable non-crypto hash.
  return fnv1aHex(input, 1) + fnv1aHex(input, 7) + fnv1aHex(input, 13) + fnv1aHex(input, 29);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

/**
 * Hash of the device's observable characteristics.
 *
 * This is NOT an identity — it collides across identical hardware and changes on
 * browser updates. It is kept for two reasons only: it is reported as metadata
 * for the audit trail, and it lets the backend recognise a device that
 * registered under the previous scheme so it does not have to re-register.
 */
async function computeDeviceProfileHash(metadata: Record<string, any>): Promise<string> {
  const root = normalizeObject(metadata);
  const browser = normalizeObject(root.browser);
  const os = normalizeObject(root.os);
  const device = normalizeObject(root.device);
  const screen = normalizeObject(root.screen);

  const profile = {
    userAgent: normalizeText(root.userAgent),
    browserName: normalizeText(browser.name),
    browserVersion: normalizeText(browser.version),
    osName: normalizeText(os.name),
    osVersion: normalizeText(os.version),
    deviceModel: normalizeText(device.model),
    deviceVendor: normalizeText(device.vendor),
    deviceType: normalizeText(device.type),
    language: normalizeText(root.language),
    timezone: normalizeText(root.timezone),
    platform: normalizeText(root.platform),
    vendor: normalizeText(root.vendor),
    hardwareConcurrency: normalizeNumber(root.hardwareConcurrency),
    deviceMemory: normalizeNumber(root.deviceMemory),
    maxTouchPoints: normalizeNumber(root.maxTouchPoints),
    screenWidth: normalizeNumber(screen.width),
    screenHeight: normalizeNumber(screen.height),
    screenColorDepth: normalizeNumber(screen.colorDepth),
    screenPixelRatio: normalizeNumber(screen.pixelRatio),
  };

  return sha256Hex(JSON.stringify(profile));
}

export async function getDeviceFingerprint(): Promise<DeviceFingerprintResult> {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as any);

  let model: string | null = null;
  let platform: string | null = null;
  let platformVersion: string | null = null;

  if (nav.userAgentData && typeof nav.userAgentData.getHighEntropyValues === 'function') {
    try {
      const hints = await nav.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
      model = hints.model || null;
      platform = hints.platform || null;
      platformVersion = hints.platformVersion || null;
    } catch (e) {
      console.warn('Failed to retrieve high entropy values:', e);
    }
  }

  const ua = nav.userAgent || '';
  const parser = new UAParser(ua);
  const uaResult = parser.getResult();

  const metadata = {
    userAgent: ua,
    browser: {
      name: uaResult.browser.name || null,
      version: uaResult.browser.version || null,
    },
    os: {
      name: platform || uaResult.os.name || null,
      version: platformVersion || uaResult.os.version || null,
    },
    device: {
      model: model || uaResult.device.model || null,
      vendor: uaResult.device.vendor || null,
      type: uaResult.device.type || null,
    },
    language: nav.language || null,
    platform: nav.platform || platform || null,
    vendor: nav.vendor || null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    maxTouchPoints: typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : null,
    timezone: (() => {
      try {
        return new Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return null;
      }
    })(),
    screen: typeof window !== 'undefined' && window.screen ? {
      width: window.screen.width || null,
      height: window.screen.height || null,
      colorDepth: window.screen.colorDepth || null,
      pixelRatio: typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : null,
    } : null,
  };

  const [installId, profileHash] = await Promise.all([
    getDeviceInstallId(),
    computeDeviceProfileHash(metadata),
  ]);

  const stableMetadata = {
    ...metadata,
    stableDevice: {
      source: 'web-device-v2',
      installId,
    },
    // Retained for the audit trail and for backwards-compatible matching.
    legacyDevice: {
      source: 'web-profile-v1',
      hash: profileHash,
    },
  };

  return {
    // The legacy hash rides along so the backend can recognise — and silently
    // upgrade — a registration created by the previous client version.
    fingerprint: `web-device-v2:${installId}:${profileHash}`,
    metadata: stableMetadata,
    installId,
  };
}
