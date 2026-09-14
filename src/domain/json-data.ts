/** Validate the JSON-shaped values accepted by Prompt Library authoring. */
export function assertJsonDataShape(value: unknown): void {
  const active = new WeakSet<object>()
  const plain = (candidate: unknown): candidate is Record<string, unknown> => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return false
    const proto = Object.getPrototypeOf(candidate)
    return proto === Object.prototype || proto === null
  }
  const childPath = (path: string, key: string | number): string => typeof key === 'number' ? `${path}[${String(key)}]` : `${path}[${JSON.stringify(key)}]`
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
      if (!plain(current)) throw new TypeError(`non-plain object at ${path} is not JSON data`)
      for (const [key, entry] of Object.entries(current)) visit(entry, childPath(path, key))
    } finally {
      active.delete(current)
    }
  }
  visit(value, '$')
}

export function isJsonPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
