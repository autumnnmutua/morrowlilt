import type { DictionaryEntry } from '../providers/contracts'

export type Inflection = { form: string; label: string }

type VerbForms = {
  thirdPerson: string
  presentParticiple: string
  past: string
  pastParticiple: string
}

const irregularVerbs: Record<string, VerbForms> = {
  be: {
    thirdPerson: 'is',
    presentParticiple: 'being',
    past: 'was/were',
    pastParticiple: 'been',
  },
  become: {
    thirdPerson: 'becomes',
    presentParticiple: 'becoming',
    past: 'became',
    pastParticiple: 'become',
  },
  begin: {
    thirdPerson: 'begins',
    presentParticiple: 'beginning',
    past: 'began',
    pastParticiple: 'begun',
  },
  break: {
    thirdPerson: 'breaks',
    presentParticiple: 'breaking',
    past: 'broke',
    pastParticiple: 'broken',
  },
  bring: {
    thirdPerson: 'brings',
    presentParticiple: 'bringing',
    past: 'brought',
    pastParticiple: 'brought',
  },
  build: {
    thirdPerson: 'builds',
    presentParticiple: 'building',
    past: 'built',
    pastParticiple: 'built',
  },
  buy: {
    thirdPerson: 'buys',
    presentParticiple: 'buying',
    past: 'bought',
    pastParticiple: 'bought',
  },
  choose: {
    thirdPerson: 'chooses',
    presentParticiple: 'choosing',
    past: 'chose',
    pastParticiple: 'chosen',
  },
  come: {
    thirdPerson: 'comes',
    presentParticiple: 'coming',
    past: 'came',
    pastParticiple: 'come',
  },
  cost: {
    thirdPerson: 'costs',
    presentParticiple: 'costing',
    past: 'cost',
    pastParticiple: 'cost',
  },
  cut: {
    thirdPerson: 'cuts',
    presentParticiple: 'cutting',
    past: 'cut',
    pastParticiple: 'cut',
  },
  do: {
    thirdPerson: 'does',
    presentParticiple: 'doing',
    past: 'did',
    pastParticiple: 'done',
  },
  draw: {
    thirdPerson: 'draws',
    presentParticiple: 'drawing',
    past: 'drew',
    pastParticiple: 'drawn',
  },
  drink: {
    thirdPerson: 'drinks',
    presentParticiple: 'drinking',
    past: 'drank',
    pastParticiple: 'drunk',
  },
  drive: {
    thirdPerson: 'drives',
    presentParticiple: 'driving',
    past: 'drove',
    pastParticiple: 'driven',
  },
  eat: {
    thirdPerson: 'eats',
    presentParticiple: 'eating',
    past: 'ate',
    pastParticiple: 'eaten',
  },
  fall: {
    thirdPerson: 'falls',
    presentParticiple: 'falling',
    past: 'fell',
    pastParticiple: 'fallen',
  },
  feel: {
    thirdPerson: 'feels',
    presentParticiple: 'feeling',
    past: 'felt',
    pastParticiple: 'felt',
  },
  find: {
    thirdPerson: 'finds',
    presentParticiple: 'finding',
    past: 'found',
    pastParticiple: 'found',
  },
  fly: {
    thirdPerson: 'flies',
    presentParticiple: 'flying',
    past: 'flew',
    pastParticiple: 'flown',
  },
  forget: {
    thirdPerson: 'forgets',
    presentParticiple: 'forgetting',
    past: 'forgot',
    pastParticiple: 'forgotten',
  },
  get: {
    thirdPerson: 'gets',
    presentParticiple: 'getting',
    past: 'got',
    pastParticiple: 'got/gotten',
  },
  give: {
    thirdPerson: 'gives',
    presentParticiple: 'giving',
    past: 'gave',
    pastParticiple: 'given',
  },
  go: {
    thirdPerson: 'goes',
    presentParticiple: 'going',
    past: 'went',
    pastParticiple: 'gone',
  },
  grow: {
    thirdPerson: 'grows',
    presentParticiple: 'growing',
    past: 'grew',
    pastParticiple: 'grown',
  },
  have: {
    thirdPerson: 'has',
    presentParticiple: 'having',
    past: 'had',
    pastParticiple: 'had',
  },
  hear: {
    thirdPerson: 'hears',
    presentParticiple: 'hearing',
    past: 'heard',
    pastParticiple: 'heard',
  },
  hold: {
    thirdPerson: 'holds',
    presentParticiple: 'holding',
    past: 'held',
    pastParticiple: 'held',
  },
  keep: {
    thirdPerson: 'keeps',
    presentParticiple: 'keeping',
    past: 'kept',
    pastParticiple: 'kept',
  },
  know: {
    thirdPerson: 'knows',
    presentParticiple: 'knowing',
    past: 'knew',
    pastParticiple: 'known',
  },
  leave: {
    thirdPerson: 'leaves',
    presentParticiple: 'leaving',
    past: 'left',
    pastParticiple: 'left',
  },
  lose: {
    thirdPerson: 'loses',
    presentParticiple: 'losing',
    past: 'lost',
    pastParticiple: 'lost',
  },
  make: {
    thirdPerson: 'makes',
    presentParticiple: 'making',
    past: 'made',
    pastParticiple: 'made',
  },
  mean: {
    thirdPerson: 'means',
    presentParticiple: 'meaning',
    past: 'meant',
    pastParticiple: 'meant',
  },
  meet: {
    thirdPerson: 'meets',
    presentParticiple: 'meeting',
    past: 'met',
    pastParticiple: 'met',
  },
  pay: {
    thirdPerson: 'pays',
    presentParticiple: 'paying',
    past: 'paid',
    pastParticiple: 'paid',
  },
  put: {
    thirdPerson: 'puts',
    presentParticiple: 'putting',
    past: 'put',
    pastParticiple: 'put',
  },
  read: {
    thirdPerson: 'reads',
    presentParticiple: 'reading',
    past: 'read',
    pastParticiple: 'read',
  },
  run: {
    thirdPerson: 'runs',
    presentParticiple: 'running',
    past: 'ran',
    pastParticiple: 'run',
  },
  say: {
    thirdPerson: 'says',
    presentParticiple: 'saying',
    past: 'said',
    pastParticiple: 'said',
  },
  see: {
    thirdPerson: 'sees',
    presentParticiple: 'seeing',
    past: 'saw',
    pastParticiple: 'seen',
  },
  send: {
    thirdPerson: 'sends',
    presentParticiple: 'sending',
    past: 'sent',
    pastParticiple: 'sent',
  },
  set: {
    thirdPerson: 'sets',
    presentParticiple: 'setting',
    past: 'set',
    pastParticiple: 'set',
  },
  show: {
    thirdPerson: 'shows',
    presentParticiple: 'showing',
    past: 'showed',
    pastParticiple: 'shown',
  },
  sit: {
    thirdPerson: 'sits',
    presentParticiple: 'sitting',
    past: 'sat',
    pastParticiple: 'sat',
  },
  speak: {
    thirdPerson: 'speaks',
    presentParticiple: 'speaking',
    past: 'spoke',
    pastParticiple: 'spoken',
  },
  spend: {
    thirdPerson: 'spends',
    presentParticiple: 'spending',
    past: 'spent',
    pastParticiple: 'spent',
  },
  stand: {
    thirdPerson: 'stands',
    presentParticiple: 'standing',
    past: 'stood',
    pastParticiple: 'stood',
  },
  take: {
    thirdPerson: 'takes',
    presentParticiple: 'taking',
    past: 'took',
    pastParticiple: 'taken',
  },
  teach: {
    thirdPerson: 'teaches',
    presentParticiple: 'teaching',
    past: 'taught',
    pastParticiple: 'taught',
  },
  tell: {
    thirdPerson: 'tells',
    presentParticiple: 'telling',
    past: 'told',
    pastParticiple: 'told',
  },
  think: {
    thirdPerson: 'thinks',
    presentParticiple: 'thinking',
    past: 'thought',
    pastParticiple: 'thought',
  },
  understand: {
    thirdPerson: 'understands',
    presentParticiple: 'understanding',
    past: 'understood',
    pastParticiple: 'understood',
  },
  wear: {
    thirdPerson: 'wears',
    presentParticiple: 'wearing',
    past: 'wore',
    pastParticiple: 'worn',
  },
  win: {
    thirdPerson: 'wins',
    presentParticiple: 'winning',
    past: 'won',
    pastParticiple: 'won',
  },
  write: {
    thirdPerson: 'writes',
    presentParticiple: 'writing',
    past: 'wrote',
    pastParticiple: 'written',
  },
}

