import { ThemeRegistration } from "../../shared/types";

const themes = new Map<string, ThemeRegistration>();

export function registerTheme(theme: ThemeRegistration): void {
  themes.set(theme.id, theme);
}

export function unregisterTheme(id: string): void {
  themes.delete(id);
}

export function getTheme(id: string): ThemeRegistration | undefined {
  return themes.get(id);
}

export function listThemes(): ThemeRegistration[] {
  return Array.from(themes.values());
}

export function clearThemes(): void {
  themes.clear();
}
