import type { DailyContentPayload } from '../providers/contracts'
import type { PersistedDailyContent } from '../repository/daily-content'
import {
  abbreviatePartOfSpeech,
  lookupExamMeaningGroups,
  type VocabularyMeaningGroup,
} from '../repository/exam-dictionary'

function cleanMeaning(value: string): string {
  return value.trim().replace(/[；;。\s]+$/u, '')
}

function fallbackGroups(
  item: DailyContentPayload['vocabulary'][number],
): VocabularyMeaningGroup[] {
  const definition = cleanMeaning(
    item.definitionZh ?? '请结合英文解释和例句理解该义项',
  )
  return [
    {
      partOfSpeech: abbreviatePartOfSpeech(
        item.partOfSpeech ?? (item.kind === 'word' ? undefined : item.kind),
      ),
      meaningsZh: [definition],
    },
  ]
}

function mergeStoredMeaning(
  groups: VocabularyMeaningGroup[],
  item: DailyContentPayload['vocabulary'][number],
): VocabularyMeaningGroup[] {
  const stored = item.definitionZh ? cleanMeaning(item.definitionZh) : ''
  if (!stored) return groups
  const part = abbreviatePartOfSpeech(item.partOfSpeech)
  const target = groups.find((group) => group.partOfSpeech === part)
  if (!target) return [...groups, { partOfSpeech: part, meaningsZh: [stored] }]
  if (target.meaningsZh.some((meaning) => cleanMeaning(meaning) === stored)) {
    return groups
  }
  return groups.map((group) =>
    group === target
      ? { ...group, meaningsZh: [...group.meaningsZh, stored] }
      : group,
  )
}

export async function enrichDailyContentsVocabulary(
  db: D1Database,
  contents: PersistedDailyContent[],
): Promise<PersistedDailyContent[]> {
  const lexicon = await lookupExamMeaningGroups(
    db,
    contents.flatMap((content) =>
      content.payload.vocabulary.map((item) => item.term),
    ),
  )
  return contents.map((content) => ({
    ...content,
    payload: {
      ...content.payload,
      vocabulary: content.payload.vocabulary.map((item) => {
        const normalized = item.term.normalize('NFKC').trim().toLowerCase()
        const groups = lexicon.get(normalized)
        return {
          ...item,
          meaningGroups: groups?.length
            ? mergeStoredMeaning(groups, item)
            : fallbackGroups(item),
        }
      }),
    },
  }))
}
