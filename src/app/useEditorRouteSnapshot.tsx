import { useContext, useMemo, type ReactNode } from 'react'
import { UNSAFE_LocationContext, UNSAFE_RouteContext } from 'react-router-dom'

// A retained surface must freeze its router matches together with its cache key.
// React Router exposes these contexts through UNSAFE exports; there is no public
// snapshot API. The deferred-loading integration test guards this upgrade boundary.
export const useEditorRouteSnapshot = (children: ReactNode) => {
  const route = useContext(UNSAFE_RouteContext)
  const location = useContext(UNSAFE_LocationContext)
  return useMemo(
    () => (
      <UNSAFE_RouteContext.Provider value={route}>
        <UNSAFE_LocationContext.Provider value={location}>
          {children}
        </UNSAFE_LocationContext.Provider>
      </UNSAFE_RouteContext.Provider>
    ),
    [children, route, location],
  )
}
