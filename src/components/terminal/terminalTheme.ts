import type { ITheme } from '@xterm/xterm'

export const TERMINAL_FONT_FAMILY = [
  '"JetBrainsMono Nerd Font Mono"',
  '"JetBrainsMono Nerd Font"',
  '"MesloLGS NF"',
  '"CaskaydiaCove Nerd Font Mono"',
  '"Symbols Nerd Font Mono"',
  '"PowerlineSymbols"',
  '"JetBrains Mono"',
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Monaco',
  'Consolas',
  'monospace',
].join(', ')

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
    brightBlack: '#71717a',
    brightBlue: '#60a5fa',
    brightCyan: '#22d3ee',
    brightGreen: '#4ade80',
    brightMagenta: '#c084fc',
    brightRed: '#f87171',
    brightWhite: hsl('--foreground', '#171717'),
    brightYellow: '#facc15',
    cyan: hsl('--accent-foreground', '#0891b2'),
    green: '#16a34a',
    magenta: hsl('--ring', '#7c3aed'),
    red: hsl('--destructive', '#dc2626'),
    white: hsl('--foreground', '#171717'),
    yellow: '#ca8a04',
  }
}
