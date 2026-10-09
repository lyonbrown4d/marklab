export const updateTabMru = (
  currentMru: readonly string[],
  availableTabIds: readonly string[],
  activeTabId: string | null,
): string[] => {
  const available = new Set(availableTabIds)
  const retained = currentMru.filter((id) => available.has(id) && id !== activeTabId)
  const missing = availableTabIds.filter((id) => id !== activeTabId && !retained.includes(id))
  return activeTabId && available.has(activeTabId)
    ? [activeTabId, ...retained, ...missing]
    : [...retained, ...missing]
}

export const nextTabInMru = (
  mru: readonly string[],
  activeTabId: string | null,
  direction: 1 | -1,
): string | null => {
  if (mru.length === 0) return null
  const activeIndex = activeTabId ? mru.indexOf(activeTabId) : -1
  if (activeIndex < 0) return direction === 1 ? (mru[0] ?? null) : (mru.at(-1) ?? null)
  const nextIndex = (activeIndex + direction + mru.length) % mru.length
  return mru[nextIndex] ?? null
}
