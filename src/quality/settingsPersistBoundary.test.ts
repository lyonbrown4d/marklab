import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const persistedPreferenceKeys = () => {
  const source = fileText('../store/preferencesPersist.ts')
  const pick = source.match(/export type PreferencesPersistedState = Pick<[\s\S]*?>/)
  if (!pick) throw new Error('PreferencesPersistedState is missing')
  return Array.from(pick[0].matchAll(/'([^']+)'/g), (match) => match[1]).sort()
}
const rustPreferenceKeys = () => {
  const source = fileText('../../src-tauri/src/settings/types.rs')
  const branch = source.match(/"marklab\.preferences"\s*=>\s*Ok\(&\[([\s\S]*?)\]\)/)
  if (!branch) throw new Error('Rust preference allowlist is missing')
  return Array.from(branch[1].matchAll(/"([^"]+)"/g), (match) => match[1]).sort()
}

describe('settings persist boundary', () => {
  it('allows exactly the renderer persisted preferences in native SQLite storage', () => {
    const keys = rustPreferenceKeys()
    expect(keys).toEqual(persistedPreferenceKeys())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('applies the allowlist when writing and scopes workspace sessions by their owner', () => {
    const storage = fileText('../../src-tauri/src/settings/mod.rs')
    const commands = fileText('../../src-tauri/src/settings/commands.rs')
    expect(storage).toContain('parsed.state.retain(|key, _| keys.contains(&key.as_str()))')
    expect(storage).toContain('self.write_session(session, parsed, None, true)')
    expect(commands).toContain('window.label()')
    expect(fileText('../../src-tauri/src/settings/tests.rs')).toContain(
      'windows_remain_isolated_and_old_saves_do_not_select_the_workspace',
    )
  })
})
