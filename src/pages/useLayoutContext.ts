import { useOutletContext } from 'react-router-dom'
import { useStore } from 'zustand'
import type { LayoutContext, LayoutContextStore } from '@/app/AppLayoutContext'

export const useLayoutContext = <Selected>(selector: (state: LayoutContext) => Selected) => {
  const store = useOutletContext<LayoutContextStore>()
  return useStore(store, selector)
}
