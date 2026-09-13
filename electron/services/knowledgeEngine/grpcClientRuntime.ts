import {
  Client,
  type CallOptions,
  type ClientUnaryCall,
  type Metadata,
  Metadata as GrpcMetadata,
  type ServiceError,
  status,
} from '@grpc/grpc-js'

import type {
  SyncRequest,
  SyncResponse,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type {
  DocumentSessionClient,
  UnaryCall,
} from '@electron/services/knowledgeEngine/grpcWire.js'

const DEFAULT_UNARY_DEADLINE_MS = 12_000
const DEADLINE_FALLBACK_GRACE_MS = 100
const MAX_TIMER_DELAY_MS = 2_147_483_647

type GrpcErrorContext = {
  code?: unknown
  details?: unknown
}

export type InvokeUnaryOptions = CallOptions & {
  signal?: AbortSignal
}

const toError = (reason: unknown, fallbackMessage: string): Error => {
  if (reason instanceof Error) return reason

  const context =
    typeof reason === 'object' && reason !== null ? (reason as GrpcErrorContext) : undefined
  const reasonMessage =
    typeof context?.details === 'string'
      ? context.details
      : typeof reason === 'string'
        ? reason
        : undefined
  const error = new Error(reasonMessage ? `${fallbackMessage} ${reasonMessage}` : fallbackMessage)
  Object.assign(error, { cause: reason })
  if (context?.code !== undefined) {
    Object.assign(error, { code: context.code })
  }
  if (context?.details !== undefined) {
    Object.assign(error, { details: context.details })
  }
  return error
}

const createGrpcLifecycleError = (
  name: string,
  code: number,
  details: string,
  cause?: unknown,
): Error =>
  Object.assign(new Error(details), {
    cause,
    code,
    details,
    name,
  })

const createCancellationError = (reason: unknown): Error => {
  if (reason instanceof Error && ('code' in reason || 'details' in reason)) {
    return reason
  }

  let reasonMessage: string | undefined
  if (reason instanceof Error) {
    reasonMessage = reason.message
  } else if (typeof reason === 'string') {
    reasonMessage = reason
  }
  const details = reasonMessage
    ? `Knowledge engine unary call was cancelled: ${reasonMessage}`
    : 'Knowledge engine unary call was cancelled.'
  return createGrpcLifecycleError('AbortError', status.CANCELLED, details, reason)
}

const createDeadlineError = (configuredDurationMs: number): Error =>
  createGrpcLifecycleError(
    'DeadlineExceededError',
    status.DEADLINE_EXCEEDED,
    `Knowledge engine unary call exceeded its deadline after ${Math.ceil(
      configuredDurationMs,
    )} ms.`,
  )

export const createSessionMetadata = (sessionToken: string): Metadata => {
  const metadata = new GrpcMetadata()
  metadata.set('x-marklab-session-token', sessionToken)
  return metadata
}

export const invokeUnary = <Request, Response>(
  sessionToken: string,
  client: Client,
  call: UnaryCall<Request, Response>,
  request: Request,
  options: InvokeUnaryOptions = {},
): Promise<Response> =>
  new Promise((resolve, reject) => {
    let abortSignal: AbortSignal | undefined
    let clientCall: ClientUnaryCall | undefined
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    let cancelRequested = false
    let clientCallCancelled = false
    let cancellationOutcome: Error | undefined

    const cleanup = () => {
      if (deadlineTimer !== undefined) {
        clearTimeout(deadlineTimer)
        deadlineTimer = undefined
      }
      if (abortSignal && onAbort) {
        abortSignal.removeEventListener('abort', onAbort)
      }
    }

    const resolveOnce = (response: Response) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(response)
    }

    const rejectOnce = (reason: unknown, fallbackMessage: string) => {
      if (settled) return
      const error = toError(reason, fallbackMessage)
      settled = true
      cleanup()
      reject(error)
    }

    const cancelClientCall = (outcome?: Error) => {
      if (!clientCall || clientCallCancelled) return
      clientCallCancelled = true
      try {
        clientCall.cancel()
      } catch (reason) {
        if (!outcome) return
        try {
          Object.assign(outcome, {
            cancelError: toError(reason, 'Knowledge engine unary call could not be cancelled.'),
          })
        } catch {
          // The selected lifecycle error remains the actionable outcome.
        }
      }
    }

    const rejectAndCancel = (error: Error) => {
      if (settled) return
      settled = true
      cancelRequested = true
      cancellationOutcome = error
      cleanup()
      cancelClientCall(error)
      reject(error)
    }

    const onAbort = () => {
      rejectAndCancel(createCancellationError(abortSignal?.reason))
    }

    try {
      const { signal, ...providedCallOptions } = options
      abortSignal = signal
      const startedAt = Date.now()
      const requestedDeadline =
        providedCallOptions.deadline ?? startedAt + DEFAULT_UNARY_DEADLINE_MS
      const deadlineTimestamp =
        requestedDeadline instanceof Date ? requestedDeadline.getTime() : requestedDeadline
      if (!Number.isFinite(deadlineTimestamp)) {
        throw new TypeError(
          'Knowledge engine unary deadline must be a valid Date or finite timestamp.',
        )
      }
      const configuredDurationMs = Math.max(0, deadlineTimestamp - startedAt)
      const callOptions: CallOptions = {
        ...providedCallOptions,
        deadline: deadlineTimestamp,
      }
      const metadata = createSessionMetadata(sessionToken)

      if (abortSignal?.aborted) {
        rejectAndCancel(createCancellationError(abortSignal.reason))
        return
      }

      abortSignal?.addEventListener('abort', onAbort, { once: true })
      const fallbackDelayMs = deadlineTimestamp - Date.now() + DEADLINE_FALLBACK_GRACE_MS
      if (fallbackDelayMs <= MAX_TIMER_DELAY_MS) {
        deadlineTimer = setTimeout(
          () => rejectAndCancel(createDeadlineError(configuredDurationMs)),
          Math.max(0, fallbackDelayMs),
        )
      }

      const callback = (error: ServiceError | null, response?: Response) => {
        if (error) {
          rejectOnce(error, 'Knowledge engine unary call failed.')
          return
        }
        if (response === undefined) {
          const message = 'Knowledge engine unary call completed without a response.'
          rejectOnce(new Error(message), message)
          return
        }
        resolveOnce(response)
      }

      clientCall = call.call(client, request, metadata, callOptions, callback)

      if (cancelRequested) cancelClientCall(cancellationOutcome)
    } catch (reason) {
      rejectOnce(reason, 'Knowledge engine unary call failed before it could start.')
    }
  })

export const syncOnce = (
  sessionToken: string,
  documentSession: DocumentSessionClient,
  request: SyncRequest,
): Promise<SyncResponse> => {
  const stream = documentSession.sync(createSessionMetadata(sessionToken))

  return new Promise((resolve, reject) => {
    let settled = false

    const resolveOnce = (response: SyncResponse) => {
      if (settled) return
      settled = true
      resolve(response)
    }
    const rejectOnce = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }

    stream.once('data', resolveOnce)
    stream.once('error', rejectOnce)
    stream.once('end', () => {
      rejectOnce(new Error('Knowledge document sync ended without a response.'))
    })
    stream.write(request)
    stream.end()
  })
}
