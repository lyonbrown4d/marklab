declare module 'better-sqlite3' {
  export type SqlitePrimitive = string | number | Buffer | null

  export type StatementResult = {
    changes: number
    lastInsertRowid: number | bigint
  }

  export interface Statement<TRow = unknown, TParams = Record<string, SqlitePrimitive>> {
    run(params?: TParams): StatementResult
    get(params?: TParams): TRow | undefined
    all(params?: TParams): TRow[]
  }

  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; fileMustExist?: boolean })
    pragma(pragma: string): unknown
    exec(source: string): this
    prepare<
      TRow = unknown,
      TParams extends Record<string, SqlitePrimitive> = Record<string, SqlitePrimitive>,
    >(source: string): Statement<TRow, TParams>
    transaction<T>(fn: () => T): () => T
    close(): void
  }

  const DatabaseConstructor: {
    new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean }): Database
  }

  export default DatabaseConstructor
}
