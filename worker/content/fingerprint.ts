import type { DailyContentPayload } from '../providers/contracts'

function semanticText(payload: DailyContentPayload): string {
  return [
    payload.sentence.english,
    ...payload.vocabulary.flatMap((item) => [
      item.term,
      item.definition,
      item.example,
    ]),
    ...(payload.practicalExpressions ?? []).flatMap((item) => [
      item.expression,
      item.coreMeaning,
      ...item.scenarios.map((scenario) => scenario.example),
    ]),
    payload.topic.prompt,
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function getContentTokens(payload: DailyContentPayload): Set<string> {
  return new Set(
    semanticText(payload)
      .split(' ')
      .filter((token) => token.length >= 3),
  )
}

export async function computeContentFingerprint(
  payload: DailyContentPayload,
): Promise<string> {
  return sha256(semanticText(payload))
}

export function contentSimilarity(
  left: DailyContentPayload,
  right: DailyContentPayload,
): number {
  const leftTokens = getContentTokens(left)
  const rightTokens = getContentTokens(right)
  const union = new Set([...leftTokens, ...rightTokens])
  if (union.size === 0) return 1
  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1
  }
  return intersection / union.size
}

export function secureRandomIndex(length: number): number {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Random selection requires at least one candidate')
  }
  const max = Math.floor(0x1_0000_0000 / length) * length
  const values = new Uint32Array(1)
  do {
    crypto.getRandomValues(values)
  } while (values[0] >= max)
  return values[0] % length
}
