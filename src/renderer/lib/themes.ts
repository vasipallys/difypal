export const workspaceThemes = [
  { id: 'graphite', label: 'Graphite' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'ember', label: 'Ember' },
  { id: 'daylight', label: 'Daylight' },
] as const

export type WorkspaceTheme = typeof workspaceThemes[number]['id']

export const DEFAULT_WORKSPACE_THEME: WorkspaceTheme = 'graphite'
export const THEME_STORAGE_KEY = 'dify-studio:theme'

export function isWorkspaceTheme(value: unknown): value is WorkspaceTheme {
  return typeof value === 'string' && workspaceThemes.some(theme => theme.id === value)
}

export function loadWorkspaceTheme(): WorkspaceTheme {
  try {
    if (typeof localStorage === 'undefined')
      return DEFAULT_WORKSPACE_THEME
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isWorkspaceTheme(stored) ? stored : DEFAULT_WORKSPACE_THEME
  }
  catch {
    return DEFAULT_WORKSPACE_THEME
  }
}

export function saveWorkspaceTheme(theme: WorkspaceTheme): void {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
  catch {
    // Theme persistence should never block the workspace.
  }
}
