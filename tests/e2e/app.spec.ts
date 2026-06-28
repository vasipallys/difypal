import { chromium, expect, test } from '@playwright/test'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string

async function waitForDebugger(url: string): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/json/version`)
      if (response.ok)
        return
    }
    catch {
      // Electron has not opened its DevTools endpoint yet.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Electron DevTools endpoint did not become ready.')
}

test('creates, validates, visualizes, and approval-gates a workflow', async () => {
  test.setTimeout(90_000)
  const port = 9323
  const userDataDir = mkdtempSync(join(tmpdir(), 'dify-studio-e2e-'))
  const processHandle = spawn(electronPath, [
    `--remote-debugging-port=${port}`,
    process.cwd(),
  ], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      DIFY_STUDIO_USER_DATA_DIR: userDataDir,
    },
  })
  try {
    await waitForDebugger(`http://127.0.0.1:${port}`)
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    const window = browser.contexts()[0]!.pages()[0]!
    await test.step('create a draft', async () => {
      await expect(window.getByText('Dify DSL Studio').first()).toBeVisible()
      await window.getByTestId('requirement-input').fill('Summarize a support request accurately and return a concise response.')
      await window.getByTestId('generate-dsl').click()
      await expect(window.getByText('YAML / Dify DSL 0.6.0')).toBeVisible()
      await expect(window.locator('.monaco-editor')).toBeVisible()
    })
    await test.step('save and rename the project from its three-dot menu', async () => {
      await window.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(window.getByText('Project saved locally.')).toBeVisible()
      await window.getByRole('button', { name: /Project actions for/ }).click()
      await window.getByRole('menuitem', { name: 'Rename' }).click()
      await window.getByTestId('rename-project-input').fill('Renamed support workflow')
      await window.getByRole('button', { name: 'Save project name' }).click()
      await expect(window.getByRole('heading', { name: 'Renamed support workflow' })).toBeVisible()
      await expect(window.getByText('Project renamed to Renamed support workflow.')).toBeVisible()
    })
    await test.step('visualize and validate', async () => {
      await window.locator('.tabs').getByRole('button', { name: 'Visual Workflow' }).click()
      await expect(window.locator('.react-flow__node')).toHaveCount(3)
      await expect(window.locator('.workflow-node-title')).toHaveText(['User Input', 'Generate response', 'Output'])
      await expect(window.locator('.react-flow__edge')).toHaveCount(2)
      await window.getByRole('button', { name: 'Validation' }).click()
      await expect(window.getByText('All blocking checks pass')).toBeVisible()
    })
    await test.step('simulate with a visible trace', async () => {
      await window.locator('.tabs').getByRole('button', { name: 'Debugger' }).click()
      await window.getByTestId('run-debugger').click()
      await expect(window.locator('.trace-status')).toHaveText('succeeded')
      await expect(window.locator('.trace-step')).toHaveCount(3)
    })
    await test.step('approval gate export', async () => {
      await window.getByRole('button', { name: 'Export DSL' }).click()
      await expect(window.getByRole('heading', { name: 'Export final Dify DSL' })).toBeVisible()
    })
    await test.step('save an AI credential and request an external test inline', async () => {
      await window.getByRole('button', { name: 'AI settings' }).click()
      await window.getByTestId('ai-provider').selectOption('openai')
      await window.getByTestId('ai-api-key').fill('e2e-placeholder-key')
      await window.getByTestId('save-ai-profile').click()
      await expect(window.getByTestId('approve-ai-save')).toBeVisible()
      await window.getByTestId('approve-ai-save').click()
      await expect(window.getByText('AI profile and encrypted credential saved.')).toBeVisible()
      await window.getByTestId('test-ai-profile').click()
      await expect(window.getByTestId('approve-ai-test')).toBeVisible()
    })
    await browser.close()
  }
  finally {
    if (processHandle.exitCode === null) {
      processHandle.kill()
      await Promise.race([
        new Promise(resolve => processHandle.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 2_000)),
      ])
    }
    if (userDataDir.startsWith(tmpdir())) {
      try {
        rmSync(userDataDir, { recursive: true, force: true })
      }
      catch {
        // A short-lived Chromium helper can still hold the cache on Windows.
      }
    }
  }
})
