import i18n from "i18next";
import { initReactI18next } from "react-i18next";
void i18n.use(initReactI18next).init({
  lng: "fr",
  fallbackLng: "fr",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  resources: { fr: { translation: {} } },
  showSupportNotice: false,
});
export default i18n;
