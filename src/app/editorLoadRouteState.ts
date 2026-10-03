const LOAD_GENERATION_KEY = 'editorLoadGeneration'

const routeStateRecord = (state: unknown): Record<string, unknown> =>
  typeof state === 'object' && state !== null && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {}

export const editorLoadGenerationFromState = (state: unknown) => {
  const generation = routeStateRecord(state)[LOAD_GENERATION_KEY]
  return typeof generation === 'number' && Number.isSafeInteger(generation) && generation >= 0
    ? generation
    : 0
}

export const nextEditorLoadRouteState = (state: unknown): Record<string, unknown> => ({
  ...routeStateRecord(state),
  [LOAD_GENERATION_KEY]: editorLoadGenerationFromState(state) + 1,
})
