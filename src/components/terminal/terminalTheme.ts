import type { ITheme } from '@xterm/xterm'

export const shellName = (shell: string) => {
  return shell.split(/[\\/]/).filter(Boolean).pop() ?? shell
}

export const readTerminalTheme = (): ITheme => {
  if (typeof window === 'undefined') {
    return {
      background: '#ffffff',
      foreground: '#171717',
      cursor: '#171717',
      selectionBackground: '#2563eb33',
    }
  }

  const style = window.getComputedStyle(document.documentElement)
  const hsl = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim()
    return value ? `hsl(${value})` : fallback
  }
  const hslAlpha = (name: string, alpha: number, fallback: string) => {
    const value = style.getPropertyValue(name).trim()
    return value ? `hsl(${value} / ${alpha})` : fallback
  }

  return {
    background: hsl('--card', '#ffffff'),
    foreground: hsl('--foreground', '#171717'),
    cursor: hsl('--foreground', '#171717'),
    selectionBackground: hslAlpha('--primary', 0.28, '#2563eb33'),
    black: hsl('--muted-foreground', '#52525b'),
    blue: hsl('--primary', '#2563eb'),
    cyan: hsl('--accent-foreground', '#0891b2'),
    green: '#16a34a',
    magenta: hsl('--ring', '#7c3aed'),
    red: hsl('--destructive', '#dc2626'),
    white: hsl('--foreground', '#171717'),
    yellow: '#ca8a04',
  }
}
