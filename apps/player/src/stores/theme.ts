import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const query = '(prefers-color-scheme: dark)'

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? (window.matchMedia(query).matches ? 'dark' : 'light') : theme
}

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(persist(
  (set, get) => ({
    theme: 'system',
    setTheme: (theme) => set({ theme }),
    toggleTheme: () => set({ theme: resolveTheme(get().theme) === 'dark' ? 'light' : 'dark' }),
  }),
  {
    name: 'theme',
    storage: createJSONStorage(() => ({
      getItem: (key) => {
        const value = localStorage.getItem(key)
        return value === 'light' || value === 'dark' || value === 'system'
          ? JSON.stringify({ state: { theme: value }, version: 0 })
          : value
      },
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    })),
    partialize: (state) => ({ theme: state.theme }) as ThemeState,
  },
))
