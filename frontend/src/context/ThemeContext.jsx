import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)
const THEME_KEY = 'whitfield.theme'

/** 'light' | 'dark' | 'contrast' - contrast is dark plus the high-contrast palette. */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light')

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme !== 'light')
    root.classList.toggle('contrast', theme === 'contrast')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const cycle = useCallback(() => {
    setTheme((current) =>
      current === 'light' ? 'dark' : current === 'dark' ? 'contrast' : 'light',
    )
  }, [])

  const value = useMemo(() => ({ theme, setTheme, cycle }), [theme, cycle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
