import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_DRAWIO_EMBED_URL,
  normalizeDrawioEmbedUrl,
  type DrawioEditorMode,
} from '@/logic/drawioEmbed'
import { createElectronSettingsJsonStorage } from '@/store/persistStorage'

type DrawioSettingsState = {
  drawioEditorMode: DrawioEditorMode
  drawioEmbedUrl: string
  resetDrawioEmbedUrl: () => void
  setDrawioEditorMode: (mode: DrawioEditorMode) => void
  setDrawioEmbedUrl: (url: string) => void
}

type DrawioSettingsPersistedState = Pick<DrawioSettingsState, 'drawioEditorMode' | 'drawioEmbedUrl'>

export const useDrawioSettingsStore = create<DrawioSettingsState>()(
  persist(
    (set) => ({
      drawioEditorMode: 'remote',
      drawioEmbedUrl: DEFAULT_DRAWIO_EMBED_URL,
      resetDrawioEmbedUrl: () => set({ drawioEmbedUrl: DEFAULT_DRAWIO_EMBED_URL }),
      setDrawioEditorMode: (drawioEditorMode) =>
        set((state) =>
          state.drawioEditorMode === drawioEditorMode ? state : { drawioEditorMode },
        ),
      setDrawioEmbedUrl: (url) => {
        const drawioEmbedUrl = normalizeDrawioEmbedUrl(url)
        set((state) => (state.drawioEmbedUrl === drawioEmbedUrl ? state : { drawioEmbedUrl }))
      },
    }),
    {
      name: 'marklab.drawio',
      storage: createElectronSettingsJsonStorage<DrawioSettingsPersistedState>('marklab.drawio'),
      version: 1,
      partialize: (state): DrawioSettingsPersistedState => ({
        drawioEditorMode: state.drawioEditorMode,
        drawioEmbedUrl: state.drawioEmbedUrl,
      }),
    },
  ),
)
