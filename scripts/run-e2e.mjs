import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const persistencePath = await mkdtemp(join(tmpdir(), 'morrowlilt-e2e-'))

function runNodeScript(scriptPath, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun()
        return
      }
      reject(
        new Error(
          signal
            ? `Child process terminated by ${signal}`
            : `Child process exited with code ${String(code)}`,
        ),
      )
    })
  })
}

const testEnvironment = {
  ...process.env,
  MORROWLILT_PERSIST_PATH: persistencePath,
}

try {
  await runNodeScript(
    join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    [
      'd1',
      'migrations',
      'apply',
      'morrowlilt-local',
      '--local',
      '--persist-to',
      persistencePath,
    ],
    testEnvironment,
  )
  await runNodeScript(
    join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
    ['test'],
    testEnvironment,
  )
} finally {
  const resolvedTempRoot = resolve(tmpdir())
  const resolvedPersistencePath = resolve(persistencePath)
  const relativePath = relative(resolvedTempRoot, resolvedPersistencePath)
  if (
    relativePath &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath) &&
    basename(resolvedPersistencePath).startsWith('morrowlilt-e2e-')
  ) {
    await rm(resolvedPersistencePath, { recursive: true, force: true })
  }
}
