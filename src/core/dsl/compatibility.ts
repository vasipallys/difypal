import { CURRENT_DIFY_DSL_VERSION } from '@/shared/types/dsl'

export type CompatibilityStatus = 'current' | 'warning' | 'confirmation-required' | 'invalid'

export interface CompatibilityResult {
  status: CompatibilityStatus
  message: string
}

function parts(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version)
  if (!match)
    return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function checkVersionCompatibility(
  importedVersion: string,
  currentVersion = CURRENT_DIFY_DSL_VERSION,
): CompatibilityResult {
  const imported = parts(importedVersion)
  const current = parts(currentVersion)
  if (!imported || !current)
    return { status: 'invalid', message: `Invalid DSL version "${importedVersion}".` }

  const importedIsNewer = imported[0] > current[0]
    || (imported[0] === current[0] && imported[1] > current[1])
    || (imported[0] === current[0] && imported[1] === current[1] && imported[2] > current[2])
  if (importedIsNewer)
    return {
      status: 'confirmation-required',
      message: `DSL ${importedVersion} is newer than Studio's source-derived ${currentVersion} profile.`,
    }

  if (imported[0] < current[0])
    return {
      status: 'confirmation-required',
      message: `DSL ${importedVersion} has an older major version than ${currentVersion}.`,
    }

  if (imported[1] < current[1])
    return {
      status: 'warning',
      message: `DSL ${importedVersion} is accepted with migration warnings by Dify ${currentVersion}.`,
    }

  return {
    status: 'current',
    message: importedVersion === currentVersion
      ? `DSL matches current version ${currentVersion}.`
      : `DSL ${importedVersion} is patch-compatible with ${currentVersion}.`,
  }
}
