import type Sqlite from 'better-sqlite3'

type SqlitePragmaOptions = {
  busyTimeoutMs: number
  foreignKeys?: boolean
  journalMode?: 'memory' | 'wal'
  synchronous?: 'full' | 'normal'
}

export const configureSqlitePragmas = (
  database: Sqlite.Database,
  options: SqlitePragmaOptions,
): void => {
  const timeout = Math.max(0, Math.trunc(options.busyTimeoutMs))
  database.pragma(`busy_timeout = ${timeout}`)
  if (options.journalMode === 'wal') database.pragma('journal_mode = WAL')
  if (options.journalMode === 'memory') database.pragma('journal_mode = MEMORY')
  if (options.foreignKeys) database.pragma('foreign_keys = ON')
  if (options.synchronous === 'normal') database.pragma('synchronous = NORMAL')
  if (options.synchronous === 'full') database.pragma('synchronous = FULL')
}
