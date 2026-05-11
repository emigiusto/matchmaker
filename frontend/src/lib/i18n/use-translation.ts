import en from "./locales/en.json"
import es from "./locales/es.json"
import ca from "./locales/ca.json"
import { useLanguage } from "./language-context"

export function useTranslation() {
  const { language } = useLanguage()
  const translations = language === "es" ? es : language === "ca" ? ca : en

  const t = (key: string, paramsOrDefault?: Record<string, string | number> | string): string => {
    const keys = key.split(".")
    let value: any = translations

    for (const k of keys) {
      if (typeof value === "object" && value !== null && k in value) {
        value = value[k]
      } else {
        return typeof paramsOrDefault === "string" ? paramsOrDefault : key
      }
    }

    if (typeof value !== "string") {
      return typeof paramsOrDefault === "string" ? paramsOrDefault : key
    }

    if (paramsOrDefault && typeof paramsOrDefault === "object") {
      return value.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
        k in paramsOrDefault ? String(paramsOrDefault[k]) : `{{${k}}}`
      )
    }

    return value
  }

  return { t, language }
}
