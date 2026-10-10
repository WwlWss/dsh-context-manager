import type {
  LocaleDictOf,
  TranslateNS,
} from '@deepseek-ai/dsh-client-ui-slots'

export const CONTEXT_MANAGER_LOCALE = 'context-manager'

export type ContextManagerLocaleKey =
  | 'title'
  | 'compactTitle'
  | 'close'
  | 'closeAria'
  | 'foundationMessage'
  | 'profilesTitle'
  | 'profileDetails'
  | 'refresh'
  | 'hostDetached'
  | 'hostIncompatible'
  | 'hostChecking'
  | 'hostError'
  | 'loadingProfiles'
  | 'profilesReadError'
  | 'schemaIncompatible'
  | 'profilesStale'
  | 'persistenceUnavailable'
  | 'persistenceReadOnly'
  | 'syncing'
  | 'saving'
  | 'refreshingAfterSave'
  | 'newProfile'
  | 'createTitle'
  | 'create'
  | 'save'
  | 'edit'
  | 'cancel'
  | 'deleteProfile'
  | 'confirmDelete'
  | 'deleteConfirmTitle'
  | 'deleteConfirmHint'
  | 'deleteDefaultHint'
  | 'fieldId'
  | 'idImmutableHint'
  | 'fieldName'
  | 'fieldDescription'
  | 'fieldBasePreset'
  | 'createDefaultHint'
  | 'noProfiles'
  | 'waitForProfiles'
  | 'selectOrCreateProfile'
  | 'notSet'
  | 'emptyValue'
  | 'defaultLabel'
  | 'makeDefault'
  | 'clearDefault'
  | 'invalidDefaultReference'
  | 'invalidProfile'
  | 'invalidStoredHint'
  | 'presetStatus'
  | 'presetResolved'
  | 'presetMissing'
  | 'presetBroken'
  | 'presetUnavailable'
  | 'presetUnverified'
  | 'removeDescription'
  | 'descriptionRemovalPending'
  | 'diagnosticsTitle'
  | 'noSessionDiagnosticsHint'
  | 'draftUnknown'
  | 'draftNeedsReload'
  | 'draftPreservedHint'
  | 'discardDraft'
  | 'noticeSaved'
  | 'noticeSavedDegraded'
  | 'noticeConflict'
  | 'noticeDraftStale'
  | 'noticeOutcomeUnknown'
  | 'noticeBusy'
  | 'noticeUnavailable'
  | 'noticeInvalidInput'
  | 'noticeProfileExists'
  | 'noticeNotEditable'
  | 'noticeFailed'
  | 'noticeDraftActive'
  | 'noticeRefreshFailed'
  | 'noticeRefreshRequested'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'context-manager': ContextManagerLocaleKey
  }
}

export type ContextManagerTranslate = TranslateNS<typeof CONTEXT_MANAGER_LOCALE>

