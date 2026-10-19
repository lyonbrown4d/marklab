import type { Plugin } from 'vite'
// eslint-disable-next-line no-restricted-imports -- Shared Node development configuration is outside renderer aliases.
import type { DevelopmentConfig } from './scripts/development-config.ts'

export const reactDevToolsPlugin = (configuration: DevelopmentConfig) =>
  ({
    name: 'marklab-react-devtools',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: () =>
        configuration.enabled
          ? [
              {
                tag: 'script',
                attrs: { src: configuration.origin },
                injectTo: 'head-prepend',
              },
            ]
          : [],
    },
  }) satisfies Plugin
