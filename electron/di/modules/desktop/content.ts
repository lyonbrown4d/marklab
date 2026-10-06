import path from 'node:path'
import { ContainerModule } from 'inversify'

import { TOKENS } from '@electron/di/tokens'
import { ExportService } from '@electron/services/export/exportService'
import { LanguageIntelligenceService } from '@electron/services/languageIntelligence/service'
import { LinkPreviewService } from '@electron/services/linkPreview/service'
import { defaultLinkPreviewLookup } from '@electron/services/linkPreview/networkSecurity'
import { WebPreviewCapturePool } from '@electron/services/linkPreview/webPreviewCapturePool'
import { WebPreviewDiskCache } from '@electron/services/linkPreview/webPreviewDiskCache'

export const contentModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.languageIntelligenceService)
    .toResolvedValue(() => new LanguageIntelligenceService(), [])
    .inSingletonScope()
  bind(TOKENS.linkPreviewService)
    .toResolvedValue(
      (app, logger, WebContentsView) => {
        const cache = new WebPreviewDiskCache({
          logger: logger.child('web-preview-cache'),
          root: path.join(app.getPath('userData'), 'cache', 'web-previews'),
        })
        cache.startMaintenance()
        const captureService = new WebPreviewCapturePool({
          WebContentsView,
          cache,
          lookup: defaultLinkPreviewLookup,
          maxConcurrency: 2,
        })
        return new LinkPreviewService({ captureService, logger: logger.child('link-preview') })
      },
      [TOKENS.app, TOKENS.logger, TOKENS.WebContentsView],
    )
    .inSingletonScope()
  bind(TOKENS.exportService)
    .toResolvedValue(
      (BrowserWindow, logger, shell) =>
        new ExportService(shell, BrowserWindow, logger.child('export')),
      [TOKENS.BrowserWindow, TOKENS.logger, TOKENS.shell],
    )
    .inSingletonScope()
})
