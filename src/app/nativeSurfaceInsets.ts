import { create } from 'zustand'

type NativeSurfaceInsetsState = {
  leftDrawerOpen: boolean
  rightDrawerOpen: boolean
  toastHeight: number
  setDrawers: (leftDrawerOpen: boolean, rightDrawerOpen: boolean) => void
  setToastHeight: (height: number) => void
}

export const useNativeSurfaceInsetsStore = create<NativeSurfaceInsetsState>((set) => ({
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  toastHeight: 0,
  setDrawers: (leftDrawerOpen, rightDrawerOpen) => set({ leftDrawerOpen, rightDrawerOpen }),
  setToastHeight: (toastHeight) => set({ toastHeight }),
}))
