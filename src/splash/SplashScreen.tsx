import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentLoadingLines } from '@/components/loading/DocumentLoadingLines'

export const SplashScreen = () => (
  <main className="grid h-full select-none grid-rows-[auto_1fr_auto] gap-[14px] px-[22px] pt-5 pb-[18px]">
    <header className="flex items-center gap-2.5">
      <picture>
        <source srcSet="./marklab-dark.svg" media="(prefers-color-scheme: dark)" />
        <img
          className="block size-8 drop-shadow-[0_8px_16px_hsl(var(--foreground)/0.1)]"
          src="./marklab-light.svg"
          alt=""
          aria-hidden="true"
        />
      </picture>
      <div className="grid gap-px">
        <strong className="text-[15px] leading-[1.2] font-[680] tracking-[-0.018em]">
          Marklab
        </strong>
        <span className="text-[10px] tracking-[0.035em] text-muted-foreground">
          LOCAL WORKSPACE
        </span>
      </div>
    </header>

    <Card
      className="relative gap-0 self-stretch overflow-hidden rounded-[9px] border-border py-0 shadow-[0_12px_32px_hsl(var(--foreground)/0.08)] before:absolute before:inset-y-0 before:left-3 before:w-px before:bg-border before:content-['']"
      data-splash-document
    >
      <CardHeader className="sr-only">
        <CardTitle>Preparing workspace</CardTitle>
        <CardDescription>Loading the initial document</CardDescription>
      </CardHeader>
      <CardContent className="flex h-full flex-col justify-center px-4 py-3">
        <DocumentLoadingLines />
      </CardContent>
    </Card>

    <p
      className="m-0 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span
        className="size-[5px] flex-none rounded-full bg-muted-foreground shadow-[0_0_0_3px_hsl(var(--muted-foreground)/0.14)]"
        aria-hidden="true"
      />
      <span>Preparing workspace…</span>
    </p>
  </main>
)
