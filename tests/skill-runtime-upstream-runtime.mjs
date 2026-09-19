import assert from 'node:assert/strict'

import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { createScope, scopeParentOf } from '@deepseek-ai/dsh-scope'

const ctx = new Context()

function scopedSkills(scopedCtx) {
  const skills = scopedCtx.get('skills')
  if (skills === undefined) throw new Error('skills service missing from scoped context')
  return skills
}

function candidate(provider, name, rank, invocation, description = provider) {
  return {
    name,
    description,
    invocation,
    source: 'custom',
    provider,
    rank,
    locator: { name, provider, invocation, description },
  }
}

function providerFactory(provider, candidates, hooks = {}) {
  return control => {
    hooks.control?.(control)
    return {
      name: provider,
      async list() {
        hooks.list?.()
        return candidates
      },
      async get(selected) {
        hooks.get?.(selected)
        return {
          name: selected.name,
          description: selected.description,
          ...(selected.whenToUse === undefined ? {} : { whenToUse: selected.whenToUse }),
          invocation: selected.invocation,
          source: selected.source,
          provider: selected.provider,
          ...(selected.resourceBase === undefined ? {} : { resourceBase: selected.resourceBase }),
          content: `body:${selected.name}:${selected.provider}`,
          ...(selected.path === undefined ? {} : { path: selected.path }),
          ...(selected.metadata === undefined ? {} : { metadata: selected.metadata }),
        }
      },
    }
  }
}

try {
  await ctx.plugin(SkillRegistry)

  const globalSkill = candidate(
    'global-provider',
    'shadowed-skill',
    1,
    { modelInvocable: true, userInvocable: true },
  )
  const stopGlobal = ctx.skills.registerProvider(
    providerFactory('global-provider', [globalSkill]),
  )

  const parentKey = {}
  const childKey = {}
  const parent = createScope(ctx, parentKey)
  const child = createScope(ctx, childKey, { parent: parentKey })

  assert.equal(scopeParentOf(childKey), parentKey)
  assert.equal(scopeParentOf(parentKey), undefined)

  const parentSkill = candidate(
    'parent-provider',
    'shadowed-skill',
    Number.MAX_VALUE,
    { modelInvocable: false, userInvocable: true },
  )
  const stopParent = scopedSkills(parent.ctx).registerProvider(
    providerFactory('parent-provider', [parentSkill]),
  )

  let listed = await ctx.skills.list({ scope: childKey })
  assert.equal(listed.find(skill => skill.name === 'shadowed-skill')?.provider, 'parent-provider')

  const childSkill = candidate(
    'child-provider',
    'shadowed-skill',
    Number.MAX_VALUE,
    { modelInvocable: false, userInvocable: false },
  )
  const stopChild = scopedSkills(child.ctx).registerProvider(
    providerFactory('child-provider', [childSkill]),
  )

  listed = await ctx.skills.list({ scope: childKey })
  assert.equal(listed.find(skill => skill.name === 'shadowed-skill')?.provider, 'child-provider')

  const rankHigh = candidate(
    'rank-high',
    'same-layer-rank',
    100,
    { modelInvocable: true, userInvocable: true },
  )
  const rankLow = candidate(
    'rank-low',
    'same-layer-rank',
    -100,
    { modelInvocable: true, userInvocable: true },
  )
  const stopRankHigh = scopedSkills(child.ctx).registerProvider(
    providerFactory('rank-high', [rankHigh]),
  )
  const stopRankLow = scopedSkills(child.ctx).registerProvider(
    providerFactory('rank-low', [rankLow]),
  )

  listed = await ctx.skills.list({ scope: childKey })
  assert.equal(listed.find(skill => skill.name === 'same-layer-rank')?.provider, 'rank-low')

  const maxFirst = candidate(
    'max-first',
    'max-rank-tie',
    Number.MAX_VALUE,
    { modelInvocable: true, userInvocable: true },
  )
  const maxSecond = candidate(
    'max-second',
    'max-rank-tie',
    Number.MAX_VALUE,
    { modelInvocable: true, userInvocable: true },
  )
  const stopMaxFirst = scopedSkills(child.ctx).registerProvider(
    providerFactory('max-first', [maxFirst]),
  )
  const stopMaxSecond = scopedSkills(child.ctx).registerProvider(
    providerFactory('max-second', [maxSecond]),
  )

  listed = await ctx.skills.list({ scope: childKey })
  assert.equal(listed.find(skill => skill.name === 'max-rank-tie')?.provider, 'max-first')

  const policies = [
    ['policy-tt', true, true],
    ['policy-tf', true, false],
    ['policy-ft', false, true],
    ['policy-ff', false, false],
  ]
  const policyCandidates = policies.map(([name, modelInvocable, userInvocable]) =>
    candidate(
      'policy-provider',
      name,
      0,
      { modelInvocable, userInvocable },
    ),
  )
  const stopPolicies = ctx.skills.registerProvider(
    providerFactory('policy-provider', policyCandidates),
  )

  listed = await ctx.skills.list()
  for (const [name, modelInvocable, userInvocable] of policies) {
    const summary = listed.find(skill => skill.name === name)
    assert.ok(summary)
    assert.deepEqual(summary.invocation, { modelInvocable, userInvocable })
  }

  const hidden = await ctx.skills.get('policy-ff')
  assert.ok(hidden)
  assert.deepEqual(hidden.invocation, {
    modelInvocable: false,
    userInvocable: false,
  })
  assert.equal(hidden.content, 'body:policy-ff:policy-provider')

  const rendered = renderSkillContent({
    name: 'render-probe',
    provider: 'render-provider',
    resourceBase: {
      kind: 'directory',
      path: '/tmp/skill-root',
    },
    content: 'Use ./reference.md',
  })
  assert.match(rendered, /^<skill_content name="render-probe">/)
  assert.match(rendered, /Base directory for this skill: \/tmp\/skill-root/)
  assert.match(rendered, /<skill_instructions>\nUse \.\/reference\.md\n<\/skill_instructions>/)
  assert.match(rendered, /<\/skill_content>$/)

  let control
  let listCalls = 0
  let changes = 0
  ctx.on('skills/change', () => {
    changes += 1
  })

  const cachedCandidate = candidate(
    'cache-provider',
    'cache-probe',
    0,
    { modelInvocable: true, userInvocable: true },
  )
  const stopCache = ctx.skills.registerProvider(
    providerFactory('cache-provider', [cachedCandidate], {
      control(value) {
        control = value
      },
      list() {
        listCalls += 1
      },
    }),
  )

  await ctx.skills.list()
  const afterFirstList = listCalls
  await ctx.skills.list()
  assert.equal(listCalls, afterFirstList)

  const beforeInvalidateChanges = changes
  control.invalidate()
  assert.ok(changes > beforeInvalidateChanges)
  await ctx.skills.list()
  assert.ok(listCalls > afterFirstList)

  await Promise.resolve(stopCache())
  assert.equal(control.signal.aborted, true)
  const afterDisposeChanges = changes
  control.invalidate()
  assert.equal(changes, afterDisposeChanges)

  const snapshot = await ctx.skills.snapshot({ scope: childKey })
  assert.equal(snapshot.complete, true)

  await Promise.resolve(stopMaxSecond())
  await Promise.resolve(stopMaxFirst())
  await Promise.resolve(stopRankLow())
  await Promise.resolve(stopRankHigh())
  await Promise.resolve(stopChild())
  await Promise.resolve(stopParent())
  await Promise.resolve(stopPolicies())
  await Promise.resolve(stopGlobal())
  await child.dispose()
  await parent.dispose()
} finally {
  await ctx.fiber.dispose()
}
