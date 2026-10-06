import type { Input } from 'electron'

import type { WebTabShortcutAction, WebTabShortcutBindingsRequest } from '@/types/webTabs'

export type CompiledWebTabShortcut = {
  action: WebTabShortcutAction
  alt: boolean
  control: boolean
  key: string
  meta: boolean
  shift: boolean
}

const RESERVED_WEB_ACTIONS = new Set(['a', 'c', 'f', 'v', 'x', 'z'])

export const compileWebTabShortcutBindings = (
  bindings: WebTabShortcutBindingsRequest['bindings'],
  platform: NodeJS.Platform,
): CompiledWebTabShortcut[] => {
  const compiled: CompiledWebTabShortcut[] = []
  for (const [action, hotkeys] of Object.entries(bindings)) {
    for (const hotkey of hotkeys ?? []) {
      const parsed = parseHotkey(hotkey, platform)
      if (parsed && !isReservedWebShortcut(parsed, platform)) {
        compiled.push({ action: action as WebTabShortcutAction, ...parsed })
      }
    }
  }
  return compiled
}

export const findWebTabShortcutAction = (
  bindings: readonly CompiledWebTabShortcut[],
  input: Input,
): WebTabShortcutAction | null => {
  if (input.type !== 'keyDown' || input.isAutoRepeat || input.isComposing) return null
  const key = normalizeKey(input.key)
  for (let index = bindings.length - 1; index >= 0; index -= 1) {
    const binding = bindings[index]
    if (!binding) continue
    if (
      binding.key === key &&
      binding.alt === input.alt &&
      binding.control === input.control &&
      binding.meta === input.meta &&
      binding.shift === input.shift
    ) {
      return binding.action
    }
  }
  return null
}

const parseHotkey = (
  hotkey: string,
  platform: NodeJS.Platform,
): Omit<CompiledWebTabShortcut, 'action'> | null => {
  const tokens = hotkey.split('+').map((token) => token.trim())
  const rawKey = tokens.pop()
  if (!rawKey) return null
  const shortcut = {
    alt: false,
    control: false,
    key: normalizeKey(rawKey),
    meta: false,
    shift: false,
  }
  for (const token of tokens) {
    const modifier = token.toLowerCase()
    if (modifier === 'alt' || modifier === 'option') shortcut.alt = true
    else if (modifier === 'control' || modifier === 'ctrl') shortcut.control = true
    else if (modifier === 'meta' || modifier === 'cmd' || modifier === 'command')
      shortcut.meta = true
    else if (modifier === 'shift') shortcut.shift = true
    else if (modifier === 'mod' || modifier === 'cmdorctrl') {
      if (platform === 'darwin') shortcut.meta = true
      else shortcut.control = true
    } else return null
  }
  return shortcut.key ? shortcut : null
}

const isReservedWebShortcut = (
  shortcut: Omit<CompiledWebTabShortcut, 'action'>,
  platform: NodeJS.Platform,
): boolean => {
  const usesMod =
    platform === 'darwin' ? shortcut.meta && !shortcut.control : shortcut.control && !shortcut.meta
  if (!usesMod || shortcut.alt) return false
  if (!shortcut.shift && RESERVED_WEB_ACTIONS.has(shortcut.key)) return true
  if (platform === 'darwin' && shortcut.shift && shortcut.key === 'z') return true
  return platform !== 'darwin' && !shortcut.shift && shortcut.key === 'y'
}

const normalizeKey = (key: string): string => key.toLocaleLowerCase('en-US')
