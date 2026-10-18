import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

// Read only the isolated fixture database; no extra production inspection API.
export const sessionOwnerCount = (dataDirectory: string, owner: string): number => {
  const database = new DatabaseSync(path.join(dataDirectory, 'v1/tauri-storage/marklab.sqlite'), {
    readOnly: true,
  })
  try {
    const row = database
      .prepare('SELECT COUNT(*) AS count FROM window_sessions WHERE id=?')
      .get(owner)
    if (!row || typeof row.count !== 'number') throw new Error('Invalid native session metadata')
    return row.count
  } finally {
    database.close()
  }
}
