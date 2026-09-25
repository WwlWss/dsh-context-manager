export const CONTEXT_MANAGER_LOCALE = 'context-manager'

export type ContextManagerLocaleKey =
  | 'title'
  | 'compactTitle'
  | 'close'
  | 'closeAria'
  | 'foundationMessage'

export type ContextManagerTranslate = (
  key: ContextManagerLocaleKey,
  params?: Readonly<Record<string, string | number>>,
) => string

export const CONTEXT_MANAGER_LOCALES = Object.freeze({
  zh: Object.freeze({
    title: '上下文管理器',
    compactTitle: 'CM',
    close: '关闭',
    closeAria: '关闭上下文管理器',
    foundationMessage: 'Web 客户端基础已启用。配置文件控件将在后续里程碑中加入。',
  }),
  en: Object.freeze({
    title: 'Context Manager',
    compactTitle: 'CM',
    close: 'Close',
    closeAria: 'Close Context Manager',
    foundationMessage: 'Web client foundation is active. Profile controls arrive in later milestones.',
  }),
}) satisfies Readonly<Record<'zh' | 'en', Readonly<Record<ContextManagerLocaleKey, string>>>>
