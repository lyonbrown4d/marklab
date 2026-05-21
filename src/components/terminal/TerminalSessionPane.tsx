import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { terminalApi, type TerminalSessionInfo } from '@/services/terminalApi'
import type { ThemeMode } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { isDesktopRuntime } from '@/runtime/environment'
import {
  primeTerminalEventListeners,
  subscribeTerminalSessionEvents,
} from '@/components/terminal/terminalEvents'
import { readTerminalTheme } from '@/components/terminal/terminalTheme'

export type TerminalStatus = 'connecting' | 'connected' | 'exited' | 'error' | 'unavailable'

export type TerminalRuntimeState = {
  session: TerminalSessionInfo | null
  status: TerminalStatus
  error: string | null
}

type TerminalSessionPaneProps = {
  active: boolean
  exitedLabel: string
  restartKey: number
  statusLabel: string
  tabKey: string
  theme: ThemeMode
  visible: boolean
  onStateChange: (tabKey: string, state: TerminalRuntimeState) => void
}

function applyTerminalTheme(terminal: Terminal) {
  terminal.options.theme = readTerminalTheme()
  if (terminal.rows > 0) terminal.refresh(0, terminal.rows - 1)
}

export default function TerminalSessionPane({
  active,
  exitedLabel,
  restartKey,
  statusLabel,
  tabKey,
  theme,
  visible,
  onStateChange,
}: TerminalSessionPaneProps) {
  const activeAndVisible = active && visible
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const activeRef = useRef(activeAndVisible)
  const lastSizeRef = useRef<{ rows: number; cols: number } | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const [session, setSession] = useState<TerminalSessionInfo | null>(null)
  const [status, setStatus] = useState<TerminalStatus>(
    isDesktopRuntime() ? 'connecting' : 'unavailable',
  )
  const [error, setError] = useState<string | null>(null)

  const closeSession = useCallback(() => {
    const id = sessionIdRef.current
    sessionIdRef.current = null
    if (id) void terminalApi.close(id).catch(() => undefined)
  }, [])

  const fitAndFocusTerminal = useCallback(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) return

    fitAddon.fit()
    const id = sessionIdRef.current
    const nextSize = { cols: terminal.cols, rows: terminal.rows }
    const prevSize = lastSizeRef.current
    if (id && (!prevSize || prevSize.rows !== nextSize.rows || prevSize.cols !== nextSize.cols)) {
      lastSizeRef.current = nextSize
      void terminalApi.resize(id, nextSize.rows, nextSize.cols).catch(() => undefined)
    }
    terminal.focus()
  }, [])

  useEffect(() => {
    activeRef.current = activeAndVisible
  }, [activeAndVisible])

  useEffect(() => {
    onStateChange(tabKey, { session, status, error })
  }, [error, onStateChange, session, status, tabKey])

  useEffect(() => {
    if (!isDesktopRuntime()) {
      return
    }

    const container = containerRef.current
    if (!container) return

    let disposed = false
    let inputBuffer = ''
    let inputFlushTimer: number | null = null
    let outputFrame: number | null = null
    let outputQueue: string[] = []
    let unsubscribeTerminalEvents: (() => void) | null = null
    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      letterSpacing: 0,
      lineHeight: 1.24,
      scrollback: 10_000,
      theme: readTerminalTheme(),
    })
    const fitAddon = new FitAddon()
    const unicodeAddon = new Unicode11Addon()
    const webLinksAddon = new WebLinksAddon()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(unicodeAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.unicode.activeVersion = '11'
    terminal.open(container)
    fitAddon.fit()
    if (activeRef.current) terminal.focus()

    const flushOutput = () => {
      outputFrame = null
      if (disposed || outputQueue.length === 0) return

      const data = outputQueue.join('')
      outputQueue = []
      terminal.write(data)
    }

    const queueOutput = (data: string) => {
      outputQueue.push(data)
      if (outputFrame !== null) return

      outputFrame = window.requestAnimationFrame(flushOutput)
    }

    const flushInput = () => {
      inputFlushTimer = null
      if (disposed || inputBuffer.length === 0) return

      const id = sessionIdRef.current
      const data = inputBuffer
      inputBuffer = ''
      if (!id) return
      void terminalApi.write(id, data).catch((err) => {
        setError(String(err))
        setStatus('error')
      })
    }

    const resizeTerminal = () => {
      if (disposed || !activeRef.current) return
      fitAddon.fit()
      const id = sessionIdRef.current
      if (!id) return

      const nextSize = { cols: terminal.cols, rows: terminal.rows }
      const prevSize = lastSizeRef.current
      if (prevSize && prevSize.rows === nextSize.rows && prevSize.cols === nextSize.cols) return

      lastSizeRef.current = nextSize
      void terminalApi.resize(id, nextSize.rows, nextSize.cols).catch(() => undefined)
    }

    const scheduleResize = () => {
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current)
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null
        resizeTerminal()
      })
    }

    const resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(container)
    const dataDisposable = terminal.onData((data) => {
      inputBuffer += data
      if (inputFlushTimer !== null) return
      inputFlushTimer = window.setTimeout(flushInput, 0)
    })

    setSession(null)
    setError(null)
    setStatus('connecting')
    primeTerminalEventListeners()
    void terminalApi
      .create(terminal.rows, terminal.cols)
      .then((nextSession) => {
        if (disposed) {
          void terminalApi.close(nextSession.id).catch(() => undefined)
          return
        }
        unsubscribeTerminalEvents = subscribeTerminalSessionEvents(nextSession.id, {
          onExit: () => {
            if (disposed) return

            sessionIdRef.current = null
            setStatus('exited')
            if (outputFrame !== null) {
              window.cancelAnimationFrame(outputFrame)
              flushOutput()
            }
            terminal.writeln('')
            terminal.writeln(exitedLabel)
          },
          onOutput: (event) => {
            if (!disposed) queueOutput(event.data)
          },
        })
        sessionIdRef.current = nextSession.id
        setSession(nextSession)
        setStatus('connected')
        scheduleResize()
        if (activeRef.current) terminal.focus()
      })
      .catch((err) => {
        if (disposed) return
        setError(String(err))
        setStatus('error')
      })

    return () => {
      disposed = true
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      if (inputFlushTimer !== null) window.clearTimeout(inputFlushTimer)
      if (outputFrame !== null) window.cancelAnimationFrame(outputFrame)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      unsubscribeTerminalEvents?.()
      closeSession()
      terminal.dispose()
      fitAddonRef.current = null
      lastSizeRef.current = null
      terminalRef.current = null
    }
  }, [closeSession, exitedLabel, restartKey])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    const frame = window.requestAnimationFrame(() => {
      applyTerminalTheme(terminal)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [theme])

  useEffect(() => {
    if (!activeAndVisible) return
    const frame = window.requestAnimationFrame(fitAndFocusTerminal)
    return () => window.cancelAnimationFrame(frame)
  }, [activeAndVisible, fitAndFocusTerminal])

  return (
    <div
      aria-hidden={!activeAndVisible}
      className={cn(
        'absolute inset-0 min-h-0 bg-background',
        activeAndVisible ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0',
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {(status === 'error' || status === 'unavailable') && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 px-4 text-center text-sm text-muted-foreground backdrop-blur-sm">
          <div className="max-w-md">
            <p className="font-medium text-foreground">{statusLabel}</p>
            {error && <p className="mt-1 break-words text-xs">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
