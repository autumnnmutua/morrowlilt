import { z } from 'zod'

const contentDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const nonEmpty = z.string().min(1)
const generatedField = z.object({
  text: nonEmpty,
  provider: nonEmpty,
  attribution: nonEmpty,
  originType: z.enum(['translated', 'ai_assisted', 'original']),
})

export const healthSchema = z.object({
  status: z.literal('ok'),
  service: nonEmpty,
  checks: z.object({ database: z.literal('ok') }).optional(),
})

const vocabularyItemSchema = z.object({
  kind: z.enum(['word', 'phrase', 'expression']),
  term: nonEmpty,
  partOfSpeech: nonEmpty.optional(),
  definition: nonEmpty,
  definitionZh: nonEmpty.optional(),
  example: nonEmpty,
  exampleZh: nonEmpty.optional(),
  usageNote: nonEmpty.optional(),
})

const practicalExpressionSchema = z.object({
  expression: nonEmpty,
  expressionType: z.enum([
    'phrase',
    'idiom',
    'response',
    'phrasal_verb',
    'slang',
  ]),
  partOfSpeech: nonEmpty,
  chineseMeanings: z.array(nonEmpty),
  coreMeaning: nonEmpty,
  usageNotes: z.array(nonEmpty),
  scenarios: z.array(
    z.object({
      label: nonEmpty,
      description: nonEmpty,
      example: nonEmpty,
      exampleZh: nonEmpty,
    }),
  ),
  pitfalls: z.array(nonEmpty),
  alternatives: z.array(z.object({ expression: nonEmpty, nuance: nonEmpty })),
  ieltsUse: nonEmpty,
})

export const dailyContentSchema = z.object({
  id: nonEmpty,
  contentDate,
  payload: z.object({
    schemaVersion: z.literal(2),
    contentDate,
    difficulty: z.enum(['C1', 'C2']),
    theme: z.enum([
      'learning',
      'campus',
      'technology',
      'environment',
      'work',
      'health',
      'city',
      'culture',
    ]),
    originType: z.enum(['original', 'ai_assisted', 'licensed']),
    generatorVersion: nonEmpty,
    sentence: z.object({
      english: nonEmpty,
      chinese: nonEmpty,
      grammarNotes: z.array(nonEmpty),
      usageNotes: z.array(nonEmpty),
      collocations: z.array(
        z.object({ expression: nonEmpty, meaning: nonEmpty }),
      ),
      alternatives: z.array(z.object({ expression: nonEmpty, note: nonEmpty })),
      microExercise: nonEmpty,
    }),
    vocabulary: z.array(vocabularyItemSchema),
    practicalExpressions: z.array(practicalExpressionSchema).optional(),
    topic: z.object({
      kind: z.enum(['speaking', 'writing']),
      prompt: nonEmpty,
      preparationPoints: z.array(nonEmpty),
    }),
  }),
  source: z.enum(['online', 'cache', 'seed']),
  sourceDate: contentDate.optional(),
  attribution: nonEmpty,
  provider: nonEmpty,
  sourceUrl: z.string().url().optional(),
  fingerprint: nonEmpty,
  generatorVersion: nonEmpty,
  createdAt: nonEmpty,
})

export const todaySchema = z.object({
  profile: z.object({
    id: nonEmpty,
    timeZone: nonEmpty,
    learningTrack: z.enum(['academic', 'general']),
    createdDate: contentDate,
  }),
  progress: z.object({
    profileId: nonEmpty,
    settledThroughDate: contentDate,
    version: z.number().int().nonnegative(),
  }),
  today: contentDate,
  learningState: z.enum(['unsettled', 'settled']),
  pendingDayCount: z.number().int().nonnegative(),
  totalItemCount: z.number().int().nonnegative(),
  days: z.array(dailyContentSchema),
  todayContent: dailyContentSchema,
})

const questionTypeSchema = z.enum([
  'context_translation',
  'spelling',
  'cloze',
  'collocation_choice',
  'phrase_meaning',
  'mistake_retest',
])

export const quizQuestionSchema = z.object({
  id: nonEmpty,
  bankQuestionId: nonEmpty,
  ordinal: z.number().int().nonnegative(),
  type: questionTypeSchema,
  prompt: nonEmpty,
  context: z.string().optional(),
  inputMode: z.enum(['choice', 'text']),
  options: z.array(z.object({ id: nonEmpty, label: nonEmpty })).optional(),
  theme: nonEmpty,
  difficulty: z.enum(['C1', 'C2']),
  tags: z.array(nonEmpty),
  source: nonEmpty,
})

export const quizSessionSchema = z.object({
  id: nonEmpty,
  mode: z.enum(['mixed', 'mistake_retest']),
  status: z.enum(['in_progress', 'completed']),
  questionFingerprint: nonEmpty,
  degradedReason: z.string().optional(),
  startedAt: nonEmpty,
  answeredQuestionIds: z.array(nonEmpty),
  questions: z.array(quizQuestionSchema),
})

