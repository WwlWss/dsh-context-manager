import assert from 'node:assert/strict'
import { acknowledgePublicFirstRunNotice, runPackedWeb } from './support/run-web.mjs'
import { waitForPublicClientGraphEntry } from './support/client-graph.mjs'

const triggerSelector = '[data-context-manager-trigger]'
const drawerSelector = '[data-context-manager-drawer]'
const profileId = 'm7d-browser-e2e'
const firstName = 'M7D real browser profile'
const editedName = 'M7D persisted profile'
const externalName = 'M7D second writer won'

async function openDrawer(page) {
  await page.locator(triggerSelector).click()
  const drawer = page.locator(drawerSelector)
  await drawer.waitFor({ state: 'visible' })
  assert.equal(await drawer.count(), 1)
  return drawer
}

async function selectProfile(drawer, displayName) {
  const row = drawer.locator('nav button').filter({ hasText: displayName }).first()
  await row.waitFor({ state: 'visible' })
  await row.click()
}

async function beginNameEdit(drawer) {
  await drawer.getByRole('button', { name: /^(Edit|编辑)$/ }).first().click()
  await drawer.locator('#cm-edit-name').waitFor({ state: 'visible' })
}

async function saveField(drawer) {
  const form = drawer.locator('form:has(#cm-edit-name)')
  await form.locator('button[type=submit]').click()
}

