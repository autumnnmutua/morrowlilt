import { isContentDate, sanitizePlainText } from './content/schema'
import { EmailRenderError } from './email/render'
import { AdminAuthError, requireAdminAuthorization } from './http/admin-auth'
import {
  AccessAuthError,
  requireAccessAuthorization,
  requireSameOriginMutation,
} from './http/access-auth'
import {
  readBoundedRequestJson,
  RequestValidationError,
} from './http/request-json'
import { HttpContentProvider } from './providers/http-content'
import type { ContentProvider } from './providers/contracts'
import { FreeDictionaryProvider } from './providers/free-dictionary'
import { DatamuseSuggestionProvider } from './providers/datamuse'
import { checkDatabase, getDailyContent } from './repository/daily-content'
import { getProfile, updateLearningTrack } from './repository/learning'
import {
  getContentProviderConfig,
  getPublicSiteUrl,
  getResendSenderConfig,
  getWorkersAiBinding,
  isWorkersAiContentEnabled,
} from './runtime-config'
import {
  ensureDailyContent,
  ContentPipelineError,
  previewDailyContent,
  regenerateDailyContentWithAudit,
} from './services/daily-content'
import {
  ensureAppProfile,
  getPendingBundle,
  LearningDomainError,
  markLearned,
  markNotLearned,
  undoTodayLearned,
} from './services/learning'
import {
  EmailDeliveryError,
  previewDailyEmail,
  runScheduledDailyJob,
  sendTestDailyEmail,
} from './services/scheduled-job'
import { ResendEmailProvider } from './providers/resend'
import {
  WorkersAiContentProvider,
  WorkersAiDictionaryTranslationProvider,
} from './providers/workers-ai'
import {
  confirmEmailBinding,
  EmailSubscriptionError,
  readEmailSettings,
  requestEmailBinding,
  stopEmailSubscription,
} from './services/email-subscription'
import {
  ensureDailyLearningPackage,
  getDailyLearningPackage,
} from './services/daily-package'
import {
  completeQuizSession,
  createQuizSession,
  getActiveQuizSession,
  getQuizReport,
  getQuizSessionView,
  listMistakes,
  normalizeQuizSettings,
  QuizDomainError,
  submitQuizAnswer,
} from './services/quiz'
import {
  addDictionaryTerm,
  DictionaryDomainError,
  getDictionaryHistory,
  getDictionarySuggestions,
  lookupDictionary,
} from './services/dictionary'
import { getLocalDate } from './time/business-date'
import type { QuestionType, QuizMode } from './quiz/types'

const defaultProfileId = 'default'

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  return new Response(JSON.stringify(data), { ...init, headers })
}

function methodNotAllowed(allowed: string): Response {
  return json(
    { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } },
    { status: 405, headers: { allow: allowed } },
  )
}

function getOnlineContentProvider(env: Env): ContentProvider | undefined {
  const config = getContentProviderConfig(env)
  if (config) return new HttpContentProvider(config.endpoint, config.apiKey)
  const ai = getWorkersAiBinding(env)
  return isWorkersAiContentEnabled(env) && ai
    ? new WorkersAiContentProvider(ai)
    : undefined
}

async function ensureDefaultProfile(env: Env) {
  return ensureAppProfile({
    db: env.DB,
    profileId: defaultProfileId,
    timeZone: env.APP_TIME_ZONE,
  })
}

async function getTodayPayload(env: Env) {
  const profile =
    (await getProfile(env.DB, defaultProfileId)) ??
    (await ensureDefaultProfile(env))
  const today = getLocalDate(profile.timeZone)
  const onlineProvider = getOnlineContentProvider(env)
  const bundle = await getPendingBundle({
    db: env.DB,
    profileId: profile.id,
    today,
    onlineProvider,
  })
  const todayContent =
    bundle.days.find((day) => day.contentDate === today) ??
    (await ensureDailyContent({
      db: env.DB,
      contentDate: today,
      timeZone: profile.timeZone,
      onlineProvider,
    }))

  return { ...bundle, todayContent }
}

function getIdempotencyKey(request: Request): string {
  return request.headers.get('idempotency-key')?.trim() ?? ''
}

