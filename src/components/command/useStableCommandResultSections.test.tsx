import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStableCommandResultSections } from '@/components/command/useStableCommandResultSections'

type TestSection = { id: string; rows: Array<{ id: string }> }

describe('useStableCommandResultSections', () => {
  it('appends async arrivals without moving retained results for the same query', () => {
    const { result, rerender } = renderHook(
      ({ key, sections }: { key: string; sections: TestSection[] }) =>
        useStableCommandResultSections(key, sections),
      {
        initialProps: {
          key: 'all:guide',
          sections: [{ id: 'mixed', rows: [{ id: 'file:a' }, { id: 'text:a' }] }],
        },
      },
    )
    expect(result.current[0].rows.map((row) => row.id)).toEqual(['file:a', 'text:a'])

    rerender({
      key: 'all:guide',
      sections: [{ id: 'mixed', rows: [{ id: 'text:new' }, { id: 'text:a' }, { id: 'file:a' }] }],
    })

    expect(result.current[0].rows.map((row) => row.id)).toEqual(['file:a', 'text:a', 'text:new'])
  })

  it('accepts fresh ranking when the query changes', () => {
    const { result, rerender } = renderHook(
      ({ key, sections }: { key: string; sections: TestSection[] }) =>
        useStableCommandResultSections(key, sections),
      {
        initialProps: {
          key: 'all:guide',
          sections: [{ id: 'mixed', rows: [{ id: 'file:a' }, { id: 'text:a' }] }],
        },
      },
    )

    rerender({
      key: 'all:new',
      sections: [{ id: 'mixed', rows: [{ id: 'text:a' }, { id: 'file:a' }] }],
    })

    expect(result.current[0].rows.map((row) => row.id)).toEqual(['text:a', 'file:a'])
  })
})
