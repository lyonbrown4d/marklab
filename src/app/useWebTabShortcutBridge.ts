import { useEffect, useMemo } from 'react'
import { webTabId } from '@/logic/tabs'
import type { ShortcutActionId } from '@/logic/shortcuts'
import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'
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
    if (!isElectronRuntime()) return
    void getElectronRuntime()
      .webTabs.setShortcutBindings({ bindings: nativeBindings })
      .catch(() => undefined)
  }, [nativeBindings])

  useEffect(() => {
    if (!isElectronRuntime()) return
    return getElectronRuntime().webTabs.onState((event) => {
      if (event.type !== 'shortcut' || activeTabId !== webTabId(event.tabId)) return
      execute(event.action)
    })
  }, [activeTabId, execute])
}
