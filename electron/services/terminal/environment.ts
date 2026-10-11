const utf8LocaleForPlatform = (platform: NodeJS.Platform): string =>
  platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8'

const hasUtf8Locale = (env: NodeJS.ProcessEnv): boolean =>
  [env.LC_ALL, env.LC_CTYPE, env.LANG].some((value) => /utf-?8/i.test(value ?? ''))

export const buildTerminalEnvironment = (
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv => {
  const terminalEnv: NodeJS.ProcessEnv = {
    ...env,
    COLORTERM: env.COLORTERM || 'truecolor',
    TERM: env.TERM || 'xterm-256color',
    TERM_PROGRAM: env.TERM_PROGRAM || 'Marklab',
  }

  if (platform !== 'win32' && !hasUtf8Locale(env)) {
    terminalEnv.LC_CTYPE = utf8LocaleForPlatform(platform)
  }

  return terminalEnv
}
