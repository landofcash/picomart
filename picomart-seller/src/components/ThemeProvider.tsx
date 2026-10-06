import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import {
  applyTheme,
  isTheme,
  readTheme,
  THEME_KEY,
  ThemeContext,
  type Theme,
} from "@/lib/theme";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, update] = useState(readTheme);
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null)
        update(isTheme(event.newValue) ? event.newValue : "light");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function setTheme(next: Theme) {
    update(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* Keep a session-only choice if storage is unavailable. */
    }
  }
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
