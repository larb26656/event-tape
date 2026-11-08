import { useEffect } from 'react'
import { resolveTheme, useThemeStore } from '../stores/theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const root = document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(resolveTheme(theme))
    }
    apply()
    if (theme === 'system') media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== 'theme' && event.key !== null)) return
      if (event.newValue === null) useThemeStore.setState({ theme: 'system' })
      else void useThemeStore.persist.rehydrate()
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  return children
}
