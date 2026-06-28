import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { StorageService } from './storage'
import { validateDsl } from '@/core/validation/validator'
import { simulateDsl } from '@/core/runner/simulator'
import { redactSecrets, redactText } from '@/core/security/redaction'
import { createProvider } from '@/core/ai/providers'
import { buildContentSecurityPolicy } from '@/core/security/csp'
import type { AIProfile, ApprovalRequest, DifyProfile, StudioProject } from '@/shared/types/desktop'

if (process.env.DIFY_STUDIO_USER_DATA_DIR)
  app.setPath('userData', process.env.DIFY_STUDIO_USER_DATA_DIR)

let mainWindow: BrowserWindow | null = null
let storage: StorageService

function endpoint(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const normalizedPath = path.replace(/^\/+/, '')
  if (base.endsWith('/v1'))
    return `${base}/${normalizedPath.replace(/^v1\//, '')}`
  return `${base}/${normalizedPath}`
}

async function createWindow(): Promise<void> {
  const developmentUrl = process.env.VITE_DEV_SERVER_URL?.trim()
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#0d131c',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.removeMenu()
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] Process exited: ${details.reason} (${details.exitCode})`)
  })
  mainWindow.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning')
      console.error(`[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`)
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void import('electron').then(({ shell }) => shell.openExternal(url))
    return { action: 'deny' }
  })

  if (developmentUrl) {
    console.log(`[main] Loading development renderer: ${developmentUrl}`)
    await mainWindow.loadURL(developmentUrl)
    if (process.env.DIFY_STUDIO_OPEN_DEVTOOLS === '1')
      mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
  else
    await mainWindow.loadFile(join(__dirname, '../dist/index.html'))
}

function registerIpc(): void {
  ipcMain.handle('projects:list', () => storage.listProjects())
  ipcMain.handle('projects:get', (_event, id: string) => storage.getProject(id))
  ipcMain.handle('projects:save', (_event, project: Partial<StudioProject> & { name: string }) => storage.saveProject(project))
  ipcMain.handle('projects:remove', (_event, id: string) => storage.removeProject(id))

  ipcMain.handle('files:import-dsl', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import Dify DSL',
      filters: [{ name: 'Dify DSL', extensions: ['yml', 'yaml'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0])
      return null
    const path = result.filePaths[0]
    const stats = await import('node:fs/promises').then(fs => fs.stat(path))
    if (stats.size > 10 * 1024 * 1024)
      throw new Error('DSL file exceeds Dify’s 10 MB import limit.')
    return { path, content: await readFile(path, 'utf8') }
  })

  ipcMain.handle('files:export-dsl', async (_event, content: string, suggestedName: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export Dify DSL',
      defaultPath: suggestedName.endsWith('.yml') ? suggestedName : `${suggestedName}.yml`,
      filters: [{ name: 'Dify DSL', extensions: ['yml', 'yaml'] }],
    })
    if (result.canceled || !result.filePath)
      return null
    await writeFile(result.filePath, content, { encoding: 'utf8', flag: 'w' })
    return result.filePath
  })

  ipcMain.handle('files:export-text', async (_event, content: string, suggestedName: string, format: 'md' | 'html') => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export documentation',
      defaultPath: `${suggestedName}.${format}`,
      filters: [{ name: format === 'md' ? 'Markdown' : 'HTML', extensions: [format] }],
    })
    if (result.canceled || !result.filePath)
      return null
    await writeFile(result.filePath, content, 'utf8')
    return result.filePath
  })

  ipcMain.handle('settings:list-ai', () => storage.listProfiles<AIProfile>('ai'))
  ipcMain.handle('settings:save-ai', (_event, profile: AIProfile, secret?: string) => storage.saveProfile('ai', profile, secret))
  ipcMain.handle('settings:list-dify', () => storage.listProfiles<DifyProfile>('dify'))
  ipcMain.handle('settings:save-dify', (_event, profile: DifyProfile, secret?: string) => storage.saveProfile('dify', profile, secret))

  ipcMain.handle('approvals:list', (_event, projectId?: string) => storage.listApprovals(projectId))
  ipcMain.handle('approvals:create', (_event, request: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>) => storage.createApproval(request))
  ipcMain.handle('approvals:decide', (_event, id: string, status: ApprovalRequest['status']) => storage.decideApproval(id, status))

  ipcMain.handle('runtime:validate', (_event, content: string) => validateDsl(content))
  ipcMain.handle('runtime:simulate', (_event, content: string, inputs: Record<string, unknown>, mocks: Record<string, unknown>) =>
    simulateDsl(content, inputs, mocks),
  )
  ipcMain.handle('runtime:generate-ai', async (_event, profileId: string, prompt: string) => {
    try {
      if (!prompt.trim())
        throw new Error('Prompt is required.')
      if (Buffer.byteLength(prompt, 'utf8') > 512 * 1024)
        throw new Error('Prompt exceeds the 512 KB safety limit.')
      const profile = storage.getProfile<AIProfile>(profileId, 'ai')
      if (!profile)
        throw new Error('AI profile not found.')
      const provider = createProvider({
        ...profile,
        apiKey: storage.getProfileSecret(profileId, 'ai') ?? undefined,
      })
      const config = await provider.validateConfig()
      if (!config.valid)
        throw new Error(config.message)
      const response = await provider.generate(prompt, {
        model: profile.model,
        temperature: profile.temperature,
        maxTokens: profile.maxTokens,
      })
      if (!response.text.trim())
        throw new Error('The selected model returned an empty response.')
      return {
        text: response.text,
        model: response.model || profile.model,
      }
    }
    catch (error) {
      throw new Error(redactText(error instanceof Error ? error.message : String(error)))
    }
  })
  ipcMain.handle('runtime:test-ai', async (_event, profileId: string) => {
    const profile = storage.getProfile<AIProfile>(profileId, 'ai')
    if (!profile)
      return { ok: false, message: 'Profile not found.' }
    try {
      const provider = createProvider({
        ...profile,
        apiKey: storage.getProfileSecret(profileId, 'ai') ?? undefined,
      })
      const config = await provider.validateConfig()
      if (!config.valid)
        return { ok: false, message: config.message }
      const response = await provider.generate('Reply with exactly: OK', { maxTokens: 8, temperature: 0 })
      return { ok: Boolean(response.text), message: response.text ? `Connected. Model replied: ${response.text.slice(0, 80)}` : 'Provider returned an empty response.' }
    }
    catch (error) {
      return { ok: false, message: redactText(error instanceof Error ? error.message : String(error)) }
    }
  })
  ipcMain.handle('runtime:test-dify', async (_event, profileId: string) => {
    const profile = storage.getProfile<DifyProfile>(profileId, 'dify')
    if (!profile)
      return { ok: false, message: 'Profile not found.' }
    const secret = storage.getProfileSecret(profileId, 'dify')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), profile.timeout)
    try {
      const response = await fetch(endpoint(profile.baseUrl, 'v1/info'), {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
        signal: controller.signal,
      })
      return { ok: response.ok, message: response.ok ? 'Dify application API is reachable.' : `Dify returned HTTP ${response.status}.` }
    }
    catch (error) {
      return { ok: false, message: redactText(error instanceof Error ? error.message : String(error)) }
    }
    finally {
      clearTimeout(timer)
    }
  })
  ipcMain.handle('runtime:run-dify', async (_event, profileId: string, inputs: Record<string, unknown>, user: string) => {
    const profile = storage.getProfile<DifyProfile>(profileId, 'dify')
    if (!profile)
      throw new Error('Dify profile not found.')
    const apiKey = storage.getProfileSecret(profileId, 'dify')
    if (!apiKey)
      throw new Error('Dify API key is not configured.')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), profile.timeout)
    try {
      const response = await fetch(endpoint(profile.baseUrl, 'v1/workflows/run'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          inputs,
          response_mode: 'blocking',
          user: user || 'dify-dsl-studio',
        }),
        signal: controller.signal,
      })
      const text = await response.text()
      if (!response.ok)
        throw new Error(redactText(`Dify returned ${response.status}: ${text.slice(0, 500)}`))
      return redactSecrets(JSON.parse(text) as Record<string, unknown>)
    }
    finally {
      clearTimeout(timer)
    }
  })
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          buildContentSecurityPolicy(process.env.VITE_DEV_SERVER_URL?.trim()),
        ],
      },
    })
  })
  storage = new StorageService()
  registerIpc()
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0)
    void createWindow()
})
