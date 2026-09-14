import { ContextManagerError } from './errors.js'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function childPath(path: string, key: string | number): string {
  return typeof key === 'number' ? `${path}[${String(key)}]` : `${path}[${JSON.stringify(key)}]`
}

export function assertJsonDataShape(value: unknown): void {
  const active = new WeakSet<object>()
  const visit = (current: unknown, path: string): void => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) throw new TypeError(`number at ${path} cannot round-trip through JSON losslessly`)
      return
    }
    if (typeof current !== 'object') throw new TypeError(`value at ${path} is not JSON data`)
    if (active.has(current)) throw new TypeError(`ancestor reference at ${path} is not JSON data`)
    active.add(current)
    try {
      if (Array.isArray(current)) {
        for (let index = 0; index < current.length; index += 1) {
          if (!Object.hasOwn(current, index)) throw new TypeError(`sparse array at ${path} cannot round-trip through JSON losslessly`)
          visit(current[index], childPath(path, index))
        }
        return
      }
      if (!isPlainObject(current)) throw new TypeError(`non-plain object at ${path} is not JSON data`)
      for (const [key, entry] of Object.entries(current)) visit(entry, childPath(path, key))
    } finally {
      active.delete(current)
    }
  }
  visit(value, '$')
}

export function assertStoredProfilePayloadSafe(value: unknown): void {
  if (value === undefined) {
    throw new ContextManagerError(
      'invalid-raw-profile',
      'undefined cannot be stored as a profile payload; delete the profile explicitly instead',
    )
  }

  const seen = new WeakSet<object>()

  const visit = (current: unknown, path: string): void => {
    if (current === undefined) {
      throw new ContextManagerError(
        'invalid-raw-profile',
        `undefined at ${path} cannot be represented losslessly by DSH Settings`,
      )
    }
    if (typeof current !== 'object' || current === null) return
    if (seen.has(current)) return
    seen.add(current)

    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, childPath(path, index)))
      return
    }

    if (!isPlainObject(current)) return

    for (const [key, entry] of Object.entries(current)) {
      const nextPath = childPath(path, key)
      if (key === ['__', 'proto', '__'].join('')) {
        throw new ContextManagerError(
          'unsafe-path-key',
          `profile payload contains a DSH-unsafe property key at ${nextPath}`,
        )
      }
      visit(entry, nextPath)
    }
  }

  visit(value, '$')
}
