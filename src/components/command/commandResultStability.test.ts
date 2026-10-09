import { describe, expect, it } from 'vitest'
import {
  mergeStableResultIds,
  orderByStableResultIds,
} from '@/components/command/commandResultStability'

describe('mergeStableResultIds', () => {
  it('preserves visible result order while appending async arrivals', () => {
    expect(mergeStableResultIds(['file:a', 'text:a'], ['text:a', 'text:b', 'file:a'])).toEqual([
      'file:a',
      'text:a',
      'text:b',
    ])
  })

  it('removes results no longer present without moving retained selections', () => {
    expect(mergeStableResultIds(['file:a', 'text:a', 'text:b'], ['text:b', 'file:a'])).toEqual([
      'file:a',
      'text:b',
    ])
  })

  it('keeps retained ranked results stable and appends async arrivals', () => {
    const next = [
      { id: 'text:new', score: 10 },
      { id: 'file:guide', score: 8 },
      { id: 'text:existing', score: 6 },
    ]

    expect(
      orderByStableResultIds(['file:guide', 'text:existing'], next, (result) => result.id),
    ).toEqual([
      { id: 'file:guide', score: 8 },
      { id: 'text:existing', score: 6 },
      { id: 'text:new', score: 10 },
    ])
  })
})
