import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { rm } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

const sourceDirectory = resolve(
  process.argv[2] ?? 'private/english-wordnet-2025-source/oewn2025',
)
const outputDirectory = resolve(process.argv[3] ?? 'private/wordnet-import')
const useExplicitTransactions = !process.argv.includes('--no-transactions')

if (!existsSync(sourceDirectory)) {
  throw new Error(`WordNet source directory not found: ${sourceDirectory}`)
}
await rm(outputDirectory, { recursive: true, force: true })
mkdirSync(outputDirectory, { recursive: true })

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function normalizeWord(value) {
  return value
    .replace(/\([a-z]\)$/i, '')
    .replaceAll('_', ' ')
    .normalize('NFKC')
    .toLocaleLowerCase('en')
}

function accepted(value) {
  return (
    value.length >= 1 &&
    value.length <= 64 &&
    /^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*)*$/.test(value)
  )
}

class ChunkWriter {
  constructor(
    prefix,
    table,
    columns,
    rowsPerStatement = 150,
    statementsPerFile = 40,
  ) {
    this.prefix = prefix
    this.table = table
    this.columns = columns
    this.rowsPerStatement = rowsPerStatement
    this.statementsPerFile = statementsPerFile
    this.rows = []
    this.fileIndex = 0
    this.statementCount = 0
    this.stream = undefined
  }

  open() {
    this.fileIndex += 1
    const name = `${this.prefix}-${String(this.fileIndex).padStart(4, '0')}.sql`
    this.stream = createWriteStream(resolve(outputDirectory, name), {
      encoding: 'utf8',
    })
    if (useExplicitTransactions) this.stream.write('BEGIN TRANSACTION;\n')
    this.statementCount = 0
  }

  async writeRows() {
    if (this.rows.length === 0) return
    if (!this.stream) this.open()
    const statement = `INSERT OR IGNORE INTO ${this.table} (${this.columns.join(', ')}) VALUES\n${this.rows.map((row) => `(${row.join(', ')})`).join(',\n')};\n`
    if (!this.stream.write(statement)) {
      await new Promise((resolveDrain) =>
        this.stream.once('drain', resolveDrain),
      )
    }
    this.rows = []
    this.statementCount += 1
    if (this.statementCount >= this.statementsPerFile) await this.closeFile()
  }

  async add(row) {
    this.rows.push(row)
    if (this.rows.length >= this.rowsPerStatement) await this.writeRows()
  }

  async closeFile() {
    if (!this.stream) return
    if (useExplicitTransactions) this.stream.write('COMMIT;\n')
    const stream = this.stream
    this.stream = undefined
    await new Promise((resolveEnd, reject) => {
      stream.once('error', reject)
      stream.end(resolveEnd)
    })
  }

  async finish() {
    await this.writeRows()
    await this.closeFile()
  }
}

const senseWriter = new ChunkWriter('100-senses', 'dictionary_lexicon_senses', [
  'normalized_lemma',
  'lemma',
  'part_of_speech',
  'definition',
  'examples_json',
  'synonyms_json',
  'source_synset_id',
])
const formWriter = new ChunkWriter('200-forms', 'dictionary_lexicon_forms', [
  'normalized_form',
  'form',
  'normalized_lemma',
  'lemma',
  'part_of_speech',
  'form_label',
])

const partFiles = [
  ['noun', 'noun'],
  ['verb', 'verb'],
  ['adj', 'adjective'],
  ['adv', 'adverb'],
]
const lemmas = new Set()
let senseCount = 0

for (const [filePart, partOfSpeech] of partFiles) {
  const lines = createInterface({
    input: createReadStream(resolve(sourceDirectory, `data.${filePart}`)),
    crlfDelay: Infinity,
  })
  for await (const line of lines) {
    if (!/^\d{8}\s/.test(line)) continue
    const separator = line.indexOf('|')
    if (separator < 0) continue
    const data = line.slice(0, separator).trim().split(/\s+/)
    const wordCount = Number.parseInt(data[3], 16)
    if (!Number.isFinite(wordCount) || wordCount < 1) continue
    const synsetId = `${filePart}-${data[0]}`
    const words = []
    for (let index = 0; index < wordCount; index += 1) {
      const word = normalizeWord(data[4 + index * 2])
      if (accepted(word) && !words.includes(word)) words.push(word)
    }
    if (words.length === 0) continue
    const gloss = line.slice(separator + 1).trim()
    const examples = [...gloss.matchAll(/"([^"]+)"/g)].map((match) =>
      match[1].trim(),
    )
    const definition = gloss.replace(/;\s*"[^"]+"/g, '').trim()
    if (!definition || definition.length > 4_000) continue
    for (const lemma of words) {
      lemmas.add(lemma)
      await senseWriter.add([
        sql(lemma),
        sql(lemma),
        sql(partOfSpeech),
        sql(definition),
        sql(JSON.stringify(examples)),
        sql(JSON.stringify(words)),
        sql(synsetId),
      ])
      senseCount += 1
    }
  }
}
await senseWriter.finish()

let formCount = 0
for (const [filePart, partOfSpeech] of partFiles) {
  const lines = createInterface({
    input: createReadStream(resolve(sourceDirectory, `${filePart}.exc`)),
    crlfDelay: Infinity,
  })
  for await (const line of lines) {
    const [rawForm, ...rawLemmas] = line.trim().split(/\s+/)
    const form = normalizeWord(rawForm ?? '')
    if (!accepted(form)) continue
    for (const rawLemma of rawLemmas) {
      const lemma = normalizeWord(rawLemma)
      if (!accepted(lemma)) continue
      await formWriter.add([
        sql(form),
        sql(form),
        sql(lemma),
        sql(lemma),
        sql(partOfSpeech),
        sql('词典收录词形'),
      ])
      formCount += 1
    }
  }
}
await formWriter.finish()

const reset = createWriteStream(resolve(outputDirectory, '000-reset.sql'), {
  encoding: 'utf8',
})
reset.end(
  'DELETE FROM dictionary_lexicon_forms;\nDELETE FROM dictionary_lexicon_senses;\nDELETE FROM dictionary_lexicon_metadata;\n',
)
await new Promise((resolveEnd, reject) => {
  reset.once('error', reject)
  reset.once('finish', resolveEnd)
})

const metadata = createWriteStream(
  resolve(outputDirectory, '900-metadata.sql'),
  {
    encoding: 'utf8',
  },
)
metadata.end(
  `INSERT INTO dictionary_lexicon_metadata (resource_name, resource_version, license_name, source_url, imported_at, sense_count, lemma_count) VALUES ('open-english-wordnet', '2025', 'CC BY 4.0', 'https://en-word.net/', ${sql(new Date().toISOString())}, ${senseCount}, ${lemmas.size});\n`,
)
await new Promise((resolveEnd, reject) => {
  metadata.once('error', reject)
  metadata.once('finish', resolveEnd)
})

process.stdout.write(
  JSON.stringify({
    outputDirectory,
    senseCount,
    lemmaCount: lemmas.size,
    formCount,
  }) + '\n',
)
