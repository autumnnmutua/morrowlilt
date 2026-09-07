import type { ContentProvider } from './contracts'
import { HttpContentProvider } from './http-content'
import { WorkersAiContentProvider } from './workers-ai'
import {
  getContentProviderConfig,
  getWorkersAiBinding,
  isWorkersAiContentEnabled,
} from '../runtime-config'

export function getOnlineContentProvider(
  env: Env,
): ContentProvider | undefined {
  const config = getContentProviderConfig(env)
  if (config) return new HttpContentProvider(config.endpoint, config.apiKey)
  const ai = getWorkersAiBinding(env)
  return isWorkersAiContentEnabled(env) && ai
    ? new WorkersAiContentProvider(ai)
    : undefined
}
