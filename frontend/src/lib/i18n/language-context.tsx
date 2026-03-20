import { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"

type Language = "en" | "es"

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

function detectLanguage(): Language {
  const saved = localStorage.getItem("language")
  if (saved === "en" || saved === "es") return saved
  const browserLang = navigator.language?.toLowerCase() ?? ""
  return "es"
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage)

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem("language", lang)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider")
  }
  return context
}
