// @ts-expect-error Vitest runs this repository guard in Node; the renderer tsconfig intentionally omits Node module types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

const quotedKeys = (source: string) =>
  Array.from(source.matchAll(/'([^']+)'/g), (match) => match[1]).sort()

const pickBody = (source: string, typeName: string) => {
  const match = source.match(new RegExp(`export type ${typeName} = Pick<[\\s\\S]*?>`))
  if (!match) throw new Error(`Unable to find ${typeName}.`)
  return match[0]
}

const setBody = (source: string, exportName: string) => {
  const match = source.match(
    new RegExp(`export const ${exportName} = new Set\\(\\[[\\s\\S]*?\\]\\)`),
  )
  if (!match) throw new Error(`Unable to find ${exportName}.`)
  return match[0]
}

describe('settings persist boundary', () => {
  it('keeps renderer preference persisted fields allowed by Electron settings storage', () => {
    const rendererPreferences = fileText('../store/preferencesPersist.ts')
    const electronSettingsKeys = fileText('../../electron/services/settingsPersistKeys.ts')

    expect(quotedKeys(setBody(electronSettingsKeys, 'preferenceStateKeys'))).toEqual(
      quotedKeys(pickBody(rendererPreferences, 'PreferencesPersistedState')),
    )
  })
})
