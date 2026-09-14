import { describe, expect, it, vi } from 'vitest'
import { callMilkdownCommand } from '@/components/milkdown/commandCompat'

describe('callMilkdownCommand', () => {
  it('preserves the private receiver of a Milkdown command manager', () => {
    const key = Symbol('heading')
    const payload = { level: 1 }
    class CommandManager {
      #key = key
      #payload = payload

      call(commandKey: unknown, value: unknown) {
        return commandKey === this.#key && value === this.#payload
      }
    }

    expect(callMilkdownCommand(new CommandManager(), { key }, payload)).toBe(true)
  })

  it('preserves the private receiver of a legacy named command', () => {
    class LegacyCommands {
      #expected = 'value'

      execute(value: string, count: number) {
        return value === this.#expected && count === 2
      }
    }

    expect(callMilkdownCommand(new LegacyCommands(), { key: 'execute' }, 'value', 2)).toBe(true)
  })

  it('prefers the manager call API and forwards its key and all arguments', () => {
    const call = vi.fn(() => 'handled')
    const execute = vi.fn(() => true)
    const commands = { call, execute }
    expect(callMilkdownCommand(commands, { key: 'execute' }, 'value', 2)).toBe(true)
    expect(call).toHaveBeenCalledWith('execute', 'value', 2)
    expect(call.mock.contexts[0]).toBe(commands)
    expect(execute).not.toHaveBeenCalled()
  })

  it('keeps a false command result without falling back to the legacy API', () => {
    const execute = vi.fn(() => true)
    expect(callMilkdownCommand({ call: () => false, execute }, { key: 'execute' })).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([null, undefined])('returns false for absent commands: %s', (commands) => {
    expect(callMilkdownCommand(commands, { key: 'execute' })).toBe(false)
  })

  it('returns false for unsupported command shapes', () => {
    expect(callMilkdownCommand({}, { key: Symbol('execute') })).toBe(false)
    expect(callMilkdownCommand({}, { key: 'execute' })).toBe(false)
    expect(callMilkdownCommand({ execute: true }, { key: 'execute' })).toBe(false)
  })

  it.each(['call', 'execute'])('keeps exceptions from %s contained', (method) => {
    const commands = {
      [method]: () => {
        throw new Error('Command unavailable')
      },
    }
    expect(callMilkdownCommand(commands, { key: 'execute' })).toBe(false)
  })
})
