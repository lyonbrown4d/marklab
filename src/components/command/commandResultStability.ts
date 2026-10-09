export const mergeStableResultIds = (
  previousIds: readonly string[],
  nextIds: readonly string[],
): string[] => {
  const available = new Set(nextIds)
  const retained = previousIds.filter((id) => available.delete(id))
  return [...retained, ...nextIds.filter((id) => available.has(id))]
}

export const orderByStableResultIds = <T>(
  previousIds: readonly string[],
  nextResults: readonly T[],
  getId: (result: T) => string,
): T[] => {
  const resultsById = new Map(nextResults.map((result) => [getId(result), result]))
  return mergeStableResultIds(previousIds, [...resultsById.keys()]).flatMap((id) => {
    const result = resultsById.get(id)
    return result === undefined ? [] : [result]
  })
}
