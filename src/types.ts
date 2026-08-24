export type PageId =
  | 'today'
  | 'learning'
  | 'quiz'
  | 'report'
  | 'dictionary'
  | 'review'
  | 'settings'

export type HealthState = 'checking' | 'ready' | 'unavailable'
export type LearningState = 'unsettled' | 'settled'
export type ThemeChoice = 'system' | 'light' | 'dark'

export type VocabularyItem = {
  kind: 'word' | 'phrase' | 'expression'
  term: string
  partOfSpeech?: string
  meaningGroups?: Array<{
    partOfSpeech: string
    meaningsZh: string[]
  }>
  definition: string
  definitionZh?: string
  example: string
  exampleZh?: string
  usageNote?: string
}

export type PracticalExpression = {
  expression: string
  expressionType: 'phrase' | 'idiom' | 'response' | 'phrasal_verb' | 'slang'
  partOfSpeech: string
  chineseMeanings: string[]
  coreMeaning: string
  usageNotes: string[]
  scenarios: Array<{
    label: string
    description: string
    example: string
    exampleZh: string
  }>
  pitfalls: string[]
  alternatives: Array<{ expression: string; nuance: string }>
  ieltsUse: string
}

export type DailyContent = {
  id: string
  contentDate: string
  payload: {
    schemaVersion: 2
    contentDate: string
    difficulty: 'C1' | 'C2'
    theme:
      | 'learning'
      | 'campus'
      | 'technology'
      | 'environment'
      | 'work'
      | 'health'
      | 'city'
      | 'culture'
    originType: 'original' | 'ai_assisted' | 'licensed'
    generatorVersion: string
    sentence: {
      english: string
      chinese: string
      grammarNotes: string[]
      usageNotes: string[]
      collocations: Array<{ expression: string; meaning: string }>
      alternatives: Array<{ expression: string; note: string }>
      microExercise: string
    }
    vocabulary: VocabularyItem[]
    practicalExpressions?: PracticalExpression[]
    topic: {
      kind: 'speaking' | 'writing'
      prompt: string
      preparationPoints: string[]
    }
  }
  source: 'online' | 'cache' | 'seed'
  sourceDate?: string
  attribution: string
  provider: string
  sourceUrl?: string
  fingerprint: string
  generatorVersion: string
  createdAt: string
}

export type TodayData = {
  profile: {
    id: string
    timeZone: string
    learningTrack: 'academic' | 'general'
    createdDate: string
  }
  progress: {
    profileId: string
    settledThroughDate: string
    version: number
  }
  today: string
  learningState: LearningState
  pendingDayCount: number
  totalItemCount: number
  days: DailyContent[]
  todayContent: DailyContent
}

export type TodayViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: TodayData }

export type TodayAction = 'learned' | 'not_learned' | 'undo'
