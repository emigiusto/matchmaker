import en from "./locales/en.json"
import es from "./locales/es.json"
import { useLanguage } from "./language-context"

export function useTranslation() {
  const { language } = useLanguage()
  const translations = language === "es" ? es : en

  const t = (key: string, defaultValue = key): string => {
    const keys = key.split(".")
    let value: any = translations

    for (const k of keys) {
      if (typeof value === "object" && value !== null && k in value) {
        value = value[k]
      } else {
        return defaultValue
      }
    }

    return typeof value === "string" ? value : defaultValue
  }

  return { t, language }
}
