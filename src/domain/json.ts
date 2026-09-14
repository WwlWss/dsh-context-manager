import { ContextManagerError } from './errors.js'
import { isPlainObject } from './storage.js'

function childPath(path: string, key: string | number): string {
  return typeof key === 'number'
    ? `${path}[${String(key)}]`
    : `${path}[${JSON.stringify(key)}]`
}

/**
 * Reject values whose authored semantics would change when persisted through
 * DSH Storage's JSON value contract. This is intentionally independent from
 * Settings-specific path restrictions such as `__proto__`.
 */
export function assertLosslessJsonValue(value: unknown, root = '$'): void {
  const ancestors = new WeakSet<object>()

  const visit = (current: unknown, path: string): void => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return

    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) {
        throw new ContextManagerError(
          'invalid-prompt-resource',
          `value at ${path} cannot round-trip through JSON losslessly`,
        )
      }
      return
    }

    if (
      current === undefined ||
      typeof current === 'function' ||
      typeof current === 'symbol' ||
      typeof current === 'bigint'
    ) {
      throw new ContextManagerError(
        'invalid-prompt-resource',
        `value at ${path} is not losslessly JSON-representable`,
      )
    }

    if (ancestors.has(current)) {
      throw new ContextManagerError(
        'invalid-prompt-resource',
        `cyclic value at ${path} is not JSON-representable`,
      )
    }

    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        for (let index = 0; index < current.length; index += 1) {
          if (!Object.hasOwn(current, index)) {
            throw new ContextManagerError(
              'invalid-prompt-resource',
              `sparse array at ${path} cannot round-trip through JSON losslessly`,
            )
          }
          visit(current[index], childPath(path, index))
        }
        return
      }

      if (!isPlainObject(current)) {
        throw new ContextManagerError(
          'invalid-prompt-resource',
          `non-plain object at ${path} is not a lossless JSON value`,
        )
      }

      for (const [key, child] of Object.entries(current)) {
        visit(child, childPath(path, key))
      }
    } finally {
      ancestors.delete(current)
    }
  }

  visit(value, root)
}
