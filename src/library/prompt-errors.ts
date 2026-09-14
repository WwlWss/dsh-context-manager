export type PromptLibraryErrorCode =
  | 'prompt-library-not-ready'
  | 'prompt-resource-exists'
  | 'prompt-resource-not-found'
  | 'prompt-resource-conflict'
  | 'invalid-prompt-resource'

export class PromptLibraryError extends Error {
  constructor(
    readonly code: PromptLibraryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PromptLibraryError'
  }
}
