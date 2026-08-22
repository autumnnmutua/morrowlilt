import type { BankQuestion } from './types'

export type ScoreResult = {
  normalizedResponse: string
  isCorrect: boolean
  score: number
  errorReason?: string
}

export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0]
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex]
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return row[right.length]
}

export function scoreAnswer(
  question: BankQuestion,
  response: string,
): ScoreResult {
  const normalizedResponse = normalizeAnswer(response)
  if (!normalizedResponse) {
    return {
      normalizedResponse,
      isCorrect: false,
      score: 0,
      errorReason: 'no_answer',
    }
  }
  const accepted = question.acceptableAnswers.map(normalizeAnswer)
  const exact = accepted.includes(normalizedResponse)
  const tolerant =
    question.inputMode === 'text' &&
    accepted.some(
      (answer) =>
        answer.length >= 8 && editDistance(answer, normalizedResponse) <= 1,
    )
  if (exact || tolerant) {
    return { normalizedResponse, isCorrect: true, score: 1 }
  }
  return {
    normalizedResponse,
    isCorrect: false,
    score: 0,
    errorReason: question.errorReason,
  }
}
