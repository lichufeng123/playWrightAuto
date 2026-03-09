import { test, expect } from '@playwright/test'
import { enterGroupPage } from '../helpers/navigation'
import { GROUP_MESSAGE_TARGETS } from '../data/group'
import { collectPageContext } from '../../skills/page_context_collect'

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return
    if (!page || page.isClosed()) return

    try {
        await collectPageContext(page)
        console.log('[skill] page context collected on failure')
    } catch (e) {
        console.warn('[skill] collectPageContext failed, ignored', e)
    }
})

test.describe('AI群组', () => {
    test('can enter AI group module', async ({ page }) => {
        const groupPage = await enterGroupPage(page)
        await groupPage.waitForReady()
    })

    test.describe('batch messaging', () => {
        test.describe.configure({ mode: 'serial' })
        const perTestTimeoutMs = Number(process.env.PW_BATCH_TEST_TIMEOUT_MS || '180000')

        GROUP_MESSAGE_TARGETS.forEach(name => {
            test(`batch send: ${name}`, async ({ page }) => {
                test.setTimeout(perTestTimeoutMs)
                const groupPage = await enterGroupPage(page)

                await groupPage.ensureGroupAvailable(name)
                await groupPage.selectGroup(name)
                await groupPage.newChat()

                await page.waitForTimeout(3000)
                await groupPage.sendMessage('你好')
                await page.waitForTimeout(3000)
            })
        })
    })

    test.describe('Note messaging', () => {
        test.describe.configure({ mode: 'serial' })
        const perTestTimeoutMs = Number(process.env.PW_BATCH_TEST_TIMEOUT_MS || '180000')

        GROUP_MESSAGE_TARGETS.forEach(name => {
            test(`Note send: ${name}`, async ({ page }) => {
                test.setTimeout(perTestTimeoutMs)
                const groupPage = await enterGroupPage(page)

                await groupPage.ensureGroupAvailable(name)
                await expect(groupPage.groupItemByName(name)).toBeVisible()
                await groupPage.selectGroup(name)
                await groupPage.newChat()

                await page.waitForTimeout(3000)
                await groupPage.sendMessage('确认')
                await page.waitForTimeout(3000)
            })
        })
    })
})
