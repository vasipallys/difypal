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
    })
    await test.step('visualize and validate', async () => {
      await window.locator('.tabs').getByRole('button', { name: 'Visual Workflow' }).click()
      await expect(window.locator('.react-flow__node')).toHaveCount(3)
      await window.getByRole('button', { name: 'Validation' }).click()
      await expect(window.getByText('All blocking checks pass')).toBeVisible()
    })
    await test.step('approval gate export', async () => {
      await window.getByRole('button', { name: 'Export DSL' }).click()
      await expect(window.getByRole('heading', { name: 'Export final Dify DSL' })).toBeVisible()
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
