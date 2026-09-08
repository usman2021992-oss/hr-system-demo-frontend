const RELOAD_PARAM = '__hr_app_reload';
const RELOAD_STORAGE_KEY = 'hr_app_chunk_reload_v1';
const RELOAD_WINDOW_MS = 60_000;
const MAX_RELOADS_PER_WINDOW = 2;
const DUPLICATE_RELOAD_GRACE_MS = 500;

type ReloadState = {
  firstAt: number;
  lastAt: number;
  count: number;
};

type RecoveryOptions = {
  now?: () => number;
  reload?: (url: string) => void;
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readReloadState(): ReloadState | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(RELOAD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReloadState>;
    if (
      typeof parsed.firstAt === 'number' &&
      typeof parsed.lastAt === 'number' &&
      typeof parsed.count === 'number'
    ) {
      return {
        firstAt: parsed.firstAt,
        lastAt: parsed.lastAt,
        count: parsed.count,
      };
    }
  } catch {
    storage.removeItem(RELOAD_STORAGE_KEY);
  }

  return null;
}

function writeReloadState(state: ReloadState): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(RELOAD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable in private browsing; recovery still works.
  }
}

function getPossibleTargetSource(value: unknown): string {
  if (!value || typeof value !== 'object') return '';

  const eventLike = value as {
    target?: EventTarget | null;
    srcElement?: EventTarget | null;
  };
  const target = eventLike.target ?? eventLike.srcElement;
  if (!target || typeof target !== 'object') return '';

  if (target instanceof HTMLScriptElement) return target.src;
  if (target instanceof HTMLLinkElement) return target.href;

  const maybeElement = target as { src?: unknown; href?: unknown };
  if (typeof maybeElement.src === 'string') return maybeElement.src;
  if (typeof maybeElement.href === 'string') return maybeElement.href;
  return '';
}

function isModuleOrAssetEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  const eventLike = value as {
    target?: EventTarget | null;
    srcElement?: EventTarget | null;
  };
  const target = eventLike.target ?? eventLike.srcElement;
  if (!target || typeof target !== 'object') return false;

  const src = getPossibleTargetSource(value);
  const isBuiltAsset = /\/assets\/.+\.(?:js|mjs|css)(?:\?|$)/i.test(src);

  if (target instanceof HTMLScriptElement) {
    return target.type === 'module' || isBuiltAsset;
  }

  if (target instanceof HTMLLinkElement) {
    const rel = target.rel.toLowerCase();
    return isBuiltAsset && (rel.includes('modulepreload') || rel.includes('stylesheet'));
  }

  const maybeElement = target as { tagName?: unknown; type?: unknown; rel?: unknown };
  const tagName = typeof maybeElement.tagName === 'string' ? maybeElement.tagName.toLowerCase() : '';
  const type = typeof maybeElement.type === 'string' ? maybeElement.type.toLowerCase() : '';
  const rel = typeof maybeElement.rel === 'string' ? maybeElement.rel.toLowerCase() : '';

  return (
    (tagName === 'script' && (type === 'module' || isBuiltAsset)) ||
    (tagName === 'link' && isBuiltAsset && (rel.includes('modulepreload') || rel.includes('stylesheet')))
  );
}

function collectErrorText(value: unknown): string {
  const parts: string[] = [];

  if (typeof value === 'string') {
    parts.push(value);
  } else if (value instanceof Error) {
    parts.push(value.name, value.message);
  } else if (value && typeof value === 'object') {
    const errorLike = value as {
      name?: unknown;
      message?: unknown;
      reason?: unknown;
      error?: unknown;
      type?: unknown;
    };

    for (const key of ['name', 'message', 'type'] as const) {
      if (typeof errorLike[key] === 'string') parts.push(errorLike[key]);
    }

    if (typeof errorLike.reason === 'string') parts.push(errorLike.reason);
    if (errorLike.reason instanceof Error) parts.push(errorLike.reason.name, errorLike.reason.message);
    if (typeof errorLike.error === 'string') parts.push(errorLike.error);
    if (errorLike.error instanceof Error) parts.push(errorLike.error.name, errorLike.error.message);
  }

  const targetSource = getPossibleTargetSource(value);
  if (targetSource) parts.push(targetSource);

  return parts.join(' ');
}

export function isChunkLoadError(value: unknown): boolean {
  if (isModuleOrAssetEvent(value)) return true;

  const text = collectErrorText(value).toLowerCase();
  if (!text) return false;

  return (
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('importing a module script failed') ||
    text.includes('chunkloaderror') ||
    (text.includes('loading chunk') && text.includes('failed')) ||
    text.includes('not a valid javascript mime type') ||
    text.includes('expected a javascript-or-wasm module script') ||
    text.includes('expected a javascript module script') ||
    (text.includes('module script') && text.includes('mime type')) ||
    (text.includes('text/html') && text.includes('javascript')) ||
    (text.includes('/assets/') && text.includes('.js') && text.includes('mime'))
  );
}

function markReloadAttempt(now: number): 'attempt' | 'pending' | 'blocked' {
  const previous = readReloadState();
  if (!previous || now - previous.firstAt > RELOAD_WINDOW_MS) {
    writeReloadState({ firstAt: now, lastAt: now, count: 1 });
    return 'attempt';
  }

  if (now - previous.lastAt < DUPLICATE_RELOAD_GRACE_MS) {
    return 'pending';
  }

  if (previous.count >= MAX_RELOADS_PER_WINDOW) {
    return 'blocked';
  }

  writeReloadState({
    firstAt: previous.firstAt,
    lastAt: now,
    count: previous.count + 1,
  });
  return 'attempt';
}

function getCacheBustedUrl(now: number): string {
  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, String(now));
  return url.toString();
}

export function cleanupChunkReloadParam(): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(RELOAD_PARAM)) return;

  url.searchParams.delete(RELOAD_PARAM);
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}

export function recoverFromChunkLoadError(value: unknown, options: RecoveryOptions = {}): boolean {
  if (typeof window === 'undefined' || !isChunkLoadError(value)) return false;

  const now = options.now?.() ?? Date.now();
  const reloadAttempt = markReloadAttempt(now);
  if (reloadAttempt === 'blocked') return false;
  if (reloadAttempt === 'pending') return true;

  const nextUrl = getCacheBustedUrl(now);
  const reload = options.reload ?? ((url: string) => window.location.replace(url));

  window.setTimeout(() => {
    reload(nextUrl);
  }, 0);

  return true;
}

export function installChunkLoadRecovery(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: Event) => {
    const reason = event instanceof ErrorEvent && event.error ? event.error : event;
    if (recoverFromChunkLoadError(reason)) {
      event.preventDefault();
    }
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (recoverFromChunkLoadError(event.reason)) {
      event.preventDefault();
    }
  };

  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
