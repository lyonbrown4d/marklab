import { parsePath } from 'react-router-dom'
import { documentAtRoute } from '@/features/workbench/workbenchState'

// HashRouter percent-encodes filenames when a native pane updates the URL.
// Compare document identities while retaining view, query, and fragment identity.
export const sameDockRoute = (left: string | null | undefined, right: string): boolean => {
  if (left === right) return true
  if (!left) return false
  const leftDocument = documentAtRoute(left)
  const rightDocument = documentAtRoute(right)
  if (!leftDocument || !rightDocument) return false
  const leftLocation = parsePath(left)
  const rightLocation = parsePath(right)
  return (
    leftDocument.path === rightDocument.path &&
    leftDocument.view === rightDocument.view &&
    leftLocation.search === rightLocation.search &&
    leftLocation.hash === rightLocation.hash
  )
}
