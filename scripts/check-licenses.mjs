import { execFileSync } from 'node:child_process'

const reviewedLicenses = new Set([
  'Apache-2.0',
  'Apache-2.0 AND LGPL-3.0-or-later',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT OR Apache-2.0',
  'MIT-0',
  'MPL-2.0',
])

const packageManagerCli = process.env.npm_execpath
if (!packageManagerCli) {
  throw new Error('Run this check through pnpm so npm_execpath is available.')
}
const raw = execFileSync(
  process.execPath,
  [packageManagerCli, 'licenses', 'list', '--json'],
  {
    encoding: 'utf8',
  },
)
const report = JSON.parse(raw)
const licenses = Object.keys(report).sort()
const unreviewed = licenses.filter((license) => !reviewedLicenses.has(license))

if (unreviewed.length > 0) {
  console.error(`Unreviewed dependency licenses: ${unreviewed.join(', ')}`)
  process.exit(1)
}

const packageCount = Object.values(report).reduce(
  (sum, packages) => sum + packages.length,
  0,
)
console.log(
  `License check passed (${packageCount} packages across ${licenses.length} reviewed license expressions).`,
)
