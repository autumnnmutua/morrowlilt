import { describe, expect, it, vi } from 'vitest'

import { WorkersAiDictionaryTranslationProvider } from '../../worker/providers/workers-ai'

describe('WorkersAiDictionaryTranslationProvider', () => {
  it('translates large result sets in bounded structured batches and preserves order', async () => {
    const run = vi.fn((_model: string, input: unknown) => {
      const messages = (input as { messages: Array<{ content: string }> })
        .messages
      const payload = JSON.parse(messages[1].content) as {
        items: Array<{ id: number; text: string }>
      }
      return Promise.resolve({
        response: {
          translations: payload.items.map((item) => ({
            id: item.id,
            translatedText: `中文：${item.text}`,
          })),
        },
      })
    })
    const provider = new WorkersAiDictionaryTranslationProvider({
      run,
    } as unknown as Ai)
    const source = Array.from(
      { length: 49 },
      (_, index) => `definition ${index}`,
    )

    const result = await provider.translateMany(source)

    expect(run).toHaveBeenCalledTimes(3)
    expect(result).toHaveLength(source.length)
    expect(result.map((item) => item.translatedText)).toEqual(
      source.map((text) => `中文：${text}`),
    )
  })
})
