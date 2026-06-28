import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '@/shared/types/desktop'

const api: DesktopApi = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    get: id => ipcRenderer.invoke('projects:get', id),
    save: project => ipcRenderer.invoke('projects:save', project),
    remove: id => ipcRenderer.invoke('projects:remove', id),
  },
  files: {
    importDsl: () => ipcRenderer.invoke('files:import-dsl'),
    exportDsl: (content, suggestedName) => ipcRenderer.invoke('files:export-dsl', content, suggestedName),
    exportText: (content, suggestedName, format) => ipcRenderer.invoke('files:export-text', content, suggestedName, format),
  },
  settings: {
    listAI: () => ipcRenderer.invoke('settings:list-ai'),
    saveAI: (profile, apiKey) => ipcRenderer.invoke('settings:save-ai', profile, apiKey),
    listDify: () => ipcRenderer.invoke('settings:list-dify'),
    saveDify: (profile, apiKey) => ipcRenderer.invoke('settings:save-dify', profile, apiKey),
  },
  approvals: {
    list: projectId => ipcRenderer.invoke('approvals:list', projectId),
    create: request => ipcRenderer.invoke('approvals:create', request),
    decide: (id, status) => ipcRenderer.invoke('approvals:decide', id, status),
  },
  runtime: {
    validate: content => ipcRenderer.invoke('runtime:validate', content),
    simulate: (content, inputs, mocks) => ipcRenderer.invoke('runtime:simulate', content, inputs, mocks),
    generateAI: (profileId, prompt) => ipcRenderer.invoke('runtime:generate-ai', profileId, prompt),
    runDify: (profileId, inputs, user) => ipcRenderer.invoke('runtime:run-dify', profileId, inputs, user),
    testDify: profileId => ipcRenderer.invoke('runtime:test-dify', profileId),
    testAI: profileId => ipcRenderer.invoke('runtime:test-ai', profileId),
  },
  platform: process.platform,
}

contextBridge.exposeInMainWorld('studio', api)
