import type { ProviderType } from '@/shared/types/desktop'

export interface ValidationResult {
  valid: boolean
  message: string
}

export interface GenerateOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface LLMResponse {
  text: string
  model?: string
  usage?: Record<string, number>
  raw?: unknown
}

export interface LLMChunk {
  text: string
  done: boolean
}

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  model: string
  temperature: number
  maxTokens: number
  timeout: number
  streaming: boolean
}

export interface LLMProvider {
  id: string
  name: string
  type: ProviderType
  validateConfig(): Promise<ValidationResult>
  generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse>
  stream(prompt: string, options?: GenerateOptions): AsyncIterable<LLMChunk>
}
