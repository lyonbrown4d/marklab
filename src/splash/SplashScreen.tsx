import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentLoadingLines } from '@/components/loading/DocumentLoadingLines'

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
        <DocumentLoadingLines />
      </CardContent>
    </Card>

    <p className="splash-status" role="status" aria-live="polite">
      <span className="splash-status-dot" aria-hidden="true" />
      <span>Preparing workspace…</span>
    </p>
  </main>
)
