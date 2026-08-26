import { useState, useEffect } from 'react';

/**
 * useTheme
 * 
 * Manages dark/light mode preference.
 * - Reads the user's saved preference from localStorage on first load.
 * - Falls back to the OS-level prefers-color-scheme if no saved preference.
 * - Applies 'dark' class to <html> so Tailwind's dark: variant works globally.
 * - Persists the choice to localStorage on every toggle.
 */
export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('studymate-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('studymate-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  return { isDark, toggleTheme };
}