import { useMemo } from 'react'
import { getElectronRuntime } from '@/runtime/electron'
import { normalizeNavigableWebUrl } from '@/pages/web/webTabUrl'

export const useWebTabActions = (tabId: string) => {
  return useMemo(() => {
    const webTabs = getElectronRuntime().webTabs
    const request = { tabId }
    return {
      close: () => webTabs.close(request),
      goBack: () => webTabs.goBack(request),
      goForward: () => webTabs.goForward(request),
      navigate: (value: string) => {
        const url = normalizeNavigableWebUrl(value)
        return url ? webTabs.navigate({ tabId, url }) : Promise.reject(new Error('Invalid web URL'))
      },
      reload: () => webTabs.reload(request),
      stop: () => webTabs.stop(request),
    }
  }, [tabId])
}
