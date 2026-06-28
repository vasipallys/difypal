import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProvider } from '@/core/ai/providers'
import { getProviderPreset, isLoopbackAIProfile, PROVIDER_PRESETS } from '@/core/ai/presets'
import type { ProviderConfig } from '@/core/ai/types'
import type { ProviderType } from '@/shared/types/desktop'

function config(type: ProviderType): ProviderConfig {
  const preset = getProviderPreset(type)
  return {
    id: type,
    name: preset.label,
    type,
    baseUrl: preset.baseUrl,
    apiKey: preset.requiresApiKey ? 'test-secret' : undefined,
    model: preset.model,
    temperature: preset.temperature,
    maxTokens: 128,
    timeout: 5_000,
    streaming: false,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI provider presets', () => {
  it('provides explicit hosted and local profiles', () => {
    expect(PROVIDER_PRESETS.map(preset => preset.type)).toEqual([
      'openai',
      'groq',
      'anthropic',
      'gemini',
      'kimi',
      'ollama',
      'lm-studio',
      'openai-compatible',
    ])
    expect(getProviderPreset('kimi').baseUrl).toBe('https://api.moonshot.ai/v1')
    expect(getProviderPreset('lm-studio').local).toBe(true)
  })

  it('distinguishes loopback models from external provider endpoints', () => {
    expect(isLoopbackAIProfile({ baseUrl: 'http://127.0.0.1:11434' })).toBe(true)
    expect(isLoopbackAIProfile({ baseUrl: 'http://localhost:1234/v1' })).toBe(true)
    expect(isLoopbackAIProfile({ baseUrl: 'http://[::1]:8080/v1' })).toBe(true)
    expect(isLoopbackAIProfile({ baseUrl: 'https://api.openai.com/v1' })).toBe(false)
    expect(isLoopbackAIProfile({ baseUrl: 'not a URL' })).toBe(false)
  })

  it.each(['openai', 'groq', 'kimi', 'lm-studio', 'openai-compatible'] as const)(
    'uses OpenAI chat completions for %s',
    async (type) => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
        model: 'test-model',
        choices: [{ message: { content: 'OK' } }],
      }), { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const response = await createProvider(config(type)).generate('ping')

      expect(response.text).toBe('OK')
      const [url, request] = fetchMock.mock.calls[0]!
      expect(String(url)).toBe(`${getProviderPreset(type).baseUrl}/chat/completions`)
      expect((request as RequestInit).method).toBe('POST')
      const body = JSON.parse(String((request as RequestInit).body)) as Record<string, unknown>
      expect(body.model).toBe(getProviderPreset(type).model)
      const headers = (request as RequestInit).headers as Record<string, string>
      if (getProviderPreset(type).requiresApiKey)
        expect(headers.Authorization).toBe('Bearer test-secret')
      else
        expect(headers.Authorization).toBeUndefined()
    },
  )

  it('uses the Anthropic Messages API for Claude', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      model: 'claude-test',
      content: [{ type: 'text', text: 'OK' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await createProvider(config('anthropic')).generate('ping')

    expect(response.text).toBe('OK')
    const [url, request] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages')
    expect((request as RequestInit).headers).toMatchObject({
      'x-api-key': 'test-secret',
      'anthropic-version': '2023-06-01',
    })
  })

  it('uses generateContent and an API-key header for Gemini', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'OK' }] } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await createProvider(config('gemini')).generate('ping')

    expect(response.text).toBe('OK')
    const [url, request] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/models/gemini-3.5-flash:generateContent')
    expect(String(url)).not.toContain('test-secret')
    expect((request as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'test-secret' })
  })

  it('uses the local Ollama chat endpoint without requiring a key', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      model: 'llama3.2',
      message: { content: 'OK' },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = createProvider(config('ollama'))

    expect((await provider.validateConfig()).valid).toBe(true)
    expect((await provider.generate('ping')).text).toBe('OK')
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://127.0.0.1:11434/api/chat')
  })
})
