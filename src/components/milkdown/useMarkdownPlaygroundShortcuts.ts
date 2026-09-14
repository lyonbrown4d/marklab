import { useMemo, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { detectPlatform, matchesKeyboardEvent, parseHotkey } from '@tanstack/react-hotkeys'
import type { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { Plugin } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'
import {
  defaultShortcutBindings,
  resolveShortcutBindings,
  type ShortcutBindings,
  type ShortcutPlatform,
} from '@/logic/shortcuts'
import {
  editorShortcutActionIds,
  runMarkdownEditorShortcut,
} from '@/components/milkdown/editorShortcuts'
import {
  captureSlashUrlInsertion,
  type SlashUrlInsertionRequest,
} from '@/components/milkdown/slashUrlInsertion'

type PlaygroundShortcutOptions = {
  crepeRef: RefObject<Crepe | null>
  enabled: boolean
  overrides?: ShortcutBindings
  onUrlInsert: (request: SlashUrlInsertionRequest) => void
}

export const resolvePlaygroundShortcutBindings = (
  overrides: ShortcutBindings = {},
  platform: ShortcutPlatform = detectPlatform(),
) => {
  const resolved = resolveShortcutBindings(overrides)
  const isOverridden = (action: (typeof editorShortcutActionIds)[number]) =>
    Object.prototype.hasOwnProperty.call(overrides, action)
  // Explicit user assignments win over defaults that use the same chord.
  const actions = [
    ...editorShortcutActionIds.filter(isOverridden),
    ...editorShortcutActionIds.filter((action) => !isOverridden(action)),
  ]
  return {
    platform,
    bindings: actions.flatMap((action) =>
      resolved[action].map((hotkey) => ({ action, hotkey: parseHotkey(hotkey, platform) })),
    ),
    suppressedDefaults: editorShortcutActionIds
      .filter(isOverridden)
      .flatMap((action) =>
        defaultShortcutBindings[action].map((hotkey) => parseHotkey(hotkey, platform)),
      ),
  }
}

type PlaygroundShortcutState = ReturnType<typeof resolvePlaygroundShortcutBindings> & {
  crepe: Crepe | null
  enabled: boolean
  onUrlInsert: PlaygroundShortcutOptions['onUrlInsert']
}

export const createMarkdownPlaygroundShortcutPlugin = (getState: () => PlaygroundShortcutState) =>
  new Plugin({
    props: {
      handleDOMEvents: {
        keydown: (view, event) => {
          const state = getState()
          const target = event.target
          if (
            !state.enabled ||
            !state.crepe ||
            view.isDestroyed ||
            !view.editable ||
            event.defaultPrevented ||
            event.isComposing ||
            event.keyCode === 229 ||
            view.composing ||
            !view.hasFocus() ||
            !(target instanceof Element) ||
            !view.dom.contains(target) ||
            target.closest('input, textarea, select, [contenteditable="false"]')
          )
            return false
          if (state.crepe.editor.action((ctx) => ctx.get(editorViewCtx)) !== view) return false

          const match = state.bindings.find(({ hotkey }) =>
            matchesKeyboardEvent(event, hotkey, state.platform),
          )
          if (match) {
            const handled = runMarkdownEditorShortcut(state.crepe, match.action, {
              onLinkInsert: (ctx) =>
                state.onUrlInsert(captureSlashUrlInsertion(ctx, 'link', { consumeSlash: false })),
            })
            if (!handled) return false
          } else if (
            !state.suppressedDefaults.some((hotkey) =>
              matchesKeyboardEvent(event, hotkey, state.platform),
            )
          )
            return false

          // Run before native keymaps, preventing duplicate commands and disabled defaults.
          event.preventDefault()
          event.stopPropagation()
          return true
        },
      },
    },
  })

export const useMarkdownPlaygroundShortcuts = ({
  crepeRef,
  enabled,
  overrides,
  onUrlInsert,
}: PlaygroundShortcutOptions) => {
  const bindings = useMemo(() => resolvePlaygroundShortcutBindings(overrides), [overrides])
  const latest = useLatest({ crepeRef, enabled, onUrlInsert, ...bindings })
  return useMemo(
    () =>
      $prose(() =>
        createMarkdownPlaygroundShortcutPlugin(() => ({
          ...latest.current,
          crepe: latest.current.crepeRef.current,
        })),
      ),
    [latest],
  )
}
