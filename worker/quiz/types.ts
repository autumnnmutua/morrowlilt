export type QuestionType =
  | 'context_translation'
  | 'spelling'
  | 'cloze'
  | 'collocation_choice'
  | 'phrase_meaning'
  | 'mistake_retest'

export type QuizMode = 'mixed' | 'mistake_retest'

export type QuestionOption = { id: string; label: string }

export type AnswerAnalysis = {
  reasoning: string
  optionReasons?: Record<string, string>
  optionMeanings?: Record<string, string>
  optionOriginals?: Record<string, string>
}

export type PublicQuestion = {
  id: string
  bankQuestionId: string
  ordinal: number
  type: QuestionType
  prompt: string
  context?: string
  inputMode: 'choice' | 'text'
  options?: QuestionOption[]
  theme: string
  difficulty: 'C1' | 'C2'
  tags: string[]
  source: string
}

export type BankQuestion = Omit<PublicQuestion, 'id' | 'ordinal'> & {
  id: string
  standardAnswer: string
  acceptableAnswers: string[]
  explanation: string
  answerAnalysis: AnswerAnalysis
  errorReason: string
}

export type GeneratedQuiz = {
  seedHex: string
  fingerprint: string
  questions: BankQuestion[]
  degradedReason?: string
}

export type QuizSessionView = {
  id: string
  mode: QuizMode
  status: 'in_progress' | 'completed'
  questionFingerprint: string
  degradedReason?: string
  startedAt: string
  answeredQuestionIds: string[]
  questions: PublicQuestion[]
}

export type QuizReportItem = {
  questionId: string
  bankQuestionId: string
  ordinal: number
  type: QuestionType
  prompt: string
  theme: string
  response: string
  standardAnswer: string
  acceptableAnswers: string[]
  explanation: string
  responseExplanation: string
  eliminationSteps: string[]
  optionAnalyses: Array<{
    id: string
    label: string
    originalText: string
    meaningZh: string
    reason: string
    isCorrect: boolean
    isSelected: boolean
  }>
  isCorrect: boolean
  score: number
  durationMs: number
  errorReason?: string
}

export type QuizReport = {
  sessionId: string
  questionFingerprint: string
  degradedReason?: string
  score: number
  maxScore: number
  correctCount: number
  questionCount: number
  accuracy: number
  totalDurationMs: number
  byType: Array<{ key: QuestionType; correct: number; total: number }>
  byTheme: Array<{ key: string; correct: number; total: number }>
  errorReasons: Array<{ key: string; count: number }>
  weaknesses: string[]
  nextReviewSuggestion: string
  items: QuizReportItem[]
}
