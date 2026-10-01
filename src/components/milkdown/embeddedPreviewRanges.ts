import type { Transaction } from '@milkdown/kit/prose/state'

export type TextblockRange = { from: number; to: number }

export const changedTextblockRanges = (transaction: Transaction): TextblockRange[] => {
  const ranges: TextblockRange[] = []
  const { doc } = transaction
  const addRange = (from: number, to: number) => {
    if (ranges.some((range) => range.from === from && range.to === to)) return
    ranges.push({ from, to })
  }
  const addTextblockAt = (position: number) => {
    const resolved = doc.resolve(Math.min(Math.max(position, 0), doc.content.size))
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth)
      if (!node.isTextblock) continue
      const from = resolved.before(depth)
      addRange(from, from + node.nodeSize)
      return
    }
  }

  transaction.mapping.maps.forEach((stepMap) => {
    stepMap.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
      addTextblockAt(newFrom)
      addTextblockAt(newTo)
      const scanFrom = Math.max(0, newFrom - 1)
      const scanTo = Math.min(doc.content.size, Math.max(newTo, newFrom + 1) + 1)
      if (scanFrom >= scanTo) return
      doc.nodesBetween(scanFrom, scanTo, (node, position) => {
        if (!node.isTextblock) return true
        addRange(position, position + node.nodeSize)
        return false
      })
    })
  })

  return ranges
    .sort((left, right) => left.from - right.from)
    .reduce<TextblockRange[]>((merged, range) => {
      const previous = merged.at(-1)
      if (!previous || range.from > previous.to) {
        merged.push({ ...range })
      } else {
        previous.to = Math.max(previous.to, range.to)
      }
      return merged
    }, [])
}
