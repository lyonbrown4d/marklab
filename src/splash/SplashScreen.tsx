import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type DocumentRowProps = {
  caret?: boolean
  marker: string
  width: string
}

const DocumentRow = ({ caret = false, marker, width }: DocumentRowProps) => (
  <div className="splash-document-row">
    <span className="splash-syntax">{marker}</span>
    <Skeleton className={width} data-splash-line />
    {caret ? <span className="splash-caret" aria-hidden="true" /> : null}
  </div>
)

export const SplashScreen = () => (
  <main className="splash-shell">
    <header className="splash-brand">
      <picture>
        <source srcSet="./marklab-dark.svg" media="(prefers-color-scheme: dark)" />
        <img className="splash-logo" src="./marklab-light.svg" alt="" aria-hidden="true" />
      </picture>
      <div className="splash-wordmark">
        <strong>Marklab</strong>
        <span>LOCAL WORKSPACE</span>
      </div>
    </header>

    <Card className="splash-document gap-0 py-0" data-splash-document>
      <CardHeader className="sr-only">
        <CardTitle>Preparing workspace</CardTitle>
        <CardDescription>Loading the initial document</CardDescription>
      </CardHeader>
      <CardContent className="splash-document-content">
        <DocumentRow marker="#" width="splash-line-title" />
        <DocumentRow marker="—" width="splash-line-body" />
        <DocumentRow caret marker="·" width="splash-line-short" />
      </CardContent>
    </Card>

    <p className="splash-status" role="status" aria-live="polite">
      <span className="splash-status-dot" aria-hidden="true" />
      <span>Preparing workspace…</span>
    </p>
  </main>
)
