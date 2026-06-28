import type {
  GenerateOptions,
  LLMChunk,
  LLMProvider,
  LLMResponse,
  ProviderConfig,
  ValidationResult,
} from './types'

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeout: number,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...init, signal: init.signal ?? controller.signal })
    const text = await response.text()
    if (!response.ok)
      throw new Error(`Provider returned ${response.status}: ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : {}
  }
  finally {
    clearTimeout(timer)
  }
}

abstract class BaseProvider implements LLMProvider {
  id: string
  name: string
  type: ProviderConfig['type']

  constructor(protected readonly config: ProviderConfig) {
    this.id = config.id
    this.name = config.name
    this.type = config.type
  }

  async validateConfig(): Promise<ValidationResult> {
    if (!this.config.baseUrl)
      return { valid: false, message: 'Base URL is required.' }
    if (!this.config.model)
      return { valid: false, message: 'Model is required.' }
    if (!this.config.apiKey && !['ollama', 'lm-studio', 'openai-compatible'].includes(this.config.type))
      return { valid: false, message: 'API key is required for this profile.' }
    return { valid: true, message: 'Configuration shape is valid. Use Test connection for a live check.' }
  }

  abstract generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse>

  async *stream(prompt: string, options: GenerateOptions = {}): AsyncIterable<LLMChunk> {
    const response = await this.generate(prompt, options)
    yield { text: response.text, done: true }
  }
}

class OpenAICompatibleProvider extends BaseProvider {
  async generate(prompt: string, options: GenerateOptions = {}): Promise<LLMResponse> {
    const payload = await requestJson(
      join(this.config.baseUrl, 'chat/completions'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: options.model ?? this.config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature ?? this.config.temperature,
          max_tokens: options.maxTokens ?? this.config.maxTokens,
          stream: false,
        }),
        signal: options.signal,
      },
      this.config.timeout,
    ) as Record<string, unknown>
    const choices = payload.choices as Array<Record<string, unknown>> | undefined
    const message = choices?.[0]?.message as Record<string, unknown> | undefined
    return {
      text: String(message?.content ?? ''),
      model: String(payload.model ?? this.config.model),
      raw: payload,
    }
  }
}

class AnthropicProvider extends BaseProvider {
  async generate(prompt: string, options: GenerateOptions = {}): Promise<LLMResponse> {
    const payload = await requestJson(
      join(this.config.baseUrl || 'https://api.anthropic.com/v1', 'messages'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model ?? this.config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature ?? this.config.temperature,
          max_tokens: options.maxTokens ?? this.config.maxTokens,
        }),
        signal: options.signal,
      },
      this.config.timeout,
    ) as Record<string, unknown>
    const content = payload.content as Array<Record<string, unknown>> | undefined
    return {
      text: content?.filter(part => part.type === 'text').map(part => String(part.text ?? '')).join('') ?? '',
      model: String(payload.model ?? this.config.model),
      raw: payload,
    }
  }
}

class GeminiProvider extends BaseProvider {
  async generate(prompt: string, options: GenerateOptions = {}): Promise<LLMResponse> {
    const model = options.model ?? this.config.model
    const url = join(this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta', `models/${model}:generateContent`)
    const payload = await requestJson(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey ?? '',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? this.config.temperature,
            maxOutputTokens: options.maxTokens ?? this.config.maxTokens,
          },
        }),
        signal: options.signal,
      },
      this.config.timeout,
    ) as Record<string, unknown>
    const candidates = payload.candidates as Array<Record<string, unknown>> | undefined
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined
    const parts = content?.parts as Array<Record<string, unknown>> | undefined
    return { text: parts?.map(part => String(part.text ?? '')).join('') ?? '', model, raw: payload }
  }
}

class OllamaProvider extends BaseProvider {
  async generate(prompt: string, options: GenerateOptions = {}): Promise<LLMResponse> {
    const payload = await requestJson(
      join(this.config.baseUrl || 'http://127.0.0.1:11434', 'api/chat'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model ?? this.config.model,
          messages: [{ role: 'user', content: prompt }],
          options: { temperature: options.temperature ?? this.config.temperature },
          stream: false,
        }),
        signal: options.signal,
      },
      this.config.timeout,
    ) as Record<string, unknown>
    const message = payload.message as Record<string, unknown> | undefined
    return { text: String(message?.content ?? ''), model: String(payload.model ?? this.config.model), raw: payload }
  }
}

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'gemini':
      return new GeminiProvider(config)
    case 'ollama':
      return new OllamaProvider(config)
    case 'openai':
    case 'groq':
    case 'kimi':
    case 'lm-studio':
    case 'openai-compatible':
      return new OpenAICompatibleProvider(config)
  }
  throw new Error(`Unsupported provider type: ${String(config.type)}`)
}
