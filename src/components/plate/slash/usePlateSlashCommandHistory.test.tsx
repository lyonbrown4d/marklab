import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_STORAGE_KEYS } from '@/types/persistenceKeys'
import { usePlateSlashCommandHistory } from '@/components/plate/slash/usePlateSlashCommandHistory'

describe('usePlateSlashCommandHistory', () => {
  beforeEach(() => localStorage.clear())

  it('keeps the most recently executed unique commands in bounded order', () => {
    const { result } = renderHook(() => usePlateSlashCommandHistory())

    act(() => {
      result.current.record('quote')
      result.current.record('table')
      result.current.record('quote')
    })

    expect(result.current.recentKeys).toEqual(['quote', 'table'])
    expect(
      JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.slashCommandHistory) ?? '[]'),
    ).toEqual(['quote', 'table'])
  })

  it('recovers from malformed persisted values', () => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.slashCommandHistory, '{not-json')

    const { result } = renderHook(() => usePlateSlashCommandHistory())

    expect(result.current.recentKeys).toEqual([])
  })
})
