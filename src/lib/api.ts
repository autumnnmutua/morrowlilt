import type { ZodType } from 'zod'

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export class OfflineMutationError extends ApiError {
  constructor() {
    super(
      '当前处于离线状态，操作未保存。请联网后重试。',
      'OFFLINE_WRITE_BLOCKED',
      0,
    )
    this.name = 'OfflineMutationError'
  }
}

type ApiRequestOptions<T> = Omit<RequestInit, 'signal'> & {
  envelope?: boolean
  schema: ZodType<T>
  signal?: AbortSignal
  timeoutMs?: number
}

function abortError(signal?: AbortSignal): DOMException {
  return signal?.reason instanceof DOMException
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError')
}

function isMutation(method: string | undefined): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes((method ?? 'GET').toUpperCase())
}

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export async function apiRequest<T>(
  input: string,
  options: ApiRequestOptions<T>,
): Promise<T> {
  if (isMutation(options.method) && navigator.onLine === false) {
    throw new OfflineMutationError()
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(
    () =>
      controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    options.timeoutMs ?? 15_000,
  )
  const onExternalAbort = () => controller.abort(abortError(options.signal))
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const headers = new Headers(options.headers)
    headers.set('accept', 'application/json')
    headers.set('x-requested-with', 'morrowlilt-web')
    const response = await fetch(input, {
      ...options,
      credentials: 'same-origin',
      headers,
      signal: controller.signal,
    })
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ApiError(
        '服务返回了无法读取的数据',
        'INVALID_JSON_RESPONSE',
        response.status,
      )
    }

    if (!response.ok) {
      const error = body as { error?: { code?: unknown; message?: unknown } }
      throw new ApiError(
        typeof error.error?.message === 'string'
          ? error.error.message
          : `请求失败（${response.status}）`,
        typeof error.error?.code === 'string'
          ? error.error.code
          : 'REQUEST_FAILED',
        response.status,
      )
    }

    const envelope = body as { data?: unknown }
    const parsed = options.schema.safeParse(
      options.envelope === false ? body : envelope.data,
    )
    if (!parsed.success) {
      throw new ApiError(
        '服务返回的数据结构不符合预期',
        'INVALID_RESPONSE_SCHEMA',
        502,
      )
    }
    return parsed.data
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}

export function apiGet<T>(
  input: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  return apiRequest(input, { schema, signal, timeoutMs })
}

export function apiGetRaw<T>(
  input: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest(input, { envelope: false, schema, signal })
}

export function apiMutation<T>(
  input: string,
  schema: ZodType<T>,
  body: unknown,
  idempotencyPrefix: string,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest(input, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': createIdempotencyKey(idempotencyPrefix),
    },
    body: JSON.stringify(body),
    schema,
    signal,
  })
}
