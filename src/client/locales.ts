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
  | 'resourcesTitle'
  | 'resourceDetails'
  | 'resourceNew'
  | 'resourceCreateTitle'
  | 'resourceNoItems'
  | 'resourceSelectHint'
  | 'resourceLoading'
  | 'resourceReadError'
  | 'resourceStale'
  | 'resourceReadOnly'
  | 'resourceInvalid'
  | 'resourceDocumentLoading'
  | 'resourceDocumentError'
  | 'resourceContent'
  | 'resourceRevision'
  | 'resourceIncarnation'
  | 'resourceDelete'
  | 'resourceDeleteTitle'
  | 'resourceDeleteHint'
  | 'resourceDeleteBindingsHint'
  | 'resourceBodyExactHint'
  | 'resourceSetEmptyDescription'
  | 'resourceRemoveDescriptionHint'
  | 'resourceDraftBlockedHint'
  | 'resourceNoticeSaved'
  | 'resourceNoticeDegraded'
  | 'resourceNoticeConflict'
  | 'resourceNoticeStale'
  | 'resourceNoticeUnknown'
  | 'resourceNoticeBusy'
  | 'resourceNoticeUnavailable'
  | 'resourceNoticeInvalid'
  | 'resourceNoticeExists'
  | 'resourceNoticeNotEditable'
  | 'resourceNoticeFailed'
  | 'resourceNoticeDraftActive'
  | 'resourceNoticeRefreshFailed'
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
    resourcesTitle: "提示词资源",
    resourceDetails: "资源详情",
    resourceNew: "新建资源",
    resourceCreateTitle: "创建 PromptResource",
    resourceNoItems: "暂无 PromptResource。",
    resourceSelectHint: "选择资源以读取正文，或创建新资源。",
    resourceLoading: "正在读取资源列表……",
    resourceReadError: "资源列表读取失败，可手动刷新。",
    resourceStale: "资源列表已过期；编辑已禁用。",
    resourceReadOnly: "资源来源不可写或尚未确认，编辑暂不可用。",
    resourceInvalid: "无效资源记录",
    resourceDocumentLoading: "正在按需读取正文……",
    resourceDocumentError: "正文不可用，请刷新后重试。",
    resourceContent: "正文（保留原始换行与空白）",
    resourceRevision: "修订号",
    resourceIncarnation: "资源实例标识",
    resourceDelete: "删除资源",
    resourceDeleteTitle: "确认删除此 PromptResource？",
    resourceDeleteHint: "这会删除 Host 中的资源内容；不会自动删除引用它的 Profile PromptBinding。",
    resourceDeleteBindingsHint: "引用此资源的 Profile PromptBinding 仍将保留，并可能显示缺失资源诊断。",
    resourceBodyExactHint: "保存时保留所有空格、换行与末尾换行，不自动清洗内容。",
    resourceSetEmptyDescription: "将描述显式设为空字符串",
    resourceRemoveDescriptionHint: "本次保存将移除可选的描述字段。",
    resourceDraftBlockedHint: "草稿已保留，但写入依据需要重新核实，不能自动重复保存。可刷新查看权威版本，再明确放弃草稿。",
    resourceNoticeSaved: "资源写入完成，权威数据已刷新。",
    resourceNoticeDegraded: "资源写入已确认，但重新读取未完成；已阻止再次提交。",
    resourceNoticeConflict: "资源版本、实例或来源冲突；旧草稿不能直接重试。",
    resourceNoticeStale: "原始资源写入依据已过期；请核对并重新开始编辑。",
    resourceNoticeUnknown: "资源写入结果未知；已阻止重复提交。",
    resourceNoticeBusy: "另一个资源写入仍在执行。",
    resourceNoticeUnavailable: "Host / Resource Authority 暂不可用，无法安全提交。",
    resourceNoticeInvalid: "PromptResource 数据无效。",
    resourceNoticeExists: "资源 ID 已存在。",
    resourceNoticeNotEditable: "当前资源存储路径不可通过普通编辑修改。",
    resourceNoticeFailed: "资源操作失败。",
    resourceNoticeDraftActive: "请先完成或放弃当前草稿，再切换页面或资源。",
    resourceNoticeRefreshFailed: "资源读取失败；原草稿保持不变。",
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
    resourcesTitle: "Prompt Resources",
    resourceDetails: "Resource details",
    resourceNew: "New resource",
    resourceCreateTitle: "Create PromptResource",
    resourceNoItems: "No PromptResources found.",
    resourceSelectHint: "Select a resource to load its body, or create a new one.",
    resourceLoading: "Loading resource directory…",
    resourceReadError: "Resource directory read failed. Refresh to retry.",
    resourceStale: "Resource directory is stale; editing is disabled.",
    resourceReadOnly: "The Resource source is unavailable or not confirmed writable.",
    resourceInvalid: "Invalid resource record",
    resourceDocumentLoading: "Loading the resource body on demand…",
    resourceDocumentError: "Resource body unavailable. Refresh to retry.",
    resourceContent: "Content (exact whitespace and newlines)",
    resourceRevision: "Revision",
    resourceIncarnation: "Incarnation",
    resourceDelete: "Delete resource",
    resourceDeleteTitle: "Delete this PromptResource?",
    resourceDeleteHint: "This removes the Host resource. It does not delete referring Profile PromptBindings.",
    resourceDeleteBindingsHint: "Profile PromptBindings that reference this Resource remain and may report missing resources.",
    resourceBodyExactHint: "Spaces, newlines and trailing newlines are preserved on Save; content is never trimmed.",
    resourceSetEmptyDescription: "Explicitly set an empty description string",
    resourceRemoveDescriptionHint: "Saving will remove the optional description field.",
    resourceDraftBlockedHint: "This draft is preserved but must not be replayed. Refresh authoritative data, then explicitly discard and edit again.",
    resourceNoticeSaved: "Resource saved and authoritative state refreshed.",
    resourceNoticeDegraded: "Write confirmed, but read-back incomplete. Resubmission is blocked.",
    resourceNoticeConflict: "Resource revision, incarnation or source conflict. The old draft cannot be retried.",
    resourceNoticeStale: "The original Resource write basis is stale. Review and begin a new edit.",
    resourceNoticeUnknown: "Write outcome unknown. Automatic replay is blocked.",
    resourceNoticeBusy: "Another Resource mutation is running.",
    resourceNoticeUnavailable: "Host / Resource Authority not available for a safe write.",
    resourceNoticeInvalid: "Invalid PromptResource input or stored record.",
    resourceNoticeExists: "A Resource already exists with this ID.",
    resourceNoticeNotEditable: "This Resource storage path cannot be edited normally.",
    resourceNoticeFailed: "Resource operation failed.",
    resourceNoticeDraftActive: "Save or discard the active draft before switching tabs or resources.",
    resourceNoticeRefreshFailed: "Resource read failed; the draft was preserved.",
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
