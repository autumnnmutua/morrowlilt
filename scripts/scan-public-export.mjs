import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const trackedOnly = process.argv.includes('--tracked')
const ignoredDirectories = new Set([
  '.git',
  '.wrangler',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
])
const forbiddenDirectories = new Set([
  'private',
  'logs',
  'screenshots',
  'backups',
])
const forbiddenNames = [
  /^\.dev\.vars/i,
  /^\.env(?!\.example$)/i,
  /\.private\./i,
  /\.docx$/i,
  /\.(?:sqlite3?|db)$/i,
  /deployment[-_]record/i,
  /release[-_]readiness/i,
  /production[-_]smoke/i,
]
const textExtensions = new Set([
  '',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.md',
  '.mjs',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])
const patterns = [
  ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  [
    'credential-like token',
    /\b(?:Bearer\s+[A-Za-z0-9._~+\/-]{12,}|sk_[A-Za-z0-9_-]{12,}|re_[A-Za-z0-9_-]{12,})\b/g,
  ],
  [
    'UUID/resource identifier',
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  ],
  [
    'Windows user path',
    /[A-Z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s"'<>]+/gi,
  ],
  ['Unix user path', /\/(?:Users|home)\/[^/\s"'<>]+/g],
  ['workers.dev deployment URL', /https?:\/\/[a-z0-9.-]+\.workers\.dev\b/gi],
  [
    'install-specific JSON value',
    /"(?:account_id|database_id|preview_database_id|team_domain|team_audience|sender|recipient)"\s*:\s*"(?!<PLACEHOLDER>|)[^"]+"/gi,
  ],
  ['excluded report filename', /Codex[^/\\]*开发与发布报告[^/\\]*\.docx/g],
]

function collectFiles(directory) {
  const output = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) output.push(...collectFiles(path))
    else if (entry.isFile()) output.push(path)
  }
  return output
}

function trackedFiles() {
  const raw = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  return raw
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((file) => resolve(root, file))
}

function entropy(value) {
  const counts = new Map()
  for (const character of value)
    counts.set(character, (counts.get(character) ?? 0) + 1)
  return [...counts.values()].reduce((sum, count) => {
    const probability = count / value.length
    return sum - probability * Math.log2(probability)
  }, 0)
}

const findings = []
const files = trackedOnly ? trackedFiles() : collectFiles(root)

for (const path of files) {
  const relativePath = relative(root, path).split(sep).join('/')
  const parts = relativePath.split('/')
  for (const directory of parts.slice(0, -1)) {
    if (forbiddenDirectories.has(directory))
      findings.push(`${relativePath}: forbidden directory '${directory}'`)
  }
  for (const pattern of forbiddenNames) {
    if (pattern.test(parts.at(-1)))
      findings.push(`${relativePath}: forbidden filename`)
    pattern.lastIndex = 0
  }
  if (!textExtensions.has(extname(path).toLowerCase())) continue
  if (statSync(path).size > 5_000_000) continue
  const content = readFileSync(path, 'utf8')
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (relativePath !== 'scripts/scan-public-export.mjs') {
      for (const [label, pattern] of patterns) {
        pattern.lastIndex = 0
        if (pattern.test(line))
          findings.push(`${relativePath}:${index + 1}: ${label}`)
      }
    }
    if (
      relativePath !== 'pnpm-lock.yaml' &&
      relativePath !== 'worker-configuration.d.ts' &&
      relativePath !== 'scripts/scan-public-export.mjs'
    ) {
      const candidates = line.match(/["'`]([A-Za-z0-9_+./=-]{32,})["'`]/g) ?? []
      for (const candidate of candidates) {
        const value = candidate.slice(1, -1)
        if (new Set(value).size >= 12 && entropy(value) >= 4.5)
          findings.push(
            `${relativePath}:${index + 1}: high-entropy quoted string`,
          )
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`Public export scan found ${findings.length} issue(s):`)
  for (const finding of [...new Set(findings)]) console.error(`- ${finding}`)
  process.exit(1)
}

console.log(
  `Public export scan passed (${files.length} ${trackedOnly ? 'tracked ' : ''}files checked).`,
)
