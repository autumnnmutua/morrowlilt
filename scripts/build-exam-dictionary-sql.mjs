import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1])
}
const csvPath = args.get('--ecdict')
const manifestPath = args.get('--manifest')
const outputDirectory = args.get('--output')
if (!csvPath || !outputDirectory) {
  throw new Error(
    'Usage: node scripts/build-exam-dictionary-sql.mjs --ecdict <ecdict.csv> --manifest <lists.json> --output <directory>',
  )
}

const directTags = new Map([
  ['cet4', 'cet4'],
  ['cet6', 'cet6'],
  ['ky', 'postgrad'],
  ['ielts', 'ielts'],
  ['toefl', 'toefl'],
  ['gre', 'gre'],
])
const supportedLists = new Set([
  ...directTags.values(),
  'pets5',
  'tem4',
  'tem8',
  'sat',
  'gmat',
  'awl',
])

function normalizeWord(value) {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
  return /^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*$/.test(
    normalized,
  ) && normalized.length <= 120
    ? normalized
    : undefined
}

function collectJsonWords(value, output) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonWords(item, output)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const key of ['word', 'name', 'headword', 'headWord', 'lemma']) {
    if (typeof value[key] === 'string') {
      const normalized = normalizeWord(value[key])
      if (normalized) output.add(normalized)
      return
    }
  }
  for (const item of Object.values(value)) collectJsonWords(item, output)
}

async function loadWordFile(filePath, output) {
  const content = await readFile(filePath, 'utf8')
  if (/\.json$/i.test(filePath)) {
    collectJsonWords(JSON.parse(content), output)
    return
  }
  for (const line of content.split(/\r?\n/)) {
    const normalized = normalizeWord(line.split(/[\t,;]/)[0])
    if (normalized) output.add(normalized)
  }
}

async function loadExternalLists() {
  const lists = new Map()
  if (!manifestPath) return lists
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const [slug, files] of Object.entries(manifest.lists ?? {})) {
    if (!supportedLists.has(slug) || !Array.isArray(files)) {
      throw new Error(`Unsupported exam dictionary manifest entry: ${slug}`)
    }
    const words = new Set()
    for (const file of files) {
      if (typeof file !== 'string') throw new Error(`Invalid file for ${slug}`)
      await loadWordFile(path.resolve(path.dirname(manifestPath), file), words)
    }
    lists.set(slug, words)
  }
  return lists
}

async function* parseCsv(filePath) {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  let row = []
  let field = ''
  let quoted = false
  let pendingQuote = false
  for await (const chunk of stream) {
    for (const character of chunk) {
      if (pendingQuote) {
        pendingQuote = false
        if (character === '"') {
          field += '"'
          continue
        }
        quoted = false
      }
      if (quoted) {
        if (character === '"') pendingQuote = true
        else field += character
        continue
      }
      if (character === '"') quoted = true
      else if (character === ',') {
        row.push(field)
        field = ''
      } else if (character === '\n') {
        row.push(field.endsWith('\r') ? field.slice(0, -1) : field)
        yield row
        row = []
        field = ''
      } else {
        field += character
      }
    }
  }
  if (pendingQuote) quoted = false
  if (field || row.length) {
    row.push(field)
    yield row
  }
  if (quoted) throw new Error('Unterminated quoted CSV field')
}

