import { LlamaEngine } from '@electron/services/ai/local/llamaEngine'
import type { LocalAiGenerationEvent } from '@electron/services/ai/local/types'
import {
  isLocalAiUtilityRequest,
  type LocalAiUtilityResponse,
} from '@electron/services/ai/local/utilityProtocol'

if (!process.parentPort) throw new Error('Local AI utility parent port is unavailable')

const engine = new LlamaEngine()
const controllers = new Map<string, AbortController>()

process.parentPort.on('message', (message) => {
  const request = message.data
  if (!isLocalAiUtilityRequest(request)) return
  if (request.type === 'shutdown') {
    controllers.forEach((controller) => controller.abort())
    void engine.dispose().finally(() => process.exit(0))
    return
  }
  if (request.type === 'cancel') {
    controllers.get(request.requestId)?.abort()
    return
  }
  void runGeneration(request.request)
})

const runGeneration = async (
  request: Extract<import('@electron/services/ai/local/types').LocalAiRuntimeRequest, object>,
): Promise<void> => {
  const controller = new AbortController()
  controllers.set(request.requestId, controller)
  send({ type: 'status', status: 'loading' })
  try {
    await engine.generate(request, (event) => send({ type: 'event', event }), controller.signal)
    send({ type: 'status', status: 'ready' })
  } catch (error) {
    const event: LocalAiGenerationEvent = controller.signal.aborted
      ? { requestId: request.requestId, type: 'cancelled' }
      : {
          requestId: request.requestId,
          type: 'error',
          message:
            error instanceof Error ? error.message.slice(0, 300) : 'Local AI generation failed',
        }
    send({ type: 'event', event })
  } finally {
    controllers.delete(request.requestId)
  }
}

const send = (response: LocalAiUtilityResponse): void => {
  process.parentPort?.postMessage(response)
}
