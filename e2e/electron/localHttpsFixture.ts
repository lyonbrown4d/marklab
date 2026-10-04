import { createHash, X509Certificate } from 'node:crypto'
import https from 'node:https'

// Public test-only localhost certificate and key. This identity is never used by the app.
const certificate = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUJvGSsq2Z1tnLzdJNsQk6xUFdXvYwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MTAwMzIxNDgxNFoXDTM2MDkz
MDIxNDgxNFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAlXzmmbYcg2jQirACS9Fi0JRuX+4h9OqdTy56O3Spyxul
+jo+dWcqiRVD1S2TnOPegpTKWWf+Qatx3Jyms3UMYFGctDRJj2kpwiqYx9mYy3F0
7cutepA6B+jumrumFfm6sHcCKK/sTmxwblnF3gsQjtHwjhRgN2sN0d3OveR0jdZS
QTJYaybF2u7ScTtMFOOyZ7AHZIaiIkxUA+TkPYzgJTGIZaubm2mr/oOywXTBKm9P
C4vhuO6sWb9gUaehW07+gEvTXy3YgwcDllvLMHmTAztRIReo2dm4fgEiOiOrdDFD
aiv7ASf2kQJdopvLAf5RdgAkLjmYofNct7GfkYSyzQIDAQABo28wbTAdBgNVHQ4E
FgQUziQHgxSo8yMrJyhdQA8t7lHY/agwHwYDVR0jBBgwFoAUziQHgxSo8yMrJyhd
QA8t7lHY/agwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAABGzYi9yuTqO/wZooDqHJiFE2cDc1oM
kSlyCY0T3b1WV86Ed4zAIZ2lvycl52AdvNjinRlo80fbNlLFZCdoGWGPamDv/x5/
KyzuZirj4HGv9C8OmZZEi8PPKBJpGEY9NEMNeRs6+tK6etjucr/LOHrlzQ5E3bx5
yn1BHDbZfWEM4LlLstQVDyUW80OFLGpWjmN6pq3lkwE9Y/QzMcJCVAnt00HCKq7T
V42ZUvP0mdwAxAjDju8IAtXN7JRKlLmP6LwLm9sE6/rblMyat0gOaAgpJcH9F6Jw
LOZUZU3eygG152WgW82kLAVkS5WvsRngJdhT7ZXjgInux6I7zmou9AA=
-----END CERTIFICATE-----`

const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCVfOaZthyDaNCK
sAJL0WLQlG5f7iH06p1PLno7dKnLG6X6Oj51ZyqJFUPVLZOc496ClMpZZ/5Bq3Hc
nKazdQxgUZy0NEmPaSnCKpjH2ZjLcXTty616kDoH6O6au6YV+bqwdwIor+xObHBu
WcXeCxCO0fCOFGA3aw3R3c695HSN1lJBMlhrJsXa7tJxO0wU47JnsAdkhqIiTFQD
5OQ9jOAlMYhlq5ubaav+g7LBdMEqb08Li+G47qxZv2BRp6FbTv6AS9NfLdiDBwOW
W8sweZMDO1EhF6jZ2bh+ASI6I6t0MUNqK/sBJ/aRAl2im8sB/lF2ACQuOZih81y3
sZ+RhLLNAgMBAAECggEAFAPGbEuHGHZu1Y1+ATYRC5Q+uEwN8oN8ecmN8WqhVoxm
dfuuY9G4TuUF/AOU1qtmc11bP7U+Gaohc0RAyEOiWz28xB6WwBjNz9gcNJsxwKt5
gw0uNlFxM6CVsdSbXCiKPRjyCmM45Gx9xoib3CrnFfg4mQ1UBJd/djCYfwbuLr86
9CU3/5ORzID/zDSRR0qwABvwEXzcCqwWqMOOOpGckqBG74WZkvAfl14ObtkZr9KJ
RG/dE+2ZpNik3tRTXByYcPGHTsDRdztgfmgHN/bgExWqXuOqKiKbcv4807a6GVmq
A2tuiMu8B4S+l6/YeT9uzrfYB+xFpUODx9OL8Ra+EQKBgQDEr5aRHyFzharZgssP
NZHe66lDZoHIbb84vp02V9vul6zipJgBwjqI1odjrJIDl57AWhuv1PBqdOwA8QGj
dGtRBH8p7XURq+EG2id87aXPEX1j1R1Htr2SVX6r7OZbTNXMaY5XhZpzrjAQKKYk
7eajAr7OIpLKsB4Lpt0iA82EbwKBgQDCkZCIQYfKYDtAAVVGmfZQvP2yXjD1BtIT
dz2YPu6f+Q0t6NsCM3XIksGsVko8ybwaaZibRsJ2GpipV27idvnLqfR87z97Beub
RyOv3GurEaq09B8l4QkUrzWj39PDh0qP3d/70Uy4C4buUJOnwhglial3+RZmvMdm
ITn8qOfygwKBgEggX+Wt9dVoQiPri81zBqAp6XNXBubaIBKODBbelz9ijbq7Qyb5
8/80NIf/w7ffhQ7ivF55hwRzBgy+VKx9R9F5Baz5cEHftvCNVYfBmllZ/5J5l3gx
8kjUY1Rm1n7KqWiBmPpNeztKuENktLC8MSS8H/51vUDo3svFEDimDlqvAoGBAJhV
fbKgk99oDpujL4/yVT6LaZnwUyZUa7/f2PLNOuk3BhGOwYHspmgeNtJmUQNc8xA+
4sOX2AK9+g6DrQZUHmlNrGTwsGPyk6/kN9Wlnwq171Bz3bs7gG+Yakfeo57v2vne
vlIbYZSrOb52idSLi3pAWNXcyKQxY3DbzNm7qLZfAoGAaCmdXx+5Efo9XJlOvfd/
luC2r/MLDgaS0qnlRg9Fw8K5b2dlvmD4zpC/LRwb+hhTYhk69oQOVS7EZyhzvkXD
8/vZHPPLhmiGs7KwnK0T2agivQNSI4kAjNdP0ayaTU8O/MEIvI+onCXqFvprJ5mT
/zxtTmZClfZ1UndKA2Whci0=
-----END PRIVATE KEY-----`

const spkiFingerprint = createHash('sha256')
  .update(new X509Certificate(certificate).publicKey.export({ format: 'der', type: 'spki' }))
  .digest('base64')

export const startLocalHttpsFixture = () =>
  new Promise<{
    close: () => Promise<void>
    spkiFingerprint: string
    url: string
  }>((resolve, reject) => {
    const server = https.createServer(
      { cert: certificate, key: privateKey },
      (request, response) => {
        const title = request.url === '/second' ? 'Second local page' : 'First local page'
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/html; charset=utf-8',
        })
        response.end(
          `<!doctype html><html><head><title>${title}</title></head><body>${title}</body></html>`,
        )
      },
    )
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to determine HTTPS fixture address'))
        return
      }
      resolve({
        close: () =>
          new Promise<void>((done, fail) =>
            server.close((error) => (error ? fail(error) : done())),
          ),
        spkiFingerprint,
        url: `https://127.0.0.1:${address.port}`,
      })
    })
  })
