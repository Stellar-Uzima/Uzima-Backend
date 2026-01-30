import i18next from 'i18next';
import i18nextHttpMiddleware from 'i18next-http-middleware';
import i18nextBackend from 'i18next-fs-backend';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

i18next
  .use(i18nextBackend)
  .use(i18nextHttpMiddleware.LanguageDetector)
  .init({
    backend: {
      loadPath: path.join(__dirname, '../locales/{{lng}}.json'),
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'sw'],
    preload: ['en', 'fr', 'sw'],
    detection: {
      order: ['querystring', 'header'],
      lookupQuerystring: 'lang',
      lookupHeader: 'accept-language',
      caches: [],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export const i18nMiddleware = i18nextHttpMiddleware.handle(i18next);
export default i18next;
