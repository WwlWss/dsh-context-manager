import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Keep synchronized with the full-qualification job's needs list in ci.yml.
export const REQUIRED_FULL_JOB_IDS = Object.freeze([
  "verify",
  "settings-modern",
  "agent-presets-contract",
  "session-preset-contract",
  "prompt-library-contract",
  "prompt-placement-contract",
  "prompt-runtime-contract",
  "prompt-runtime-agent-loop",
  "skill-runtime-contract",
  "skill-policy-runtime-contract",
  "pinned-skill-runtime-contract",
  "skill-policy-agent-loop",
  "pinned-skill-agent-loop",
  "remote-foundation-artifact",
  "remote-foundation-contract",
  "client-foundation-contract",
  "client-presentation-contract",
  "package",
  "dsh-smoke"
])

export function assessFullQualification(needs) {
  if (needs === null || typeof needs !== 'object' || Array.isArray(needs)) {
    return { ok: false, missing: [...REQUIRED_FULL_JOB_IDS], unexpected: [], unsuccessful: [] }
  }
  const keys = Object.keys(needs)
  const required = new Set(REQUIRED_FULL_JOB_IDS)
  const missing = REQUIRED_FULL_JOB_IDS.filter(id => !Object.hasOwn(needs, id))
  const unexpected = keys.filter(id => !required.has(id))
  const unsuccessful = REQUIRED_FULL_JOB_IDS.flatMap(id => {
    if (!Object.hasOwn(needs, id)) return []
    const result = needs[id]?.result
    return result === 'success' ? [] : [{ job: id, result: result ?? 'missing-result' }]
  })
  return {
    ok: missing.length === 0 && unexpected.length === 0 && unsuccessful.length === 0,
    missing, unexpected, unsuccessful,
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let assessment
  try {
    assessment = assessFullQualification(JSON.parse(process.env.QUALIFICATION_NEEDS_JSON ?? 'null'))
  } catch (error) {
    console.error('Invalid full-qualification needs JSON:', error)
    process.exitCode = 1
  }
  if (assessment) {
    for (const id of assessment.missing) console.error('Missing upstream job:', id)
    for (const id of assessment.unexpected) console.error('Unexpected upstream job:', id)
    for (const item of assessment.unsuccessful) console.error(`${item.job}: ${item.result}`)
    if (!assessment.ok) process.exitCode = 1
    else console.log(`Full qualification passed: all ${REQUIRED_FULL_JOB_IDS.length} upstream jobs succeeded.`)
  }
}
