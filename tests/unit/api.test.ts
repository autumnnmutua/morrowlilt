import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ApiError,
  OfflineMutationError,
  apiGet,
  apiMutation,
} from '../../src/lib/api'

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  })
})

describe('browser API client', () => {
  it('validates successful response data at runtime', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ data: { count: 'wrong' } }))),
    )

    await expect(
      apiGet('/api/example', z.object({ count: z.number() })),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE_SCHEMA',
    } satisfies Partial<ApiError>)
  })

  it('blocks offline writes without pretending they succeeded', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiMutation('/api/checkin', z.object({ ok: z.boolean() }), {}, 'offline'),
    ).rejects.toBeInstanceOf(OfflineMutationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forwards cancellation to fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(
                new DOMException('The operation was aborted', 'AbortError'),
              ),
            )
          }),
      ),
    )
    const controller = new AbortController()
    const request = apiGet(
      '/api/example',
      z.object({ ok: z.boolean() }),
      controller.signal,
    )
    controller.abort()
    await expect(request).rejects.toHaveProperty('name', 'AbortError')
  })

  it('does not start a request when its signal is already cancelled', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()

    await expect(
      apiGet('/api/example', z.object({ ok: z.boolean() }), controller.signal),
    ).rejects.toHaveProperty('name', 'AbortError')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
