import { createStore } from 'zustand/vanilla'
import type { MarkdownLanguageCodeAction } from '@/services/markdownLanguageApi'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'

export type PlateDiagnosticController = {
  key: string
  workspaceKey: string
  path: string
  content: string
  diagnostics: MarkdownSourceDiagnostic[]
  applyAction: (
    problem: MarkdownSourceDiagnostic,
    action: MarkdownLanguageCodeAction,
  ) => Promise<boolean>
  focus: (problem: MarkdownSourceDiagnostic) => boolean
  getActions: (problem: MarkdownSourceDiagnostic) => Promise<MarkdownLanguageCodeAction[]>
}

type PlateDiagnosticsState = {
  current: PlateDiagnosticController | null
}

export const plateDiagnosticsStore = createStore<PlateDiagnosticsState>(() => ({ current: null }))

export const publishPlateDiagnostics = (controller: PlateDiagnosticController) => {
  plateDiagnosticsStore.setState({ current: controller })
}

export const clearPlateDiagnostics = (key: string) => {
  if (plateDiagnosticsStore.getState().current?.key !== key) return
  plateDiagnosticsStore.setState({ current: null })
}