function endsConsonantY(word: string): boolean {
  return /[^aeiou]y$/.test(word)
}

function thirdPerson(word: string): string {
  if (endsConsonantY(word)) return `${word.slice(0, -1)}ies`
  if (/(?:s|x|z|ch|sh|o)$/.test(word)) return `${word}es`
  return `${word}s`
}

function presentParticiple(word: string): string {
  if (/ie$/.test(word)) return `${word.slice(0, -2)}ying`
  if (/[^e]e$/.test(word)) return `${word.slice(0, -1)}ing`
  if (/^[a-z]*[^aeiou][aeiou][^aeiouywx]$/.test(word)) {
    return `${word}${word.at(-1)}ing`
  }
  return `${word}ing`
}

function regularPast(word: string): string {
  if (word.endsWith('e')) return `${word}d`
  if (endsConsonantY(word)) return `${word.slice(0, -1)}ied`
  if (/^[a-z]*[^aeiou][aeiou][^aeiouywx]$/.test(word)) {
    return `${word}${word.at(-1)}ed`
  }
  return `${word}ed`
}

function plural(word: string): string {
  if (endsConsonantY(word)) return `${word.slice(0, -1)}ies`
  if (/(?:s|x|z|ch|sh)$/.test(word)) return `${word}es`
  if (/(?:f|fe)$/.test(word)) return `${word.replace(/fe?$/, '')}ves`
  return `${word}s`
}

