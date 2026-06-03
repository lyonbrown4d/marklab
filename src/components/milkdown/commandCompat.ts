type MilkdownCommandCall = (key: string, ...args: unknown[]) => unknown

type MilkdownCommands = {
  call?: MilkdownCommandCall
  [commandKey: string]: unknown
}

type MilkdownCommand = {
  key: string
}

export const callMilkdownCommand = (
  commands: MilkdownCommands | undefined | null,
  command: MilkdownCommand,
  ...args: unknown[]
): boolean => {
  if (!commands || typeof commands !== 'object') return false

  try {
    if (typeof commands.call === 'function') {
      return Boolean(commands.call(command.key, ...args))
    }

    const commandRunner = commands[command.key]
    if (typeof commandRunner === 'function') {
      return Boolean(commandRunner(...args))
    }
  } catch {
    return false
  }

  return false
}