function requireIdempotencyKey(request: Request): string {
  const value = getIdempotencyKey(request)
  if (!/^[A-Za-z0-9._:/-]{8,128}$/.test(value)) {
    throw new RequestValidationError(
      'INVALID_IDEMPOTENCY_KEY',
      'A valid Idempotency-Key header is required',
    )
  }
  return value
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RequestValidationError(
      'INVALID_REQUEST_BODY',
      'Request body must be a JSON object',
    )
  }
  return value as Record<string, unknown>
}

async function handleHealth(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const databaseOk = await checkDatabase(env.DB)
  return json(
    {
      status: databaseOk ? 'ok' : 'error',
      service: 'daily-english-study',
      checks: { database: databaseOk ? 'ok' : 'error' },
    },
    { status: databaseOk ? 200 : 503 },
  )
}

async function handleDailyContent(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const contentDate = new URL(request.url).searchParams.get('date') ?? ''
  if (!isContentDate(contentDate)) {
    return json(
      {
        error: {
          code: 'INVALID_CONTENT_DATE',
          message: 'date must be a real ISO local date',
        },
      },
      { status: 400 },
    )
  }

  const existing = await getDailyContent(env.DB, contentDate)
  const data =
    existing ??
    (await ensureDailyContent({
      db: env.DB,
      contentDate,
      timeZone: env.APP_TIME_ZONE,
      onlineProvider: getOnlineContentProvider(env),
    }))
  return json({ data })
}

async function handleDailyPackage(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const profile = await ensureDefaultProfile(env)
  const contentDate =
    new URL(request.url).searchParams.get('date') ??
    getLocalDate(profile.timeZone)
  if (!isContentDate(contentDate)) {
    throw new RequestValidationError(
      'INVALID_CONTENT_DATE',
      'date must be a real ISO local date',
    )
  }
  const existing = await getDailyLearningPackage(env.DB, contentDate)
  if (existing) return json({ data: existing })
  const content = await ensureDailyContent({
    db: env.DB,
    contentDate,
    timeZone: profile.timeZone,
    onlineProvider: getOnlineContentProvider(env),
  })
  return json({
    data: await ensureDailyLearningPackage({ db: env.DB, content }),
  })
}

async function handleEmailSettings(
  request: Request,
  env: Env,
): Promise<Response> {
  const profile = await ensureDefaultProfile(env)
  if (request.method === 'GET') {
    return json({
      data: await readEmailSettings({
        db: env.DB,
        profileId: profile.id,
        timeZone: profile.timeZone,
      }),
    })
  }
  if (request.method !== 'POST') return methodNotAllowed('GET, POST')
  const body = requireRecord(await readBoundedRequestJson(request))
  const action = body.action
  if (action === 'bind') {
    if (Object.keys(body).length !== 2 || typeof body.email !== 'string') {
      throw new RequestValidationError(
        'INVALID_EMAIL_SETTINGS_BODY',
        'Email binding requires only action and email',
      )
    }
    const config = getResendSenderConfig(env)
    if (!config) {
      throw new EmailSubscriptionError(
        'EMAIL_NOT_CONFIGURED',
        '邮件服务尚未完成生产配置',
        503,
      )
    }
    return json({
      data: await requestEmailBinding({
        db: env.DB,
        profileId: profile.id,
        timeZone: profile.timeZone,
        rawEmail: body.email,
        idempotencyKey: requireIdempotencyKey(request),
        provider: new ResendEmailProvider(config.apiKey),
        mailFrom: config.mailFrom,
        publicSiteUrl: config.publicSiteUrl,
      }),
    })
  }
  if (action === 'verify') {
    if (Object.keys(body).length !== 2 || typeof body.token !== 'string') {
      throw new RequestValidationError(
        'INVALID_EMAIL_SETTINGS_BODY',
        'Email verification requires only action and token',
      )
    }
    return json({
      data: await confirmEmailBinding({
        db: env.DB,
        token: body.token,
        idempotencyKey: requireIdempotencyKey(request),
        timeZone: profile.timeZone,
      }),
    })
  }
  if (action === 'unsubscribe' && Object.keys(body).length === 1) {
    return json({
      data: await stopEmailSubscription({
        db: env.DB,
        profileId: profile.id,
        idempotencyKey: requireIdempotencyKey(request),
        timeZone: profile.timeZone,
      }),
    })
  }
  if (action === 'test' && Object.keys(body).length === 1) {
    const outcome = await sendTestDailyEmail({
      env,
      contentDate: getLocalDate(profile.timeZone),
      useConfiguredRecipient: true,
    })
    return json({
      data: {
        ...(await readEmailSettings({
          db: env.DB,
          profileId: profile.id,
          timeZone: profile.timeZone,
        })),
        testOutcome: outcome.outcome,
      },
    })
  }
  throw new RequestValidationError(
    'INVALID_EMAIL_SETTINGS_BODY',
    'Unsupported email settings action',
  )
}

