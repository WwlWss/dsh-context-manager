import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assertJsonDataShape } from '../lib/domain/storage.js'

test('storage JSON preflight accepts shared acyclic objects', () => {
  const shared = { value: 1 }
  assert.doesNotThrow(() => assertJsonDataShape({ left: shared, right: shared }))
})

test('storage JSON preflight rejects values whose JSON representation changes', () => {
  assert.throws(() => assertJsonDataShape({ value: undefined }), TypeError)
  assert.throws(() => assertJsonDataShape({ value: Number.NaN }), TypeError)
  assert.throws(() => assertJsonDataShape({ value: Number.POSITIVE_INFINITY }), TypeError)
  assert.throws(() => assertJsonDataShape({ value: -0 }), TypeError)
  assert.throws(() => assertJsonDataShape({ value: new Date() }), TypeError)

  const sparse = []
  sparse.length = 1
  assert.throws(() => assertJsonDataShape({ sparse }), TypeError)

  const nested = {}
  nested[['s', 'elf'].join('')] = nested
  assert.throws(() => assertJsonDataShape(nested), TypeError)
})
