import type { AIProfile, ProviderType } from '@/shared/types/desktop'

export interface ProviderPreset {
  type: ProviderType
  label: string
  baseUrl: string
  model: string
  temperature: number
  requiresApiKey: boolean
  local: boolean
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    type: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    temperature: 0.3,
    requiresApiKey: true,
    local: false,
  },
  {
    type: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.3,
    requiresApiKey: true,
    local: false,
  },
  {
    type: 'anthropic',
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
    temperature: 0.3,
    requiresApiKey: true,
    local: false,
  },
  {
    type: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.5-flash',
    temperature: 0.3,
    requiresApiKey: true,
    local: false,
  },
  {
    type: 'kimi',
    label: 'Kimi (Moonshot AI)',
    baseUrl: 'https://api.moonshot.ai/v1',
    model: 'kimi-k2.6',
    temperature: 1,
    requiresApiKey: true,
    local: false,
  },
  {
    type: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    temperature: 0.3,
    requiresApiKey: false,
    local: true,
  },
  {
    type: 'lm-studio',
    label: 'LM Studio (local)',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'local-model',
    temperature: 0.3,
    requiresApiKey: false,
    local: true,
  },
  {
    type: 'openai-compatible',
    label: 'Custom OpenAI-compatible / local',
    baseUrl: 'http://127.0.0.1:8080/v1',
    model: 'local-model',
    temperature: 0.3,
    requiresApiKey: false,
    local: true,
  },
] as const

export function getProviderPreset(type: ProviderType): ProviderPreset {
  return PROVIDER_PRESETS.find(preset => preset.type === type) ?? PROVIDER_PRESETS[0]
}

export function isLoopbackAIProfile(profile: Pick<AIProfile, 'baseUrl'>): boolean {
  try {
    const hostname = new URL(profile.baseUrl).hostname.toLowerCase()
    return hostname === 'localhost'
      || hostname === '::1'
      || hostname === '[::1]'
      || hostname === '0.0.0.0'
      || hostname.startsWith('127.')
  }
  catch {
    return false
  }
}
