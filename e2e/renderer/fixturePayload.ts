export type FixturePayload = Record<string, unknown>

export const fixtureRecord = (value: unknown): FixturePayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Fixture requires an object DTO')
  return value as FixturePayload
}

export const fixtureText = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Fixture requires a string DTO field')
  return value
}
