import { questionBank } from './bank'
import type {
  BankQuestion,
  GeneratedQuiz,
  QuestionType,
  QuizMode,
} from './types'

export function createSeedHex(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function seedNumber(seedHex: string, attempt: number): number {
  let value = (0x9e3779b9 ^ attempt) >>> 0
  for (let index = 0; index < seedHex.length; index += 8) {
    value ^= Number.parseInt(seedHex.slice(index, index + 8), 16) >>> 0
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0
  }
  return value || 0x6d2b79f5
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], next: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(next() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function selectQuestions(
  seedHex: string,
  attempt: number,
  count: number,
  types: QuestionType[],
  mode: QuizMode,
  mistakeIds: string[],
): { questions: BankQuestion[]; degradedReason?: string } {
  const next = random(seedNumber(seedHex, attempt))
  if (mode === 'mistake_retest') {
    const mistakes = shuffle(
      questionBank.filter((question) => mistakeIds.includes(question.id)),
      next,
    )
    const chosen = mistakes.slice(0, count).map((question) => ({
      ...question,
      type: 'mistake_retest' as const,
    }))
    if (chosen.length === count) return { questions: chosen }
    const fillers = shuffle(
      questionBank.filter(
        (question) => !chosen.some((item) => item.id === question.id),
      ),
      next,
    ).slice(0, count - chosen.length)
    return {
      questions: [...chosen, ...fillers],
      degradedReason: 'INSUFFICIENT_MISTAKES_FILLED_FROM_BANK',
    }
  }

  const eligible = questionBank.filter((question) =>
    types.includes(question.type),
  )
  const shuffled = shuffle(eligible, next)
  const selected: BankQuestion[] = []
  const perType = new Map<QuestionType, number>()
  for (const question of shuffled) {
    const current = perType.get(question.type) ?? 0
    if (
      current === 0 ||
      selected.length + (types.length - perType.size) >= count
    ) {
      selected.push(question)
      perType.set(question.type, current + 1)
    }
    if (selected.length === count) break
  }
  for (const question of shuffled) {
    if (selected.length === count) break
    if (!selected.some((item) => item.id === question.id))
      selected.push(question)
  }
  return {
    questions: selected,
    degradedReason:
      selected.length < count ? 'INSUFFICIENT_QUESTION_BANK' : undefined,
  }
}

export async function questionFingerprint(
  mode: QuizMode,
  questions: BankQuestion[],
): Promise<string> {
  return sha256(`${mode}|${questions.map((question) => question.id).join('|')}`)
}

export async function generateQuiz(input: {
  seedHex: string
  count: number
  types: QuestionType[]
  mode: QuizMode
  recentFingerprints: string[]
  mistakeIds?: string[]
}): Promise<GeneratedQuiz> {
  let last: GeneratedQuiz | undefined
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const selected = selectQuestions(
      input.seedHex,
      attempt,
      input.count,
      input.types,
      input.mode,
      input.mistakeIds ?? [],
    )
    const fingerprint = await questionFingerprint(
      input.mode,
      selected.questions,
    )
    last = {
      seedHex: input.seedHex,
      fingerprint,
      questions: selected.questions,
      degradedReason: selected.degradedReason,
    }
    if (!input.recentFingerprints.includes(fingerprint)) return last
  }
  if (!last) throw new Error('Question generator did not produce a candidate')
  return { ...last, degradedReason: 'RECENT_FINGERPRINT_SPACE_EXHAUSTED' }
}