async function handleToday(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  return json({ data: await getTodayPayload(env) })
}

async function handleCheckin(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const body = requireRecord(await readBoundedRequestJson(request))
  if (
    Object.keys(body).length !== 1 ||
    (body.action !== 'learned' && body.action !== 'not_learned')
  ) {
    throw new RequestValidationError(
      'INVALID_CHECKIN_ACTION',
      'action must be learned or not_learned',
    )
  }

  const profile = await ensureDefaultProfile(env)
  const today = getLocalDate(profile.timeZone)
  await getPendingBundle({
    db: env.DB,
    profileId: profile.id,
    today,
    onlineProvider: getOnlineContentProvider(env),
  })
  const mutation = await (body.action === 'learned'
    ? markLearned({
        db: env.DB,
        profileId: profile.id,
        today,
        idempotencyKey: getIdempotencyKey(request),
      })
    : markNotLearned({
        db: env.DB,
        profileId: profile.id,
        today,
        idempotencyKey: getIdempotencyKey(request),
      }))

  return json({ data: await getTodayPayload(env), mutation })
}

async function handleUndo(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const body = requireRecord(await readBoundedRequestJson(request))
  if (Object.keys(body).length !== 0) {
    throw new RequestValidationError(
      'INVALID_UNDO_BODY',
      'Undo request body must be an empty JSON object',
    )
  }

  const profile = await ensureDefaultProfile(env)
  const today = getLocalDate(profile.timeZone)
  const mutation = await undoTodayLearned({
    db: env.DB,
    profileId: profile.id,
    today,
    idempotencyKey: getIdempotencyKey(request),
  })
  return json({ data: await getTodayPayload(env), mutation })
}

function requireContentDate(value: unknown): string {
  if (typeof value !== 'string' || !isContentDate(value)) {
    throw new RequestValidationError(
      'INVALID_CONTENT_DATE',
      'date must be a real ISO local date',
    )
  }
  return value
}

async function handleAdminPreview(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  await requireAdminAuthorization(request, env)
  const body = requireRecord(await readBoundedRequestJson(request))
  if (Object.keys(body).length !== 1) {
    throw new RequestValidationError(
      'INVALID_ADMIN_PREVIEW_BODY',
      'Preview body must contain only date',
    )
  }
  const contentDate = requireContentDate(body.date)
  const preview = await previewDailyContent({
    db: env.DB,
    contentDate,
    timeZone: env.APP_TIME_ZONE,
    onlineProvider: getOnlineContentProvider(env),
  })
  return json({ data: preview })
}

async function handleAdminRegenerate(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  await requireAdminAuthorization(request, env)
  const body = requireRecord(await readBoundedRequestJson(request))
  if (Object.keys(body).length !== 2 || typeof body.reason !== 'string') {
    throw new RequestValidationError(
      'INVALID_ADMIN_REGENERATE_BODY',
      'Regeneration body must contain date and reason',
    )
  }
  const contentDate = requireContentDate(body.date)
  const reason = sanitizePlainText(body.reason)
  if (reason.length < 8 || reason.length > 500) {
    throw new RequestValidationError(
      'INVALID_REGENERATION_REASON',
      'Regeneration reason must contain 8 to 500 characters',
    )
  }
  const idempotencyKey = getIdempotencyKey(request)
  if (!/^[A-Za-z0-9._:/-]{8,128}$/.test(idempotencyKey)) {
    throw new RequestValidationError(
      'INVALID_IDEMPOTENCY_KEY',
      'A valid Idempotency-Key header is required',
    )
  }
  const data = await regenerateDailyContentWithAudit({
    db: env.DB,
    contentDate,
    timeZone: env.APP_TIME_ZONE,
    reason,
    idempotencyKey,
    onlineProvider: getOnlineContentProvider(env),
  })
  return json({ data })
}

