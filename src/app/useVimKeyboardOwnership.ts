import { useEffect, useSyncExternalStore } from 'react'
import { setVimKeyboardOwnership } from '@/runtime/window'
import { getFocusedVimMode, onVimKeyboardScopeChange } from '@/components/vim/vimKeyboardScope'

const hasFocusedVimEditor = () => getFocusedVimMode() !== null

export const useVimKeyboardOwnership = (): boolean => {
  const focused = useSyncExternalStore(onVimKeyboardScopeChange, hasFocusedVimEditor, () => false)
  useEffect(() => {
    // Subscribe imperatively so scope teardown restores native shortcuts immediately.
    const sync = () => {
      void setVimKeyboardOwnership(hasFocusedVimEditor()).catch((error: unknown) => {
        console.error('Failed to update Vim keyboard ownership:', error)
      })
    }
    sync()
    const unsubscribe = onVimKeyboardScopeChange(sync)
    return () => {
      unsubscribe()
      void setVimKeyboardOwnership(false).catch((error: unknown) => {
        console.error('Failed to release Vim keyboard ownership:', error)
      })
    }
  }, [])
  return focused
}
