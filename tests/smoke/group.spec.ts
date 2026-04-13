import { test, expect } from '@playwright/test'
import { enterGroupPage } from '../helpers/navigation'
import { GROUP_MESSAGE_TARGETS, GROUP_PROMPT_CASES } from '../data/group'
import { collectPageContext } from '../../skills/page_context_collect'

async function runGroupPromptConversation(
    page: Parameters<typeof test>[0]['page'],
    options: {
        name: string
        prompt: string
        replyTimeoutMs: number
    },
): Promise<void> {
    const groupPage = await enterGroupPage(page)

    await groupPage.ensureGroupAvailable(options.name)
    await groupPage.selectGroup(options.name)
    await groupPage.newChat()

    await page.waitForTimeout(3000)
    await groupPage.sendAndWaitReply(options.prompt, { timeout: options.replyTimeoutMs })
    const confirmResponse = await groupPage.sendMessageInOngoingChat('确认')
    await groupPage.waitForReplyFinished({
        timeout: options.replyTimeoutMs,
        response: confirmResponse,
    })
}

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
        const replyTimeoutMs = Number(process.env.PW_GROUP_REPLY_TIMEOUT_MS || '420000')

        GROUP_PROMPT_CASES.forEach(({ name, prompt }) => {
            test(`batch send: ${name}`, async ({ page }) => {
                test.setTimeout(Math.max(perTestTimeoutMs, replyTimeoutMs * 2 + 60000))
                await runGroupPromptConversation(page, { name, prompt, replyTimeoutMs })
            })
        })
    })

    test.describe.parallel('parallel messaging', () => {
        const parallelTimeoutMs = Number(process.env.PW_GROUP_PARALLEL_TIMEOUT_MS || '480000')
        const replyTimeoutMs = Number(process.env.PW_GROUP_REPLY_TIMEOUT_MS || '420000')

        GROUP_PROMPT_CASES.forEach(({ name, prompt }) => {
            test(`parallel send: ${name}`, async ({ page }) => {
                test.setTimeout(Math.max(parallelTimeoutMs, replyTimeoutMs * 2 + 60000))
                await runGroupPromptConversation(page, { name, prompt, replyTimeoutMs })
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