async function handleEmailPreview(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  await requireAdminAuthorization(request, env)
  const body = requireRecord(await readBoundedRequestJson(request))
  if (Object.keys(body).length !== 1) {
    throw new RequestValidationError(
      'INVALID_EMAIL_PREVIEW_BODY',
      'Preview body must contain only date',
    )
  }
  const contentDate = requireContentDate(body.date)
  const requestOrigin = new URL(request.url).origin
  return json({
    data: await previewDailyEmail({
      env,
      contentDate,
      publicSiteUrl: getPublicSiteUrl(env) ?? requestOrigin,
    }),
  })
}

async function handleEmailTestSend(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  await requireAdminAuthorization(request, env)
  requireIdempotencyKey(request)
  const body = requireRecord(await readBoundedRequestJson(request))
  const target = body.target ?? 'resend_test'
  if (
    typeof body.date !== 'string' ||
    (target !== 'resend_test' && target !== 'configured') ||
    Object.keys(body).some(
      (key) => !['date', 'target', 'confirmation'].includes(key),
    )
  ) {
    throw new RequestValidationError(
      'INVALID_EMAIL_TEST_BODY',
      'Test send body must contain date and a supported target',
    )
  }
  if (target === 'configured' && body.confirmation !== 'send') {
    throw new RequestValidationError(
      'EMAIL_TEST_CONFIRMATION_REQUIRED',
      'Configured recipient test sends require explicit confirmation',
    )
  }
  const contentDate = requireContentDate(body.date)
  return json({
    data: {
      contentDate,
      target,
      ...(await sendTestDailyEmail({
        env,
        contentDate,
        useConfiguredRecipient: target === 'configured',
      })),
    },
  })
}

const questionTypes: QuestionType[] = [
  'context_translation',
  'spelling',
  'cloze',
  'collocation_choice',
  'phrase_meaning',
]

function readQuizMode(value: unknown): QuizMode {
  if (value === 'mixed' || value === 'mistake_retest') return value
  throw new RequestValidationError(
    'INVALID_QUIZ_MODE',
    'mode must be mixed or mistake_retest',
  )
}

function readQuestionTypes(value: unknown): QuestionType[] {
  if (value === undefined) return questionTypes
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(
      (item): item is QuestionType =>
        typeof item === 'string' &&
        questionTypes.includes(item as QuestionType),
    )
  ) {
    throw new RequestValidationError(
      'INVALID_QUESTION_TYPES',
      'types contains an unsupported question type',
    )
  }
  return value
}

async function handleQuizSessions(
  request: Request,
  env: Env,
): Promise<Response> {
  const profile = await ensureDefaultProfile(env)
  if (request.method === 'GET') {
    return json({
      data: (await getActiveQuizSession(env.DB, profile.id)) ?? null,
    })
  }
  if (request.method !== 'POST') return methodNotAllowed('GET, POST')
  const body = requireRecord(await readBoundedRequestJson(request))
  const count = body.count === undefined ? 10 : body.count
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 6 ||
    count > 20
  ) {
    throw new RequestValidationError(
      'INVALID_QUESTION_COUNT',
      'count must be an integer from 6 to 20',
    )
  }
  const mode = readQuizMode(body.mode ?? 'mixed')
  const settings = normalizeQuizSettings({
    count,
    types: readQuestionTypes(body.types),
    mode,
  })
  return json(
    {
      data: await createQuizSession({
        db: env.DB,
        profileId: profile.id,
        idempotencyKey: requireIdempotencyKey(request),
        ...settings,
      }),
    },
    { status: 201 },
  )
}

async function handleQuizSession(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const profile = await ensureDefaultProfile(env)
  return json({ data: await getQuizSessionView(env.DB, profile.id, sessionId) })
}

