import type { Context } from '@deepseek-ai/cordis'
import type Schema from '@deepseek-ai/schemastery'

export interface SettingsSectionHooks<T> {
  setSource(source: () => T): void
  onChange(): void
  validate?(value: T): void
}

type InstallSettingsSection = <T>(
  ctx: Context,
  namespace: string,
  schema: Schema<T>,
  entry: T,
  hooks: SettingsSectionHooks<T>,
) => void

interface ModernSettingsProvider {
  installSection?: InstallSettingsSection
}

export interface SettingsModuleCompat {
  installSettingsSection?: InstallSettingsSection
  settingsNamespace?: (value: string) => string
}

export function resolveSettingsNamespace(api: SettingsModuleCompat, value: string): string {
  return typeof api.settingsNamespace === 'function' ? api.settingsNamespace(value) : value
}

export function installSettingsSectionCompat<T>(
  api: SettingsModuleCompat,
  ctx: Context,
  namespace: string,
  schema: Schema<T>,
  entry: T,
  hooks: SettingsSectionHooks<T>,
): void {
  if (typeof api.installSettingsSection === 'function') {
    api.installSettingsSection(ctx, namespace, schema, entry, hooks)
    return
  }

  ctx.inject(['settings'], (settingsCtx) => {
    const provider = settingsCtx.get('settings') as ModernSettingsProvider | undefined
    if (typeof provider?.installSection !== 'function') {
      throw new Error('Unsupported DSH settings API: expected installSettingsSection() or ctx.settings.installSection()')
    }
    provider.installSection(ctx, namespace, schema, entry, hooks)
  })
}
