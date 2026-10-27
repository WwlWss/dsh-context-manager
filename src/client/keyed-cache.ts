import type { ContextManagerClientSurface } from './model-types.js'

// Values in published SnapshotStore snapshots are immutable: never mutate an old Map.
export function setBoundedEntry<T>(
  current: ReadonlyMap<string, T>,
  key: string,
  value: T,
  limit: number,
): ReadonlyMap<string, T> {
  const next = new Map(current)
  next.delete(key)
  next.set(key, value)
  while (next.size > limit) {
    const oldest = next.keys().next().value
    if (oldest === undefined) break
    next.delete(oldest)
  }
  return next
}

export function mapSurfaces<T>(
  current: ReadonlyMap<string, ContextManagerClientSurface<T>>,
  update: (surface: ContextManagerClientSurface<T>) => ContextManagerClientSurface<T>,
): ReadonlyMap<string, ContextManagerClientSurface<T>> {
  let next: Map<string, ContextManagerClientSurface<T>> | undefined
  for (const [key, surface] of current) {
    const replacement = update(surface)
    if (replacement === surface) continue
    next ??= new Map(current)
    next.set(key, replacement)
  }
  return next ?? current
}
