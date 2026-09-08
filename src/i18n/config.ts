import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import it from './locales/it';
import en from './locales/en';

const STORAGE_KEY = 'hr_lang';

const getStorageItem = (key: string): string | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
      return localStorage.getItem(key);
    }
  } catch (e) {
    // Ignore storage access errors
  }
  return null;
};

const setStorageItem = (key: string, value: string): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value);
    }
  } catch (e) {
    // Ignore storage access errors
  }
};

const savedLang = getStorageItem(STORAGE_KEY);
const defaultLang = (savedLang === 'it' || savedLang === 'en') ? savedLang : 'it';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      it: { translation: it },
      en: { translation: en },
    },
    lng: defaultLang,
    fallbackLng: 'it',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

// Persist language change to localStorage
i18n.on('languageChanged', (lng) => {
  setStorageItem(STORAGE_KEY, lng);
});

export default i18n;
