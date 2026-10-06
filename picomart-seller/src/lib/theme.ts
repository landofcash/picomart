import { createContext, useContext } from "react";

export const themes = ["light", "terminal", "cyberpunk", "cosmic"] as const;
export type Theme = (typeof themes)[number];
export const THEME_KEY = "picomart.seller.theme";
export const isTheme = (value: unknown): value is Theme =>
  themes.includes(value as Theme);
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : "light";
  } catch {
    return "light";
  }
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme !== "light");
  document.documentElement.style.colorScheme =
    theme === "light" ? "light" : "dark";
}
export const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({ theme: "light", setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);
