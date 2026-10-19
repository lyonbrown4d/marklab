import { useId, type RefObject } from 'react'
import { useDebounce, useInViewport } from 'ahooks'
import { useQuery } from '@tanstack/react-query'
import { htmlPreviewApi } from '@/services/htmlPreviewApi'

export const useHtmlPreview = (source: string, ref: RefObject<HTMLElement | null>) => {
  const instance = useId()
  const debounced = useDebounce(source, { wait: 250 })
  const [inViewport] = useInViewport(ref)
  const visible = typeof IntersectionObserver !== 'function' || inViewport === true
  const query = useQuery({
    queryKey: ['html-preview', instance, debounced],
    queryFn: ({ signal }) => htmlPreviewApi.render(debounced, signal),
    enabled: visible && Boolean(debounced.trim()) && source === debounced,
    retry: false,
    gcTime: 0,
  })
  return { ...query, waiting: source !== debounced || !visible }
}
