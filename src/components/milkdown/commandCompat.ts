type MilkdownCommandCall = (key: unknown, ...args: unknown[]) => unknown

type MilkdownCommands = object

type MilkdownCommand = {
  key: unknown
}

export const callMilkdownCommand = (
  commands: MilkdownCommands | undefined | null,
  command: MilkdownCommand,
  ...args: unknown[]
): boolean => {
  if (!commands || typeof commands !== 'object') return false

  try {
    const commandKey = command.key
    const call = (commands as { call?: unknown }).call
    if (typeof call === 'function') {
      return Boolean((call as MilkdownCommandCall)(commandKey, ...args))
    }

    if (typeof commandKey !== 'string') return false

    const commandRunner = (commands as Record<string, unknown>)[commandKey]
    if (typeof commandRunner === 'function') {
      return Boolean(commandRunner(...args))
    }
  } catch {
    return false
  }

  return false
}
