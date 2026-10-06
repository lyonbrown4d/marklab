import { ContainerModule } from 'inversify'

import type { OwnedResourceRegistry } from '@electron/di/ownedResourceRegistry'
import { TOKENS } from '@electron/di/tokens'
import { TerminalService } from '@electron/services/terminal/service'
import { WebTabManager } from '@electron/services/webTabs/webTabManager'

export const createNativeRuntimeModule = (ownedResources: OwnedResourceRegistry): ContainerModule =>
  new ContainerModule(({ bind }) => {
    bind(TOKENS.webTabManager)
      .toResolvedValue(
        (WebContentsView) => new WebTabManager({ WebContentsView }),
        [TOKENS.WebContentsView],
      )
      .inSingletonScope()
      .onActivation((_context, service) =>
        ownedResources.track(TOKENS.webTabManager, service, (owned) => owned.dispose()),
      )
    bind(TOKENS.terminalService)
      .toResolvedValue(
        (app, logger, workspaceRegistry) =>
          new TerminalService(
            (webContents) =>
              (webContents ? workspaceRegistry.terminalCwdForWebContents(webContents) : null) ||
              app.getPath('home'),
            logger.child('terminal'),
          ),
        [TOKENS.app, TOKENS.logger, TOKENS.workspaceRegistry],
      )
      .inSingletonScope()
      .onActivation((_context, service) =>
        ownedResources.track(TOKENS.terminalService, service, (owned) => owned.dispose()),
      )
  })