await runPackedWeb(async ({ page, context, restartHost, record, version, rebuildInstalledClientForHmr, setPluginDisabledThroughPublicProfilePatch }) => {
  const trigger = page.locator(triggerSelector)
  assert.equal(await trigger.count(), 1)
  let drawer = await openDrawer(page)
  assert.equal(await page.locator('style[data-plugin="dsh-context-manager"]').count(), 1)
  record('actual browser module graph, one additive trigger/Drawer and one owned stylesheet')

  const create = drawer.locator('[data-context-manager-new-profile]')
  await create.click()
  await drawer.locator('#cm-create-id').fill(profileId)
  await drawer.locator('#cm-create-name').fill(firstName)
  await drawer.locator('#cm-create-description').fill('Isolated CI synthetic data')
  // Missing native ids are permitted as declarative references; no implicit fallback.
  await drawer.locator('#cm-create-preset').fill('standard')
  await drawer.locator('form:has(#cm-create-id)')
    .locator('button[type=submit]').click()
  await drawer.locator('nav button').filter({ hasText: firstName }).first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  record('real Host Remote v2: one explicit Profile create and authoritative reread')

  await beginNameEdit(drawer)
  await drawer.locator('#cm-edit-name').fill(editedName)
  await saveField(drawer)
  await drawer.locator('nav button').filter({ hasText: editedName }).first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  record('one explicit leaf save through real Host persistence')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator(triggerSelector).waitFor({ state: 'visible', timeout: 90_000 })
  await acknowledgePublicFirstRunNotice(page)
  drawer = await openDrawer(page)
  await selectProfile(drawer, editedName)
  assert.equal(await drawer.locator('nav button').filter({ hasText: editedName }).count(), 1)
  record('reload browser and reread durable Profile without copied client cache')

  await beginNameEdit(drawer)
  await drawer.locator('#cm-edit-name').fill('M7D uncommitted draft')
  await drawer.getByRole('button', { name: /^(Close Context Manager|关闭上下文管理器)$/ }).click()
  assert.equal(await drawer.count(), 0)
  drawer = await openDrawer(page)
  assert.equal(await drawer.locator('#cm-edit-name').inputValue(), 'M7D uncommitted draft')
  await drawer.getByRole('button', { name: /^(Cancel|取消)$/ }).click()
  record('closing overlay preserves draft; explicit cancellation discards it')

  // Two distinct Client pages capture independent persistence bases. The later
  // writer is authoritative; the older basis may never be refreshed at Save.
  await beginNameEdit(drawer)
  await drawer.locator('#cm-edit-name').fill('M7D stale overwrite')
  const other = await context.newPage()
  try {
    await other.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await other.locator(triggerSelector).waitFor({ state: 'visible', timeout: 90_000 })
    await acknowledgePublicFirstRunNotice(other)
    const otherDrawer = await openDrawer(other)
    await selectProfile(otherDrawer, editedName)
    await beginNameEdit(otherDrawer)
    await otherDrawer.locator('#cm-edit-name').fill(externalName)
    await saveField(otherDrawer)
    await otherDrawer.locator('nav button').filter({ hasText: externalName }).first()
      .waitFor({ state: 'visible', timeout: 30_000 })
    // Both safe interleavings are valid: push invalidation may disable Save
    // before a click, or the Host may reject the one stale-basis RPC.
    const staleSave = drawer.locator('form:has(#cm-edit-name) button[type=submit]')
    if (!(await staleSave.isDisabled())) {
      try {
        await staleSave.click({ timeout: 2000 })
      } catch (error) {
        if (!(await staleSave.isDisabled())) throw error
      }
    }
    await drawer.getByRole('button', { name: /^(Discard draft|放弃草稿)$/ })
      .waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await staleSave.isDisabled(), true)
    assert.equal(await drawer.locator('#cm-edit-name').inputValue(), 'M7D stale overwrite')
  } finally {
    await other.close()
  }
  record('concurrent browser writer: stale basis blocked without retry/rebase')

  await restartHost()
  drawer = await openDrawer(page)
  await selectProfile(drawer, externalName)
  record('restart actual Host process with same isolated profile; persisted concurrent winner remains')

  if (version === '0.1.6-alpha.2') {
    // Exercise public DSH Web plugin management and its real HMR graph
    // synchronization; these are NOT mocked Slot registry disposal calls.
    await beginNameEdit(drawer)
    await drawer.locator('#cm-edit-name').fill('M7D must not survive whole plugin unload')
    await drawer.getByRole('button', { name: /^(Close Context Manager|关闭上下文管理器)$/ }).click()
    await page.getByRole('button', { name: /^(Plugins|插件)$/ }).first().click()
    const card = page.locator('[data-plugin-package="dsh-context-manager"]')
    await card.waitFor({ state: 'visible', timeout: 30_000 })
    // The npm package id identifies the card, while the accessible switch
    // describes the public title ("context-manager"), not the npm name.
    const toggle = card.getByRole('switch')
    await toggle.waitFor({ state: 'visible' })
    assert.equal(await toggle.count(), 1, 'expected one official package switch')
    assert.equal(await toggle.getAttribute('aria-checked'), 'true')
    assert.equal(await toggle.isEnabled(), true, 'installed bundle must be manageable')
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await toggle.click()
      await page.locator(triggerSelector).waitFor({ state: 'detached', timeout: 45_000 })
      await page.locator('style[data-plugin="dsh-context-manager"]')
        .waitFor({ state: 'detached', timeout: 45_000 })
      assert.equal(await page.locator(triggerSelector).count(), 0)
      await toggle.click()
      await page.locator(triggerSelector).waitFor({ state: 'visible', timeout: 45_000 })
      await page.locator('style[data-plugin="dsh-context-manager"]')
        .waitFor({ state: 'attached', timeout: 45_000 })
      assert.equal(await page.locator(triggerSelector).count(), 1)
      assert.equal(await page.locator('style[data-plugin="dsh-context-manager"]').count(), 1)
    }
    record('real native plugin-manager: five graph disable/re-enable cycles; no duplicate Slot or style')
  
    drawer = await openDrawer(page)
    assert.equal(await drawer.locator('#cm-edit-name').count(), 0,
      'a new Client plugin lifetime cannot retain the old unsubmitted draft')
    await selectProfile(drawer, externalName)
    record('whole-plugin remount resets view draft but preserves authoritative Settings Profile')

    // This separate development-HMR probe intentionally alters only a private
    // temporary installed COPY after the immutable tarball was verified.
    // The production Client Modules/HMR transport must replace the browser
    // module and clean its stylesheet without a navigation.
    await drawer.getByRole('button', { name: /^(Close Context Manager|关闭上下文管理器)$/ }).click()
    await page.evaluate(() => {
      window.__m7dDidNotNavigate = true
      const owned = document.querySelector('style[data-plugin="dsh-context-manager"]')
      if (owned) owned.setAttribute('data-m7d-before-rebuild', '')
    })
    await rebuildInstalledClientForHmr()
    await page.waitForFunction(() => {
      const owned = document.querySelectorAll('style[data-plugin="dsh-context-manager"]')
      return window.__m7dDidNotNavigate === true && owned.length === 1 &&
        !owned[0].hasAttribute('data-m7d-before-rebuild')
    }, null, { timeout: 60_000 })
    assert.equal(await page.locator(triggerSelector).count(), 1)
    assert.equal(await page.locator('style[data-plugin="dsh-context-manager"]').count(), 1)
    drawer = await openDrawer(page)
    await selectProfile(drawer, externalName)
    record('development-only changed client.js: native code HMR preserves page, replaces owned style and remounts UI')

  } else {
    // These published generations do not have the newer Plugins page. All
    // retained Web profiles expose public live patch-reload instead.
    await beginNameEdit(drawer)
    await drawer.locator('#cm-edit-name').fill('M7D old draft must not survive plugin remount')
    await drawer.getByRole('button', { name: /^(Close Context Manager|关闭上下文管理器)$/ }).click()
    // The retained pre-0.1.6 Client HMR handles code-rebuild frames, not
    // live plugin graph updates. Test live Host changes over a fresh public
    // SSE connection, then rehydrate the Client through page navigation.
    await waitForPublicClientGraphEntry(page, 'dsh-context-manager', true)
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await setPluginDisabledThroughPublicProfilePatch(true)
      await waitForPublicClientGraphEntry(page, 'dsh-context-manager', false)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await acknowledgePublicFirstRunNotice(page)
      await page.locator(triggerSelector).waitFor({ state: 'detached', timeout: 30_000 })
      await page.locator('style[data-plugin="dsh-context-manager"]')
        .waitFor({ state: 'detached', timeout: 30_000 })
      assert.equal(await page.locator(triggerSelector).count(), 0)
      assert.equal(await page.locator('style[data-plugin="dsh-context-manager"]').count(), 0)
      await setPluginDisabledThroughPublicProfilePatch(false)
      await waitForPublicClientGraphEntry(page, 'dsh-context-manager', true)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await acknowledgePublicFirstRunNotice(page)
      await page.locator(triggerSelector).waitFor({ state: 'visible', timeout: 30_000 })
      await page.locator('style[data-plugin="dsh-context-manager"]')
        .waitFor({ state: 'attached', timeout: 30_000 })
      assert.equal(await page.locator(triggerSelector).count(), 1)
      assert.equal(await page.locator('style[data-plugin="dsh-context-manager"]').count(), 1)
    }
    drawer = await openDrawer(page)
    assert.equal(await drawer.locator('#cm-edit-name').count(), 0)
    await selectProfile(drawer, externalName)
    record('five live Host patch graph disable/re-enable cycles proven over fresh public SSE; legacy Client graph rehydrates by navigation, with unique Slot/style and no stale draft')
  }

  // Test default/deletion through the live Remote, not only the M7C fixture.
  const deletionName = 'M7D default and delete'
  await drawer.locator('[data-context-manager-new-profile]').click()
  await drawer.locator('#cm-create-id').fill('m7d-delete-e2e')
  await drawer.locator('#cm-create-name').fill(deletionName)
  await drawer.locator('#cm-create-description').fill('Transient description')
  await drawer.locator('#cm-create-preset').fill('standard')
  await drawer.locator('form:has(#cm-create-id) button[type=submit]').click()
  await drawer.locator('nav button').filter({ hasText: deletionName }).first()
    .waitFor({ state: 'visible', timeout: 30_000 })
  await selectProfile(drawer, deletionName)
  await drawer.getByRole('button', { name: /^(Set as default|设为默认)$/ }).click()
  await drawer.locator('nav button').filter({ hasText: deletionName })
    .getByText(/^(Default|默认)$/).waitFor({ state: 'visible', timeout: 30_000 })
  record('real Host Profile create and separately configured default')

  await drawer.getByRole('button', { name: /^(Delete profile|删除 Profile)$/ }).click()
  await drawer.getByRole('button', { name: /^(Confirm delete|确认删除)$/ }).click()
  await drawer.locator('nav button').filter({ hasText: deletionName })
    .waitFor({ state: 'detached', timeout: 30_000 })
  await drawer.getByText(/Invalid or missing default profile reference|无效或缺失的默认 Profile 引用/)
    .waitFor({ state: 'visible', timeout: 30_000 })
  await drawer.getByRole('button', { name: /^(Clear default reference|清除默认引用)$/ })
    .click()
  await drawer.getByText(/Invalid or missing default profile reference|无效或缺失的默认 Profile 引用/)
    .waitFor({ state: 'detached', timeout: 30_000 })
  record('delete retains dangling default until separate explicit clear')

  // Verify real keyboard behavior and one narrow-screen breakpoint.
  await drawer.press('Escape')
  await drawer.waitFor({ state: 'detached' })
  drawer = await openDrawer(page)
  await page.setViewportSize({ width: 390, height: 740 })
  const bounds = await drawer.boundingBox()
  assert.ok(bounds && bounds.x >= -1 && bounds.width <= 391 &&
    bounds.x + bounds.width <= 391, 'narrow Drawer remains inside viewport')
  await drawer.focus()
  await page.keyboard.press('Tab')
  assert.equal(await drawer.evaluate(element => element.contains(document.activeElement)), true)
  await page.keyboard.press('Shift+Tab')
  assert.equal(await drawer.evaluate(element => element.contains(document.activeElement)), true)
  record('real browser Escape, Tab focus containment and 390px narrow layout')

}, 'packed-web')

