import type { Value } from 'platejs'

export type PlateMarkdownWorkerRequest =
  | { id: number; operation: 'cancel' }
  | { id: number; markdown: string; operation: 'parse' }
  | { id: number; markdown: string; operation: 'parse-stream' }
  | { id: number; markdown: string; operation: 'prepare-stream' }
  | { id: number; operation: 'parse-next' }
  | { id: number; operation: 'serialize'; value: Value }

export type PlateMarkdownWorkerResponse =
  | { id: number; ok: true; operation: 'parse'; value: Value }
  | { done: boolean; id: number; ok: true; operation: 'parse-stream'; value: Value }
  | { id: number; ok: true; operation: 'prepare-stream' }
  | { id: number; markdown: string; ok: true; operation: 'serialize' }
  | {
      error: string
      id: number
      ok: false
      operation: 'parse' | 'parse-stream' | 'prepare-stream' | 'serialize'
    }