export function buildInflections(
  headword: string,
  partOfSpeechLabels: string[],
  suppliedForms: string[] = [],
): Inflection[] {
  const word = headword.toLocaleLowerCase('en')
  if (!/^[a-z]+$/.test(word)) {
    return suppliedForms.map((form) => ({ form, label: '其他词形' }))
  }
  const output: Inflection[] = [{ form: word, label: '原形' }]
  if (partOfSpeechLabels.some((label) => label.toLowerCase() === 'verb')) {
    const forms = irregularVerbs[word] ?? {
      thirdPerson: thirdPerson(word),
      presentParticiple: presentParticiple(word),
      past: regularPast(word),
      pastParticiple: regularPast(word),
    }
    output.push(
      { form: forms.thirdPerson, label: '第三人称单数' },
      { form: forms.presentParticiple, label: '现在分词 / 动名词' },
      { form: forms.past, label: '过去式' },
      { form: forms.pastParticiple, label: '过去分词' },
    )
  }
  if (partOfSpeechLabels.some((label) => label.toLowerCase() === 'noun')) {
    output.push({ form: plural(word), label: '复数' })
  }
  for (const form of suppliedForms) output.push({ form, label: '词典收录词形' })
  const seen = new Set<string>()
  return output.filter((item) => {
    const key = `${item.form}\u0000${item.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function addEntryInflections(
  entry: Omit<DictionaryEntry, 'inflections'>,
): DictionaryEntry {
  return {
    ...entry,
    inflections: buildInflections(
      entry.headword,
      entry.partsOfSpeech.map((part) => part.label),
      entry.forms,
    ),
  }
}
