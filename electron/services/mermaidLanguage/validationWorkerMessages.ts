import type {
  MermaidTextDocument,
  MermaidValidationIssue,
} from '@electron/services/mermaidLanguage/types'

export type MermaidValidationWorkerRequest =
  | {
      id: number
      type: 'validate'
      document: MermaidTextDocument
    }
  | {
      id: number
      type: 'cancel'
    }

export type MermaidValidationError = {
  message: string
  location?: {
    firstColumn: number
    firstLine: number
    lastColumn: number
    lastLine: number
  }
}

export type MermaidValidationWorkerResponse =
  | {
      id: number
      ok: true
      issues: readonly MermaidValidationIssue[]
    }
  | {
      id: number
      ok: false
      error: MermaidValidationError
    }
