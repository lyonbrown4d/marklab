import { Client, type Metadata, Metadata as GrpcMetadata } from '@grpc/grpc-js'

import type {
  SyncRequest,
  SyncResponse,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import type {
  DocumentSessionClient,
  UnaryCall,
} from '@electron/services/knowledgeEngine/grpcWire.js'

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
): Promise<Response> => {
  const metadata = createSessionMetadata(sessionToken)

  return new Promise((resolve, reject) => {
    call.call(client, request, metadata, (error, response) => {
      if (error) {
        reject(error)
        return
      }

      resolve(response)
    })
  })
}

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
