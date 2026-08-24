import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuizReportPanel } from '../../src/components/QuizExperience'
import type { QuizReport } from '../../src/quiz-types'

const report: QuizReport = {
  sessionId: 'fixture-session',
  questionFingerprint: 'fixture-fingerprint',
  score: 0,
  maxScore: 1,
  correctCount: 0,
  questionCount: 1,
  accuracy: 0,
  totalDurationMs: 2_000,
  byType: [{ key: 'phrase_meaning', correct: 0, total: 1 }],
  byTheme: [{ key: '健康', correct: 0, total: 1 }],
  errorReasons: [{ key: 'meaning_confusion', count: 1 }],
  weaknesses: ['phrase_meaning'],
  nextReviewSuggestion: '复习时间框架短语。',
  items: [
    {
      questionId: 'question-1',
      bankQuestionId: 'phrase-long-run',
      ordinal: 0,
      type: 'phrase_meaning',
      prompt: '选择短语 in the long run 的准确含义。',
      theme: '健康',
      response: '立即',
      standardAnswer: '从长远来看',
      acceptableAnswers: ['b'],
      explanation: 'in the long run 用于讨论长期结果。',
      responseExplanation: 'immediately 不符合句中的长期时间框架。',
      eliminationSteps: [],
      optionAnalyses: [
        {
          id: 'a',
          label: '立即',
          originalText: 'immediately',
          meaningZh: '立即',
          reason: '句子讨论的是长期结果，因此可以排除。',
          isCorrect: false,
          isSelected: true,
        },
        {
          id: 'b',
          label: '从长远来看',
          originalText: 'in the long run',
          meaningZh: '从长远来看',
          reason: '符合句意和考查点。',
          isCorrect: true,
          isSelected: false,
        },
      ],
      isCorrect: false,
      score: 0,
      durationMs: 2_000,
      errorReason: 'meaning_confusion',
    },
  ],
}

describe('QuizReportPanel', () => {
  it('pairs every original English option with its Chinese meaning', () => {
    render(
      <QuizReportPanel
        onDeleted={vi.fn()}
        onNavigate={vi.fn()}
        onReset={vi.fn()}
        report={report}
      />,
    )

    expect(screen.getByText('immediately')).toBeInTheDocument()
    expect(screen.getByText('in the long run')).toBeInTheDocument()
    expect(screen.getAllByText('立即').length).toBeGreaterThan(0)
    expect(screen.getAllByText('从长远来看').length).toBeGreaterThan(0)
  })
})
