/**
 * Per-device preferences: screen language and light/dark. Kept in localStorage as a convenience only
 * (a private window or cleared storage simply falls back to the defaults).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Language } from '../domain'
import { LABELS, type Labels } from '../i18n/labels'

export type ThemeChoice = 'system' | 'light' | 'dark'

const LANGUAGE_KEY = 'icc.language'
const THEME_KEY = 'icc.theme'

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode); the choice lasts for this visit only.
  }
}

interface Preferences {
  language: Language
  setLanguage: (language: Language) => void
  theme: ThemeChoice
  setTheme: (theme: ThemeChoice) => void
}

const PreferencesContext = createContext<Preferences | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => (readStored(LANGUAGE_KEY) === 'kn' ? 'kn' : 'en'))
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const stored = readStored(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  })

  useEffect(() => {
    document.documentElement.lang = language
    writeStored(LANGUAGE_KEY, language)
  }, [language])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    writeStored(THEME_KEY, theme)
  }, [theme])

  const value = useMemo(() => ({ language, setLanguage, theme, setTheme }), [language, theme])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): Preferences {
  const prefs = useContext(PreferencesContext)
  if (!prefs) throw new Error('usePreferences must be used inside PreferencesProvider')
  return prefs
}

/** Labels for the current screen language. */
export function useT(): Labels {
  return LABELS[usePreferences().language]
}
