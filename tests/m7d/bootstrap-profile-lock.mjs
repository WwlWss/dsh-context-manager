import assert from 'node:assert/strict'
import path from 'node:path'
import { generateReviewedProfileTemplate } from './support/generate-reviewed-profile-lock.mjs'

assert.ok(process.env.M7D_TARBALL, 'M7D_TARBALL required')
const folder = path.resolve('tests/m7d/profile-locks')
await generateReviewedProfileTemplate(path.resolve(process.env.M7D_TARBALL), folder)
console.log('M7D Profile freeze bootstrap verified: generated lock template in reviewed source tree')