export const CONTEXT_MANAGER_LOCALES = Object.freeze({
  zh: Object.freeze({
    title: "上下文管理器",
    compactTitle: "CM",
    close: "关闭",
    closeAria: "关闭上下文管理器",
    foundationMessage: "Web 客户端基础已启用。配置文件控件将在后续里程碑中加入。",
    profilesTitle: "配置文件",
    profileDetails: "配置详情",
    refresh: "刷新",
    hostDetached: "未连接到 DSH Host。",
    hostIncompatible: "Host Remote 协议不兼容，无法编辑。",
    hostChecking: "正在确认 Host 协议……",
    hostError: "Host 协议检查失败。",
    loadingProfiles: "正在载入配置文件……",
    profilesReadError: "读取配置文件失败，请尝试刷新。",
    schemaIncompatible: "存储 Schema 版本不兼容，无法进行普通编辑。",
    profilesStale: "显示的是旧缓存，编辑已禁用，请刷新。",
    persistenceUnavailable: "Settings 持久化服务不可用。",
    persistenceReadOnly: "Settings 当前为只读状态。",
    syncing: "正在同步权威状态……",
    saving: "正在提交修改……",
    refreshingAfterSave: "写入完成，正在重新同步……",
    newProfile: "新建配置",
    createTitle: "新建 Profile",
    create: "创建",
    save: "保存",
    edit: "编辑",
    cancel: "取消",
    deleteProfile: "删除 Profile",
    confirmDelete: "确认删除",
    deleteConfirmTitle: "确认删除此 Profile？",
    deleteConfirmHint: "这将删除原始存储记录，不能通过取消恢复。",
    deleteDefaultHint: "该 Profile 是默认引用。删除不会自动清除默认引用，随后会出现悬空引用诊断。",
    fieldId: "Profile ID",
    idImmutableHint: "ID 创建后不可在此重命名。",
    fieldName: "名称",
    fieldDescription: "描述",
    fieldBasePreset: "基础预设 ID",
    createDefaultHint: "创建不会自动设为默认配置；之后可单独设置。",
    noProfiles: "尚无可见 Profile。",
    waitForProfiles: "等待可读取的配置状态。",
    selectOrCreateProfile: "选择或新建一个 Profile。",
    notSet: "未设置",
    emptyValue: "（空字符串）",
    defaultLabel: "默认",
    makeDefault: "设为默认",
    clearDefault: "清除默认引用",
    invalidDefaultReference: "无效或缺失的默认 Profile 引用",
    invalidProfile: "无效存储记录",
    invalidStoredHint: "此记录未通过 Domain 解析。普通字段编辑不可用，但可以明确删除该存储记录。",
    presetStatus: "预设解析状态",
    presetResolved: "已解析",
    presetMissing: "引用的预设不存在",
    presetBroken: "预设内容已损坏",
    presetUnavailable: "预设目录不可用",
    presetUnverified: "尚未核实",
    removeDescription: "移除描述字段",
    descriptionRemovalPending: "保存时将移除此字段，而不是设置为空字符串。",
    diagnosticsTitle: "存储与引用诊断",
    noSessionDiagnosticsHint: "Session / Agent 实时诊断将在后续 B1-3 加入。",
    draftUnknown: "本次写入结果未知",
    draftNeedsReload: "草稿的写入依据已过期",
    draftPreservedHint: "已保留草稿，但不能直接重试。请刷新查看权威数据，再放弃旧草稿并重新开始编辑。",
    discardDraft: "放弃草稿",
    noticeSaved: "已保存并同步。",
    noticeSavedDegraded: "写入已确认，但重新同步不完整；请刷新，不要再次提交。",
    noticeConflict: "检测到 Profile 写入冲突。旧草稿不能直接重试。",
    noticeDraftStale: "编辑依据已经过期。请刷新并重新开始编辑。",
    noticeOutcomeUnknown: "无法确认是否已写入。已阻止重复提交。",
    noticeBusy: "另一个 Profile 写入正在进行。",
    noticeUnavailable: "当前无法安全提交。请检查 Host、Settings 和状态同步。",
    noticeInvalidInput: "输入无效，请检查 Profile ID 或字段值。",
    noticeProfileExists: "该 Profile ID 已存在。",
    noticeNotEditable: "当前存储路径无法通过普通字段编辑。",
    noticeFailed: "写入失败。",
    noticeDraftActive: "请先保存或取消当前草稿。",
    noticeRefreshFailed: "刷新请求失败。",
    noticeRefreshRequested: "已请求刷新。",
  }),
  en: Object.freeze({
    title: "Context Manager",
    compactTitle: "CM",
    close: "Close",
    closeAria: "Close Context Manager",
    foundationMessage: "Web client foundation is active. Profile controls arrive in later milestones.",
    profilesTitle: "Profiles",
    profileDetails: "Profile details",
    refresh: "Refresh",
    hostDetached: "DSH Host is not connected.",
    hostIncompatible: "Host Remote protocol is incompatible; editing is disabled.",
    hostChecking: "Checking Host protocol…",
    hostError: "Host protocol check failed.",
    loadingProfiles: "Loading profiles…",
    profilesReadError: "Failed to read profiles. Try Refresh.",
    schemaIncompatible: "Stored schema is incompatible; standard editing is disabled.",
    profilesStale: "Cached profiles are stale. Refresh before editing.",
    persistenceUnavailable: "Settings persistence is unavailable.",
    persistenceReadOnly: "Settings is currently read-only.",
    syncing: "Synchronizing authoritative state…",
    saving: "Saving…",
    refreshingAfterSave: "Write finished; reconciling…",
    newProfile: "New profile",
    createTitle: "Create profile",
    create: "Create",
    save: "Save",
    edit: "Edit",
    cancel: "Cancel",
    deleteProfile: "Delete profile",
    confirmDelete: "Confirm delete",
    deleteConfirmTitle: "Delete this profile?",
    deleteConfirmHint: "This removes the stored record and cannot be undone here.",
    deleteDefaultHint: "This is the configured default. Deleting it will leave a dangling default reference until you explicitly clear it.",
    fieldId: "Profile ID",
    idImmutableHint: "The ID cannot be renamed in this editor.",
    fieldName: "Name",
    fieldDescription: "Description",
    fieldBasePreset: "Base preset ID",
    createDefaultHint: "Creating a profile does not make it the default. Set the default separately afterward.",
    noProfiles: "No visible profiles.",
    waitForProfiles: "Waiting for readable profile state.",
    selectOrCreateProfile: "Select or create a profile.",
    notSet: "Not set",
    emptyValue: "(empty string)",
    defaultLabel: "Default",
    makeDefault: "Set as default",
    clearDefault: "Clear default reference",
    invalidDefaultReference: "Invalid or missing default profile reference",
    invalidProfile: "Invalid stored profile",
    invalidStoredHint: "This record failed Domain parsing. Field editing is disabled; you may explicitly delete its stored record.",
    presetStatus: "Preset resolution",
    presetResolved: "Resolved",
    presetMissing: "Missing preset",
    presetBroken: "Broken preset",
    presetUnavailable: "Preset directory unavailable",
    presetUnverified: "Not verified",
    removeDescription: "Remove description field",
    descriptionRemovalPending: "Saving will remove this field, not set an empty string.",
    diagnosticsTitle: "Storage and reference diagnostics",
    noSessionDiagnosticsHint: "Live Session / Agent diagnostics are deferred until B1-3.",
    draftUnknown: "The write outcome is unknown",
    draftNeedsReload: "This draft's write basis is stale",
    draftPreservedHint: "The draft is preserved but cannot be replayed. Refresh authoritative data, discard this draft and start a new edit.",
    discardDraft: "Discard draft",
    noticeSaved: "Saved and synchronized.",
    noticeSavedDegraded: "Write confirmed, but reconciliation is incomplete. Refresh; do not resubmit.",
    noticeConflict: "Profile write conflict. The old draft cannot be retried.",
    noticeDraftStale: "The edit basis is stale. Refresh and start a new edit.",
    noticeOutcomeUnknown: "Cannot confirm whether the write committed. Replay is blocked.",
    noticeBusy: "Another profile write is in progress.",
    noticeUnavailable: "Cannot safely write now. Check Host, Settings and synchronization.",
    noticeInvalidInput: "Invalid input. Check the profile ID or field value.",
    noticeProfileExists: "The profile ID already exists.",
    noticeNotEditable: "This stored path is not editable through standard fields.",
    noticeFailed: "Write failed.",
    noticeDraftActive: "Save or cancel the current draft first.",
    noticeRefreshFailed: "Refresh request failed.",
    noticeRefreshRequested: "Refresh requested.",
  }),
}) satisfies Readonly<Record<'zh' | 'en', LocaleDictOf<typeof CONTEXT_MANAGER_LOCALE>>>
