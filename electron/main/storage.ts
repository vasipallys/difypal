import { app, safeStorage } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AIProfile,
  ApprovalRequest,
  DifyProfile,
  ProjectSummary,
  StudioProject,
} from '@/shared/types/desktop'

type ProfileKind = 'ai' | 'dify'

export class StorageService {
  private readonly db: import('node:sqlite').DatabaseSync

  constructor() {
    const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite') | undefined
    if (!sqlite)
      throw new Error('This Electron runtime does not provide the built-in SQLite module.')
    const directory = join(app.getPath('userData'), 'workspace')
    mkdirSync(directory, { recursive: true })
    this.db = new sqlite.DatabaseSync(join(directory, 'studio.sqlite'))
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        app_mode TEXT NOT NULL DEFAULT 'workflow',
        requirement TEXT NOT NULL DEFAULT '',
        dsl TEXT NOT NULL DEFAULT '',
        documentation TEXT NOT NULL DEFAULT '',
        generated_tests TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        data TEXT NOT NULL,
        encrypted_secret TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        action TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        risk TEXT NOT NULL,
        status TEXT NOT NULL,
        diff TEXT,
        created_at TEXT NOT NULL,
        decided_at TEXT
      );
    `)
  }

  listProjects(): ProjectSummary[] {
    const rows = this.db.prepare(`
      SELECT id, name, description, app_mode, created_at, updated_at
      FROM projects ORDER BY updated_at DESC
    `).all() as Array<Record<string, string>>
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      appMode: row.app_mode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  getProject(id: string): StudioProject | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, string> | undefined
    if (!row)
      return null
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      appMode: row.app_mode,
      requirement: row.requirement,
      dsl: row.dsl,
      documentation: row.documentation,
      generatedTests: row.generated_tests,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  saveProject(input: Partial<StudioProject> & { name: string }): StudioProject {
    const existing = input.id ? this.getProject(input.id) : null
    const now = new Date().toISOString()
    const project: StudioProject = {
      id: existing?.id ?? randomUUID(),
      name: input.name.trim() || 'Untitled project',
      description: input.description ?? existing?.description ?? '',
      appMode: input.appMode ?? existing?.appMode ?? 'workflow',
      requirement: input.requirement ?? existing?.requirement ?? '',
      dsl: input.dsl ?? existing?.dsl ?? '',
      documentation: input.documentation ?? existing?.documentation ?? '',
      generatedTests: input.generatedTests ?? existing?.generatedTests ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.db.prepare(`
      INSERT INTO projects (
        id, name, description, app_mode, requirement, dsl, documentation,
        generated_tests, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        description=excluded.description,
        app_mode=excluded.app_mode,
        requirement=excluded.requirement,
        dsl=excluded.dsl,
        documentation=excluded.documentation,
        generated_tests=excluded.generated_tests,
        updated_at=excluded.updated_at
    `).run(
      project.id,
      project.name,
      project.description,
      project.appMode,
      project.requirement,
      project.dsl,
      project.documentation,
      project.generatedTests,
      project.createdAt,
      project.updatedAt,
    )
    return project
  }

  removeProject(id: string): void {
    this.db.prepare('DELETE FROM approvals WHERE project_id = ?').run(id)
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  private encrypt(secret: string): string {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error('OS-backed secret encryption is unavailable. The credential was not saved.')
    return safeStorage.encryptString(secret).toString('base64')
  }

  private decrypt(value?: string | null): string | null {
    if (!value)
      return null
    if (!safeStorage.isEncryptionAvailable())
      throw new Error('OS-backed secret decryption is unavailable.')
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  }

  listProfiles<T extends AIProfile | DifyProfile>(kind: ProfileKind): T[] {
    const rows = this.db.prepare('SELECT data, encrypted_secret FROM profiles WHERE kind = ? ORDER BY updated_at DESC').all(kind) as Array<Record<string, string>>
    return rows.map(row => ({
      ...(JSON.parse(row.data) as T),
      hasApiKey: Boolean(row.encrypted_secret),
    }))
  }

  saveProfile<T extends AIProfile | DifyProfile>(kind: ProfileKind, profile: T, secret?: string): T {
    const existing = this.db.prepare('SELECT encrypted_secret FROM profiles WHERE id = ? AND kind = ?').get(profile.id, kind) as { encrypted_secret?: string } | undefined
    const encrypted = secret ? this.encrypt(secret) : existing?.encrypted_secret ?? null
    const publicProfile = { ...profile, hasApiKey: Boolean(encrypted) }
    this.db.prepare(`
      INSERT INTO profiles (id, kind, data, encrypted_secret, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind=excluded.kind,
        data=excluded.data,
        encrypted_secret=excluded.encrypted_secret,
        updated_at=excluded.updated_at
    `).run(profile.id, kind, JSON.stringify(publicProfile), encrypted, new Date().toISOString())
    return publicProfile
  }

  getProfileSecret(id: string, kind: ProfileKind): string | null {
    const row = this.db.prepare('SELECT encrypted_secret FROM profiles WHERE id = ? AND kind = ?').get(id, kind) as { encrypted_secret?: string } | undefined
    return this.decrypt(row?.encrypted_secret)
  }

  getProfile<T extends AIProfile | DifyProfile>(id: string, kind: ProfileKind): T | null {
    const row = this.db.prepare('SELECT data FROM profiles WHERE id = ? AND kind = ?').get(id, kind) as { data: string } | undefined
    return row ? JSON.parse(row.data) as T : null
  }

  listApprovals(projectId?: string): ApprovalRequest[] {
    const rows = (projectId
      ? this.db.prepare('SELECT * FROM approvals WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
      : this.db.prepare('SELECT * FROM approvals ORDER BY created_at DESC').all()) as Array<Record<string, string>>
    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id || undefined,
      action: row.action as ApprovalRequest['action'],
      title: row.title,
      summary: row.summary,
      risk: row.risk as ApprovalRequest['risk'],
      status: row.status as ApprovalRequest['status'],
      diff: row.diff || undefined,
      createdAt: row.created_at,
      decidedAt: row.decided_at || undefined,
    }))
  }

  createApproval(input: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>): ApprovalRequest {
    const request: ApprovalRequest = {
      ...input,
      id: randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    this.db.prepare(`
      INSERT INTO approvals (id, project_id, action, title, summary, risk, status, diff, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.id,
      request.projectId ?? null,
      request.action,
      request.title,
      request.summary,
      request.risk,
      request.status,
      request.diff ?? null,
      request.createdAt,
    )
    return request
  }

  decideApproval(id: string, status: ApprovalRequest['status']): ApprovalRequest {
    const decidedAt = new Date().toISOString()
    this.db.prepare('UPDATE approvals SET status = ?, decided_at = ? WHERE id = ?').run(status, decidedAt, id)
    const request = this.listApprovals().find(item => item.id === id)
    if (!request)
      throw new Error('Approval request not found.')
    return request
  }
}
