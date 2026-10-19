import { useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { spreadsheetApi, type SpreadsheetPageRequest } from '@/services/spreadsheetApi'

export const SPREADSHEET_PAGE_SIZE = 200

export const useSpreadsheetPage = (request: SpreadsheetPageRequest, enabled: boolean) => {
  const instanceId = useId()
  return useQuery({
    enabled,
    queryKey: ['spreadsheet-preview', instanceId, request],
    queryFn: ({ signal }) => spreadsheetApi.readPage(request, signal),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
}
