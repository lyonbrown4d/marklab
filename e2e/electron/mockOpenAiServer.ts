import http from 'node:http'

type MockOpenAiServer = {
  baseUrl: string
  close: () => Promise<void>
}

const readRequestBody = (request: http.IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.once('error', reject)
  })

export const startMockOpenAiServer = () =>
  new Promise<MockOpenAiServer>((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'Not found' } }))
        return
      }

      try {
        await readRequestBody(request)
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            id: 'chatcmpl-marklab-e2e',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1_000),
            model: 'marklab-e2e',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Writing belongs in the content itself.',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 8,
              total_tokens: 20,
            },
          }),
        )
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'Invalid request' } }))
      }
    })

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to determine mock AI server address'))
        return
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()))
          }),
      })
    })
  })
