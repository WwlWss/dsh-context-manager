import type { Context } from '@deepseek-ai/cordis'
import type SkillRegistry from '@deepseek-ai/dsh-skill'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
import { scopeParentOf } from '@deepseek-ai/dsh-scope'

import type { RuntimeAgent } from './agent-runtime.js'

/** Resolve the shared native SkillRegistry capability or fail loud on composition drift. */
export function requireSkillRegistry(ctx: Context): SkillRegistry {
  const skills = ctx.get('skills')
  if (skills === undefined) {
    throw new TypeError('dsh-context-manager: SkillRegistry service unavailable')
  }
  return skills as SkillRegistry
}

/** Current workspace cwd used by native ToolSkill lookups for this Agent. */
export function agentWorkspaceCwd(agent: RuntimeAgent): string | undefined {
  const raw = agent as unknown as {
    session?: {
      header?: {
        cwd?: unknown
      }
    }
  }
  const cwd = raw.session?.header?.cwd
  return typeof cwd === 'string' ? cwd : undefined
}

/** Combine one caller request lifetime with an optional CM registration lifetime. */
export function combineSkillSignals(
  caller: AbortSignal | undefined,
  lifecycle?: AbortSignal,
): AbortSignal | undefined {
  if (lifecycle === undefined) return caller
  if (caller === undefined || caller === lifecycle) return lifecycle
  return AbortSignal.any([caller, lifecycle])
}

/**
 * Project one lookup into the Agent's dynamic parent Skill view.
 *
 * The parent is intentionally recomputed for every call because DSH may
 * re-parent an existing Agent scope when a standing preset changes.
 */
export function parentSkillViewOptions(
  agent: RuntimeAgent,
  options: SkillLookupOptions = {},
  lifecycle?: AbortSignal,
): SkillLookupOptions {
  const parent = scopeParentOf(agent)
  const signal = combineSkillSignals(options.signal, lifecycle)
  return {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(signal === undefined ? {} : { signal }),
    ...(parent === undefined ? {} : { scope: parent }),
  }
}
