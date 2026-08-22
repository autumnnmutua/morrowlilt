export class RequestValidationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'RequestValidationError'
    this.code = code
  }
}

export async function readBoundedRequestJson(
  request: Request,
  maxBytes = 4 * 1024,
): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new RequestValidationError(
      'CONTENT_TYPE_REQUIRED',
      'Content-Type must be application/json',
    )
  }
  const announcedLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(announcedLength) && announcedLength > maxBytes) {
    throw new RequestValidationError(
      'REQUEST_TOO_LARGE',
      'Request body is too large',
    )
  }
  if (!request.body) {
    throw new RequestValidationError('INVALID_JSON', 'JSON body is required')
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    const chunk: unknown = result.value
    if (!(chunk instanceof Uint8Array)) {
      await reader.cancel()
      throw new RequestValidationError(
        'INVALID_JSON',
        'Request body stream is invalid',
      )
    }
    total += chunk.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new RequestValidationError(
        'REQUEST_TOO_LARGE',
        'Request body is too large',
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
    throw new RequestValidationError(
      'INVALID_JSON',
      'Request body is invalid JSON',
    )
  }
}