async function handleQuizAnswer(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const body = requireRecord(await readBoundedRequestJson(request))
  if (
    typeof body.questionId !== 'string' ||
    typeof body.response !== 'string' ||
    body.response.length > 300 ||
    typeof body.durationMs !== 'number' ||
    !Number.isInteger(body.durationMs) ||
    body.durationMs < 0 ||
    body.durationMs > 3600000
  ) {
    throw new RequestValidationError(
      'INVALID_QUIZ_ANSWER',
      'questionId, a bounded response, and durationMs are required',
    )
  }
  const profile = await ensureDefaultProfile(env)
  return json({
    data: await submitQuizAnswer({
      db: env.DB,
      profileId: profile.id,
      sessionId,
      questionId: body.questionId,
      response: body.response,
      durationMs: body.durationMs,
      idempotencyKey: requireIdempotencyKey(request),
    }),
  })
}

async function handleQuizComplete(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  requireIdempotencyKey(request)
  const body = requireRecord(await readBoundedRequestJson(request))
  if (Object.keys(body).length !== 0) {
    throw new RequestValidationError(
      'INVALID_COMPLETE_BODY',
      'Complete body must be empty',
    )
  }
  const profile = await ensureDefaultProfile(env)
  return json({
    data: await completeQuizSession({
      db: env.DB,
      profileId: profile.id,
      sessionId,
      businessDate: getLocalDate(profile.timeZone),
    }),
  })
}

async function handleQuizReport(
  request: Request,
  env: Env,
  sessionId?: string,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const profile = await ensureDefaultProfile(env)
  return json({
    data: (await getQuizReport(env.DB, profile.id, sessionId)) ?? null,
  })
}

async function handleMistakes(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const profile = await ensureDefaultProfile(env)
  return json({ data: await listMistakes(env.DB, profile.id) })
}

async function handleDictionary(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const rawTerm = new URL(request.url).searchParams.get('term') ?? ''
  const profile = await ensureDefaultProfile(env)
  const ai = getWorkersAiBinding(env)
  return json({
    data: await lookupDictionary({
      db: env.DB,
      profileId: profile.id,
      provider: new FreeDictionaryProvider(),
      translationProvider:
        isWorkersAiContentEnabled(env) && ai
          ? new WorkersAiDictionaryTranslationProvider(ai)
          : undefined,
      rawTerm,
    }),
  })
}

async function handleDictionaryHistory(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const profile = await ensureDefaultProfile(env)
  return json({ data: await getDictionaryHistory(env.DB, profile.id) })
}

async function handleDictionarySuggestions(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const rawQuery = new URL(request.url).searchParams.get('q') ?? ''
  const profile = await ensureDefaultProfile(env)
  return json({
    data: await getDictionarySuggestions({
      db: env.DB,
      profileId: profile.id,
      rawQuery,
      provider: new DatamuseSuggestionProvider(),
    }),
  })
}

async function handleSaveDictionaryTerm(
  request: Request,
  env: Env,
  destination: 'favorite' | 'review',
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  requireIdempotencyKey(request)
  const body = requireRecord(await readBoundedRequestJson(request))
  if (Object.keys(body).length !== 1 || typeof body.term !== 'string') {
    throw new RequestValidationError(
      'INVALID_DICTIONARY_SAVE_BODY',
      'Request body must contain only term',
    )
  }
  const profile = await ensureDefaultProfile(env)
  return json({
    data: await addDictionaryTerm({
      db: env.DB,
      profileId: profile.id,
      rawTerm: body.term,
      provider: 'free-dictionary-api-v2',
      destination,
    }),
  })
}

async function handleSettings(request: Request, env: Env): Promise<Response> {
  const profile = await ensureDefaultProfile(env)
  if (request.method === 'GET') {
    return json({
      data: {
        learningTrack: profile.learningTrack,
        timeZone: profile.timeZone,
      },
    })
  }
  if (request.method !== 'POST') return methodNotAllowed('GET, POST')
  requireIdempotencyKey(request)
  const body = requireRecord(await readBoundedRequestJson(request))
  if (Object.keys(body).length !== 1) {
    throw new RequestValidationError(
      'INVALID_SETTINGS_BODY',
      'Settings body must contain only track',
    )
  }
  if (body.track !== 'academic' && body.track !== 'general') {
    throw new RequestValidationError(
      'INVALID_LEARNING_TRACK',
      'track must be academic or general',
    )
  }
  const updated = await updateLearningTrack(env.DB, profile.id, body.track)
  return json({
    data: {
      learningTrack: updated.learningTrack,
      timeZone: updated.timeZone,
    },
  })
}

