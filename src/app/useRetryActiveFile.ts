import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { nextEditorLoadRouteState } from '@/app/useEditorBuffer'

export const useRetryActiveFile = () => {
  const location = useLocation()
  const navigate = useNavigate()

  return useCallback(() => {
    navigate(
      { hash: location.hash, pathname: location.pathname, search: location.search },
      { replace: true, state: nextEditorLoadRouteState(location.state) },
    )
  }, [location.hash, location.pathname, location.search, location.state, navigate])
}
