import type Sqlite from 'better-sqlite3'
import type { Compilable } from 'kysely'

export const getCompiledQuery = <Row>(
  database: Sqlite.Database,
  query: Compilable<Row>,
): Row | undefined => {
  const compiled = query.compile()
  return database.prepare<unknown[], Row>(compiled.sql).get(...compiled.parameters)
}

export const allCompiledQuery = <Row>(database: Sqlite.Database, query: Compilable<Row>): Row[] => {
  const compiled = query.compile()
  return database.prepare<unknown[], Row>(compiled.sql).all(...compiled.parameters)
}

export const runCompiledQuery = (
  database: Sqlite.Database,
  query: Compilable<unknown>,
): Sqlite.RunResult => {
  const compiled = query.compile()
  return database.prepare<unknown[]>(compiled.sql).run(...compiled.parameters)
}
