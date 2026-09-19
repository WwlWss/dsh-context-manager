import type { Context } from '@deepseek-ai/cordis'
import {
  renderSkillContent,
  type SkillCandidate,
  type SkillDefinition,
  type SkillInvocationPolicy,
  type SkillProvider,
  type SkillProviderControl,
  type SkillSummary,
} from '@deepseek-ai/dsh-skill'
import {
  bindScopeParent,
  createScope,
  scopeParentOf,
  type ScopeKey,
  type ScopeParentBinding,
} from '@deepseek-ai/dsh-scope'

function consumeSkillContract(ctx: Context, key: ScopeKey): void {
  let borrowed: SkillProviderControl | undefined
  const stop = ctx.skills.registerProvider((control) => {
    borrowed = control
    const provider: SkillProvider = {
      name: 'contract-provider',
      async list() {
        const candidate: SkillCandidate = {
          name: 'contract-skill',
          description: 'Contract skill',
          invocation: {
            modelInvocable: true,
            userInvocable: false,
          },
          source: 'custom',
          provider: 'contract-provider',
          rank: Number.MAX_VALUE,
          locator: 'contract-skill',
        }
        return [candidate]
      },
      async get(candidate) {
        const definition: SkillDefinition = {
          name: candidate.name,
          description: candidate.description,
          invocation: candidate.invocation,
          source: candidate.source,
          provider: candidate.provider,
          content: 'contract body',
        }
        return definition
      },
    }
    return provider
  })

  const signal: AbortSignal | undefined = borrowed?.signal
  void signal
  borrowed?.invalidate()

  const listed: Promise<SkillSummary[]> = ctx.skills.list({ scope: key })
  const snapshot = ctx.skills.snapshot({ scope: key })
  const loaded = ctx.skills.get('contract-skill', { scope: key })
  void listed
  void snapshot
  void loaded

  const policy: SkillInvocationPolicy = {
    modelInvocable: false,
    userInvocable: true,
  }
  void policy

  const rendered: string = renderSkillContent({
    name: 'contract-skill',
    provider: 'contract-provider',
    content: 'contract body',
  })
  void rendered

  const child = {}
  const scope = createScope(ctx, child, { parent: key })
  const parent: ScopeKey | undefined = scopeParentOf(child)
  void parent
  void scope

  const reparented = {}
  const parentBinding: ScopeParentBinding = bindScopeParent(reparented, key)
  parentBinding.rebind(child)
  const reboundParent: ScopeKey | undefined = scopeParentOf(reparented)
  void reboundParent
  stop()
}

void consumeSkillContract
