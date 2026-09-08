import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Silence missing CSS vars warnings in jsdom
Object.defineProperty(window, 'CSS', { value: { supports: () => false } });

// navigator.onLine default = true in jsdom
Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

class InMemoryStorage implements Storage {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return key in this.store ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return index >= 0 && index < keys.length ? keys[index] : null;
  }
}

const mockLocalStorage = new InMemoryStorage();
const mockSessionStorage = new InMemoryStorage();

vi.stubGlobal('localStorage', mockLocalStorage);
vi.stubGlobal('sessionStorage', mockSessionStorage);
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });
Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });

const mockIndexedDB = {
  open: vi.fn().mockImplementation(() => {
    const req = {
      onerror: null as any,
      onsuccess: null as any,
      onupgradeneeded: null as any,
      result: {
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(true),
        },
        createObjectStore: vi.fn(),
        transaction: vi.fn().mockImplementation(() => {
          const t = {
            objectStore: vi.fn().mockImplementation(() => {
              return {
                add: vi.fn().mockImplementation((event) => {
                  const addReq = { onsuccess: null as any, onerror: null as any, result: 1 };
                  setTimeout(() => {
                    if (addReq.onsuccess) addReq.onsuccess();
                  }, 0);
                  return addReq;
                }),
                getAll: vi.fn().mockImplementation(() => {
                  const getAllReq = { onsuccess: null as any, onerror: null as any, result: [] };
                  setTimeout(() => {
                    if (getAllReq.onsuccess) getAllReq.onsuccess();
                  }, 0);
                  return getAllReq;
                }),
                delete: vi.fn().mockImplementation((id) => {
                  return {};
                }),
              };
            }),
            oncomplete: null as any,
            onerror: null as any,
          };
          setTimeout(() => {
            if (t.oncomplete) t.oncomplete();
          }, 0);
          return t;
        }),
      },
    };
    setTimeout(() => {
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }),
};
vi.stubGlobal('indexedDB', mockIndexedDB);
Object.defineProperty(window, 'indexedDB', { value: mockIndexedDB });