function sql(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`
}

function csvRecord(header, row) {
  return Object.fromEntries(
    header.map((name, index) => [name, row[index] ?? '']),
  )
}

function frequencyRank(record) {
  const ranks = [record.bnc, record.frq]
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0)
  return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER
}

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
const externalLists = await loadExternalLists()
const lists = new Map([...supportedLists].map((slug) => [slug, new Set()]))
for (const [slug, words] of externalLists) lists.set(slug, new Set(words))
const externalWords = new Set(
  [...externalLists.values()].flatMap((set) => [...set]),
)
const lexemes = new Map()
const frequencyCandidates = []
let header
let rowCount = 0

for await (const row of parseCsv(csvPath)) {
  if (!header) {
    header = row
    continue
  }
  rowCount += 1
  const record = csvRecord(header, row)
  const word = normalizeWord(record.word)
  if (!word || word.includes(' ')) continue
  const matchedLists = []
  for (const tag of record.tag.split(/\s+/)) {
    const slug = directTags.get(tag)
    if (slug) {
      lists.get(slug).add(word)
      matchedLists.push(slug)
    }
  }
  const rank = frequencyRank(record)
  if (Number.isFinite(rank) && rank < Number.MAX_SAFE_INTEGER) {
    frequencyCandidates.push([rank, word])
  }
  if (matchedLists.length || externalWords.has(word)) {
    lexemes.set(word, record)
  }
}

frequencyCandidates.sort(
  (left, right) => left[0] - right[0] || left[1].localeCompare(right[1]),
)
for (const [, word] of frequencyCandidates) {
  lists.get('pets5').add(word)
  if (lists.get('pets5').size === 7_500) break
}

const neededWords = new Set([...lists.values()].flatMap((set) => [...set]))
if ([...neededWords].some((word) => !lexemes.has(word))) {
  for await (const row of parseCsv(csvPath)) {
    if (!header || row === header) continue
    const record = csvRecord(header, row)
    const word = normalizeWord(record.word)
    if (word && neededWords.has(word) && !lexemes.has(word))
      lexemes.set(word, record)
  }
}

let part = 0
let stream
let bytes = 0
async function rotate() {
  if (stream) await new Promise((resolve) => stream.end(resolve))
  part += 1
  bytes = 0
  stream = createWriteStream(
    path.join(outputDirectory, `${String(part).padStart(4, '0')}-data.sql`),
    { encoding: 'utf8' },
  )
}
async function writeStatement(statement) {
  if (!stream || bytes + Buffer.byteLength(statement) > 700_000) await rotate()
  stream.write(statement)
  bytes += Buffer.byteLength(statement)
}

await rotate()
await writeStatement(
  'DELETE FROM exam_dictionary_entries;\nDELETE FROM dictionary_exam_lexemes;\n',
)

const lexemeRows = [...neededWords]
  .sort()
  .map((word) => lexemes.get(word))
  .filter(Boolean)
for (let index = 0; index < lexemeRows.length; index += 100) {
  const values = lexemeRows.slice(index, index + 100).map((record) => {
    const word = normalizeWord(record.word)
    return `(${sql(word)},${sql(record.word)},${record.phonetic ? sql(record.phonetic) : 'NULL'},${sql(record.definition)},${sql(record.translation)},${sql(record.pos)},${sql(record.exchange)},'ECDICT','https://github.com/skywind3000/ECDICT','MIT',CURRENT_TIMESTAMP)`
  })
  await writeStatement(
    `INSERT OR REPLACE INTO dictionary_exam_lexemes (normalized_word,display_word,phonetic,english_definition,chinese_translation,parts_of_speech,exchange,source_name,source_url,source_license,updated_at) VALUES\n${values.join(',\n')};\n`,
  )
}

for (const [slug, words] of [...lists.entries()]) {
  const sorted = [...words].sort()
  for (let index = 0; index < sorted.length; index += 200) {
    const values = sorted.slice(index, index + 200).map((word, offset) => {
      const display = lexemes.get(word)?.word ?? word
      return `(${sql(slug)},${sql(word)},${sql(display)},${sql(word[0].toUpperCase())},${index + offset + 1})`
    })
    await writeStatement(
      `INSERT OR IGNORE INTO exam_dictionary_entries (list_slug,normalized_word,display_word,initial,rank) VALUES\n${values.join(',\n')};\n`,
    )
  }
  const letterCounts = Object.fromEntries(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      .split('')
      .map((letter) => [
        letter,
        sorted.filter((word) => word.startsWith(letter.toLowerCase())).length,
      ])
      .filter(([, count]) => count > 0),
  )
  await writeStatement(
    `UPDATE exam_dictionary_lists SET entry_count=${sorted.length},letter_counts_json=${sql(JSON.stringify(letterCounts))},updated_at=CURRENT_TIMESTAMP WHERE slug=${sql(slug)};\n`,
  )
}

await new Promise((resolve) => stream.end('PRAGMA optimize;\n', resolve))
const files = (await readdir(outputDirectory)).filter((file) =>
  file.endsWith('.sql'),
)
console.log(
  JSON.stringify(
    {
      csvRowsRead: rowCount,
      lexemeCount: lexemeRows.length,
      lists: Object.fromEntries(
        [...lists].map(([slug, words]) => [slug, words.size]),
      ),
      sqlFiles: files.length,
    },
    null,
    2,
  ),
)