async function routeApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname
  const answerMatch = path.match(/^\/api\/quiz\/sessions\/([^/]+)\/answers$/)
  if (answerMatch) return handleQuizAnswer(request, env, answerMatch[1])
  const completeMatch = path.match(/^\/api\/quiz\/sessions\/([^/]+)\/complete$/)
  if (completeMatch) return handleQuizComplete(request, env, completeMatch[1])
  const reportMatch = path.match(/^\/api\/quiz\/sessions\/([^/]+)\/report$/)
  if (reportMatch) return handleQuizReport(request, env, reportMatch[1])
  const sessionMatch = path.match(/^\/api\/quiz\/sessions\/([^/]+)$/)
  if (sessionMatch) return handleQuizSession(request, env, sessionMatch[1])
  switch (path) {
    case '/api/health':
      return handleHealth(request, env)
    case '/api/daily-content':
      return handleDailyContent(request, env)
    case '/api/daily-package':
      return handleDailyPackage(request, env)
    case '/api/today':
      return handleToday(request, env)
    case '/api/checkin':
      return handleCheckin(request, env)
    case '/api/checkin/undo':
      return handleUndo(request, env)
    case '/api/admin/daily-content/preview':
      return handleAdminPreview(request, env)
    case '/api/admin/daily-content/regenerate':
      return handleAdminRegenerate(request, env)
    case '/api/admin/email/preview':
      return handleEmailPreview(request, env)
    case '/api/admin/email/test-send':
      return handleEmailTestSend(request, env)
    case '/api/quiz/sessions':
      return handleQuizSessions(request, env)
    case '/api/quiz/reports/latest':
      return handleQuizReport(request, env)
    case '/api/mistakes':
      return handleMistakes(request, env)
    case '/api/dictionary':
      return handleDictionary(request, env)
    case '/api/dictionary/history':
      return handleDictionaryHistory(request, env)
    case '/api/dictionary/suggestions':
      return handleDictionarySuggestions(request, env)
    case '/api/dictionary/favorites':
      return handleSaveDictionaryTerm(request, env, 'favorite')
    case '/api/dictionary/review-queue':
      return handleSaveDictionaryTerm(request, env, 'review')
    case '/api/settings':
      return handleSettings(request, env)
    case '/api/email/settings':
      return handleEmailSettings(request, env)
    default:
      return json(
        { error: { code: 'NOT_FOUND', message: 'API route not found' } },
        { status: 404 },
      )
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      if (new URL(request.url).pathname.startsWith('/api/')) {
        await requireAccessAuthorization(request, env)
        requireSameOriginMutation(request)
      }
      return await routeApi(request, env)
    } catch (error) {
      if (error instanceof AccessAuthError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        )
      }
      if (error instanceof LearningDomainError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        )
      }
      if (error instanceof RequestValidationError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: 400 },
        )
      }
      if (error instanceof AdminAuthError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        )
      }
      if (error instanceof ContentPipelineError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        )
      }
      if (error instanceof QuizDomainError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        )
      }
      if (error instanceof DictionaryDomainError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        )
      }
      if (error instanceof EmailDeliveryError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        )
      }
      if (error instanceof EmailRenderError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: 422 },
        )
      }
      if (error instanceof EmailSubscriptionError) {
        return json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        )
      }
      console.error(
        JSON.stringify({
          event: 'api_request_failed',
          code: 'API_UNEXPECTED_ERROR',
          path: new URL(request.url).pathname,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorCode:
            error instanceof Error
              ? error.message.slice(0, 120)
              : 'UNKNOWN_ERROR',
        }),
      )
      return json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'The request could not be completed',
          },
        },
        { status: 500 },
      )
    }
  },

  scheduled(controller, env, ctx): void {
    ctx.waitUntil(runScheduledDailyJob(controller.scheduledTime, env))
  },
} satisfies ExportedHandler<Env>
