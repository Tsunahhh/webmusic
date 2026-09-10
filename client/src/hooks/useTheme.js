import { useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'musicweb-theme';

// useLayoutEffect (not useEffect) so the data-theme attribute lands before
// the browser paints — avoids a flash of the wrong theme on load.
export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || 'dark');

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  return [theme, toggleTheme];
}
