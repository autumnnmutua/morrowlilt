export type ExternalErrorCode =
  | 'EXTERNAL_ABORTED'
  | 'EXTERNAL_HTTP_ERROR'
  | 'EXTERNAL_INVALID_JSON'
  | 'EXTERNAL_INVALID_PAYLOAD'
  | 'EXTERNAL_RESPONSE_TOO_LARGE'
  | 'EXTERNAL_TIMEOUT'
  | 'EXTERNAL_UNAVAILABLE'

export class ExternalServiceError extends Error {
  readonly code: ExternalErrorCode
  readonly retryable: boolean
  readonly status?: number

  constructor(
    code: ExternalErrorCode,
    message: string,
    retryable: boolean,
    status?: number,
  ) {
    super(message)
    this.name = 'ExternalServiceError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }
}

type FetchJsonPolicy<T> = {
  operation: string
  timeoutMs?: number
  maxAttempts?: number
  maxResponseBytes?: number
  validate: (value: unknown) => value is T
}

async function readBoundedJson(
  response: Response,
  maxResponseBytes: number,
): Promise<unknown> {
  const announcedLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(announcedLength) && announcedLength > maxResponseBytes) {
    throw new ExternalServiceError(
      'EXTERNAL_RESPONSE_TOO_LARGE',
      'External response exceeded the configured limit',
      false,
      response.status,
    )
  }

  if (!response.body) {
    throw new ExternalServiceError(
      'EXTERNAL_INVALID_JSON',
      'External response body was empty',
      false,
      response.status,
    )
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const result = await reader.read()
    if (result.done) break
    const chunk: unknown = result.value
    if (!(chunk instanceof Uint8Array)) {
      await reader.cancel()
      throw new ExternalServiceError(
        'EXTERNAL_INVALID_PAYLOAD',
        'External response stream returned an invalid chunk',
        false,
        response.status,
      )
    }
    total += chunk.byteLength
    if (total > maxResponseBytes) {
      await reader.cancel()
      throw new ExternalServiceError(
        'EXTERNAL_RESPONSE_TOO_LARGE',
        'External response exceeded the configured limit',
        false,
        response.status,
      )
    }
    chunks.push(chunk)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown
  } catch {
    throw new ExternalServiceError(
      'EXTERNAL_INVALID_JSON',
      'External response was not valid JSON',
      false,
      response.status,
    )
  }
}

function toExternalError(
  error: unknown,
  timedOut: boolean,
): ExternalServiceError {
  if (error instanceof ExternalServiceError) return error
  if (timedOut) {
    return new ExternalServiceError(
      'EXTERNAL_TIMEOUT',
      'External request timed out',
      true,
    )
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ExternalServiceError(
      'EXTERNAL_ABORTED',
      'External request was aborted',
      false,
    )
  }
  return new ExternalServiceError(
    'EXTERNAL_UNAVAILABLE',
    'External service was unavailable',
    true,
  )
}

export async function fetchJsonWithPolicy<T>(
  input: string,
  init: RequestInit,
  policy: FetchJsonPolicy<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const timeoutMs = policy.timeoutMs ?? 5_000
  const maxAttempts = policy.maxAttempts ?? 2
  const maxResponseBytes = policy.maxResponseBytes ?? 128 * 1024
  let lastError: ExternalServiceError | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    let timedOut = false
    const abortFromParent = () => controller.abort(parentSignal?.reason)
    parentSignal?.addEventListener('abort', abortFromParent, { once: true })
    if (parentSignal?.aborted) controller.abort(parentSignal.reason)
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort('timeout')
    }, timeoutMs)

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      })
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500
        throw new ExternalServiceError(
          'EXTERNAL_HTTP_ERROR',
          'External service returned an error response',
          retryable,
          response.status,
        )
      }
      const value = await readBoundedJson(response, maxResponseBytes)
      if (!policy.validate(value)) {
        throw new ExternalServiceError(
          'EXTERNAL_INVALID_PAYLOAD',
          'External response did not match the expected schema',
          false,
          response.status,
        )
      }
      return value
    } catch (error) {
      lastError = toExternalError(error, timedOut)
      console.error(
        JSON.stringify({
          event: 'external_fetch_failed',
          operation: policy.operation,
          code: lastError.code,
          status: lastError.status,
          attempt,
          retryable: lastError.retryable,
        }),
      )
      if (!lastError.retryable || attempt === maxAttempts) throw lastError
    } finally {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abortFromParent)
    }

    await new Promise((resolve) => setTimeout(resolve, 100 * attempt))
  }

  throw (
    lastError ??
    new ExternalServiceError(
      'EXTERNAL_UNAVAILABLE',
      'External service was unavailable',
      true,
    )
  )
}
