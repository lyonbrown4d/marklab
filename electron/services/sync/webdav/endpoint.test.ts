import { describe, expect, it } from 'vitest'

import { validateWebDavEndpoint } from '@electron/services/sync/webdav/endpoint.js'

describe('validateWebDavEndpoint', () => {
  it('normalizes an HTTPS origin and fixed base path', () => {
    expect(validateWebDavEndpoint('https://dav.example.com/remote.php/dav/', false)).toEqual({
      endpoint: 'https://dav.example.com',
      basePath: '/remote.php/dav',
    })
  })

  it.each([
    'http://localhost/dav',
    'http://127.9.8.7/dav',
    'http://10.2.3.4/dav',
    'http://172.31.2.3/dav',
    'http://192.168.2.3/dav',
    'http://[::1]/dav',
    'http://[fd12::1]/dav',
  ])('allows explicitly enabled insecure local endpoint %s', (endpoint) => {
    expect(validateWebDavEndpoint(endpoint, true).endpoint).toMatch(/^http:/)
  })

  it.each([
    'http://example.com/dav',
    'http://localhost/dav',
    'file:///tmp/dav',
    'javascript:alert(1)',
    'data:text/plain,secret',
    'https://user:secret@dav.example.com/dav',
    'https://dav.example.com/dav?token=secret',
    'https://dav.example.com/dav#fragment',
    'https://dav.example.com/dav\r\nX-Test:true',
  ])('rejects unsafe endpoint %s', (endpoint) => {
    expect(() => validateWebDavEndpoint(endpoint, false)).toThrow()
  })
})
