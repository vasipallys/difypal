import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RuntimeEngineResult, RuntimeEngineStatus } from '@/shared/types/desktop'

interface BridgeResponse<T> {
  ok: boolean
  result?: T
  error?: {
    type?: string
    message?: string
    code?: string
    path?: string
  }
}

interface RunRequest {
  action: 'run'
  dsl: string
  inputs: Record<string, unknown>
  profile?: Record<string, unknown>
  workflowId?: string
}

const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

export class RuntimeEngineBridge {
  constructor(private readonly root: string) {}

  status(): Promise<RuntimeEngineStatus> {
    return this.invoke<RuntimeEngineStatus>({ action: 'status' })
  }

  run(request: Omit<RunRequest, 'action'>): Promise<RuntimeEngineResult> {
    return this.invoke<RuntimeEngineResult>({ action: 'run', ...request })
  }

  private pythonPath(): string {
    const executable = process.platform === 'win32'
      ? join(this.root, '.venv', 'Scripts', 'python.exe')
      : join(this.root, '.venv', 'bin', 'python')
    if (!existsSync(executable)) {
      throw new Error(
        'Standalone runtime is not installed. Run "npm run runtime:setup", then restart the app.',
      )
    }
    return executable
  }

  private invoke<T>(request: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      const child = spawn(this.pythonPath(), ['-m', 'dify_runtime_bridge'], {
        cwd: this.root,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONUNBUFFERED: '1',
        },
      })
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('Standalone runtime exceeded the 15 minute execution limit.'))
      }, 15 * 60 * 1000)

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
        if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES)
          child.kill()
      })
      child.stderr.on('data', (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-16_384)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        if (!settled) {
          settled = true
          reject(error)
        }
      })
      child.on('close', () => {
        clearTimeout(timer)
        if (settled)
          return
        settled = true
        try {
          const response = JSON.parse(stdout) as BridgeResponse<T>
          if (!response.ok || response.result === undefined) {
            const detail = [
              response.error?.message || 'Standalone runtime failed.',
              response.error?.code ? `[${response.error.code}]` : '',
              response.error?.path || '',
            ].filter(Boolean).join(' ')
            reject(new Error(detail))
            return
          }
          resolve(response.result)
        }
        catch {
          reject(new Error(
            `Standalone runtime returned invalid output.${stderr ? ` ${stderr}` : ''}`,
          ))
        }
      })
      child.stdin.end(JSON.stringify(request), 'utf8')
    })
  }
}
