import { useId, type RefObject } from 'react'
import { useDebounce, useInViewport } from 'ahooks'
import { useQuery } from '@tanstack/react-query'
import { plantumlApi } from '@/services/plantumlApi'

export const usePlantUmlPreview = (source: string, ref: RefObject<HTMLElement | null>) => {
  const instance = useId()
  const debounced = useDebounce(source, { wait: 250 })
  const [inViewport] = useInViewport(ref)
  const visible = typeof IntersectionObserver !== 'function' || inViewport === true
  const query = useQuery({
    queryKey: ['plantuml-preview', instance, debounced],
    queryFn: ({ signal }) => plantumlApi.render(debounced, signal),
    enabled: visible && Boolean(debounced.trim()) && source === debounced,
    gcTime: 0,
    staleTime: 20 * 60 * 1000,
    retry: false,
  })
  return { ...query, waiting: source !== debounced || !visible }
}
