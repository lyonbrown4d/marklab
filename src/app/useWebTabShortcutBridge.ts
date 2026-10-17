import { useEffect, useMemo } from 'react'
import { webTabId } from '@/logic/tabs'
import type { ShortcutActionId } from '@/logic/shortcuts'
import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
import { webTabShortcutActionSchema, type WebTabShortcutBindingsRequest } from '@/types/webTabs'

type ResolvedShortcutBindings = Record<ShortcutActionId, string[]>

type UseWebTabShortcutBridgeArgs = {
  activeTabId: string | null
  bindings: ResolvedShortcutBindings
  execute: (action: ShortcutActionId) => void
}

export const useWebTabShortcutBridge = ({
  activeTabId,
  bindings,
  execute,
}: UseWebTabShortcutBridgeArgs) => {
  const nativeBindings = useMemo<WebTabShortcutBindingsRequest['bindings']>(
    () =>
      Object.fromEntries(
        webTabShortcutActionSchema.options.map((action) => [action, bindings[action]]),
      ),
    [bindings],
  )

  useEffect(() => {
    if (!isDesktopRuntime()) return
    void getDesktopRuntime()
      .webTabs.setShortcutBindings({ bindings: nativeBindings })
      .catch(() => undefined)
  }, [nativeBindings])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    return getDesktopRuntime().webTabs.onState((event) => {
      if (event.type !== 'shortcut' || activeTabId !== webTabId(event.tabId)) return
      execute(event.action)
    })
  }, [activeTabId, execute])
}