const reportDimension = z.object({
  key: nonEmpty,
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
const reportTypeDimension = reportDimension.extend({ key: questionTypeSchema })
export const quizReportSchema = z.object({
  sessionId: nonEmpty,
  questionFingerprint: nonEmpty,
  degradedReason: z.string().optional(),
  score: z.number().nonnegative(),
  maxScore: z.number().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  questionCount: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
  totalDurationMs: z.number().int().nonnegative(),
  byType: z.array(reportTypeDimension),
  byTheme: z.array(reportDimension),
  errorReasons: z.array(
    z.object({ key: nonEmpty, count: z.number().int().nonnegative() }),
  ),
  weaknesses: z.array(nonEmpty),
  nextReviewSuggestion: nonEmpty,
  items: z.array(
    z.object({
      questionId: nonEmpty,
      bankQuestionId: nonEmpty,
      ordinal: z.number().int().nonnegative(),
      type: quizQuestionSchema.shape.type,
      prompt: nonEmpty,
      theme: nonEmpty,
      response: z.string(),
      standardAnswer: nonEmpty,
      acceptableAnswers: z.array(nonEmpty),
      explanation: nonEmpty,
      responseExplanation: nonEmpty,
      eliminationSteps: z.array(nonEmpty),
      isCorrect: z.boolean(),
      score: z.number().nonnegative(),
      durationMs: z.number().int().nonnegative(),
      errorReason: z.string().optional(),
    }),
  ),
})

export const mistakeListSchema = z.array(
  z.object({
    id: nonEmpty,
    bankQuestionId: nonEmpty,
    label: nonEmpty,
    theme: nonEmpty,
    status: z.enum(['active', 'mastered']),
    errorCount: z.number().int().nonnegative(),
    correctStreak: z.number().int().nonnegative(),
    mastery: z.number().min(0).max(100),
    nextReviewDate: contentDate,
  }),
)

const licenseSchema = z.object({
  name: nonEmpty,
  url: z.string().url().optional(),
})
export const dictionaryResultSchema = z.object({
  normalizedTerm: nonEmpty,
  entries: z.array(
    z.object({
      headword: nonEmpty,
      phonetic: z.string().optional(),
      chineseSummary: z.string().min(1).optional(),
      pronunciations: z.array(
        z.object({
          text: z.string().optional(),
          audioUrl: z
            .union([
              z.string().url(),
              z.string().startsWith('/api/dictionary/audio?src='),
            ])
            .optional(),
          sourceUrl: z.string().url().optional(),
          license: licenseSchema.optional(),
        }),
      ),
      forms: z.array(z.string()),
      inflections: z.array(z.object({ form: nonEmpty, label: nonEmpty })),
      origin: z.string().optional(),
      partsOfSpeech: z.array(
        z.object({
          label: nonEmpty,
          senses: z.array(
            z.object({
              definition: nonEmpty,
              definitionSourceType: z.literal('dictionary'),
              translatedDefinition: generatedField.optional(),
              examples: z.array(
                z.object({
                  text: nonEmpty,
                  sourceType: z.literal('dictionary'),
                  translation: generatedField.optional(),
                }),
              ),
              synonyms: z.array(z.string()),
              antonyms: z.array(z.string()),
            }),
          ),
          synonyms: z.array(z.string()),
          antonyms: z.array(z.string()),
        }),
      ),
      sourceUrls: z.array(z.string().url()),
      license: licenseSchema.optional(),
    }),
  ),
  requestUrl: z.string().url(),
  licenses: z.array(licenseSchema),
  attribution: nonEmpty,
  cacheStatus: z.enum(['miss', 'fresh', 'stale']),
  warningCode: z.string().optional(),
  fetchedAt: z.string().optional(),
  expiresAt: z.string().optional(),
})

export const dictionaryHistorySchema = z.array(
  z.object({
    term: nonEmpty,
    searchCount: z.number().int().positive(),
    lastSearchedAt: nonEmpty,
  }),
)

export const dictionarySuggestionsSchema = z.object({
  suggestions: z.array(nonEmpty).max(12),
  source: z.enum(['local', 'mixed']),
})

const examDictionaryListSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
  name: nonEmpty,
  shortName: nonEmpty,
  description: nonEmpty,
  source: z.object({
    name: nonEmpty,
    url: z.string().url(),
    license: nonEmpty,
  }),
  entryCount: z.number().int().nonnegative(),
  letterCounts: z.record(
    z.string().regex(/^[A-Z]$/),
    z.number().int().nonnegative(),
  ),
  updatedAt: nonEmpty,
})

export const examDictionaryCatalogSchema = z.object({
  lists: z.array(examDictionaryListSchema),
})

export const examDictionaryPageSchema = z.object({
  list: examDictionaryListSchema,
  letter: z.string().regex(/^[A-Z]$/),
  letterEntryCount: z.number().int().nonnegative(),
  words: z.array(
    z.object({
      word: nonEmpty,
      normalizedWord: nonEmpty,
      rank: z.number().int().positive(),
    }),
  ),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
})

export const dictionarySaveSchema = z
  .object({
    term: nonEmpty,
    destination: z.enum(['favorite', 'review']),
  })
  .passthrough()

export const settingsSchema = z.object({
  learningTrack: z.enum(['academic', 'general']),
  timeZone: nonEmpty.optional(),
})

export const accountStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
})

export const emailSettingsSchema = z.object({
  status: z.enum(['not_configured', 'pending', 'verified', 'unsubscribed']),
  maskedEmail: nonEmpty.optional(),
  timeZone: nonEmpty,
  deliveryMode: z.enum(['platform', 'bring_your_own']).optional(),
  providerConfigured: z.boolean().optional(),
  sendHourLocal: z.number().int().min(0).max(23).optional(),
  testOutcome: z
    .enum(['sent', 'already_sent', 'busy', 'retry_exhausted'])
    .optional(),
})

export const unknownObjectSchema = z.record(z.string(), z.unknown())
