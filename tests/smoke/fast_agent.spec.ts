import { test, expect } from '@playwright/test'
import { enterAgentPage } from '../helpers/navigation'
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

test.describe('AI员工临时用例', () => {
    test('电商美工设计师 4 张发送电竞耳机产品图', async ({ page }) => {
        test.setTimeout(180000)
        const agentPage = await enterAgentPage(page)
        const name = '电商美工设计师'
        const sendTimes = Number(process.env.PW_TEMP_SEND_TIMES || '5')

        await agentPage.ensureAgentAvailable(name)
        await agentPage.selectAgent(name)
        await agentPage.waitForChatReady()

        for (let i = 0; i < sendTimes; i++) {
            await agentPage.newChat()
            await agentPage.waitForChatReady()

            const combo = page.getByRole('combobox').filter({ hasText: /张/ }).first()
            await expect(combo).toBeVisible()
            await combo.click()
            const option4 = page.getByRole('option', { name: /4张/ }).first()
            if (await option4.count()) {
                await option4.click()
            } else {
                const option2 = page.getByRole('option', { name: /2张/ }).first()
                await option2.click()
            }

            await agentPage.sendMessage('生成两张电竞耳机的产品图')
            await page.waitForTimeout(3000)
        }
    })

    test('设计专员 循环等待回复后确认', async ({ page }) => {
        test.setTimeout(180000)
        const agentPage = await enterAgentPage(page)
        const name = '设计专员'
        const loopTimes = Number(process.env.PW_TEMP_REPLY_TIMES || '5')
        const prompt = '我需要为【喜茶】设计一个新的【产品LOGO】。设计主题是【年轻有活力】，需要包含的文案信息有【品牌名】，视觉元素有【圆形符号】，尺寸要求为【1:1】，视觉风格需遵循【现代简约】。'

        await agentPage.ensureAgentAvailable(name)
        await agentPage.selectAgent(name)

        await agentPage.newChat()
        await agentPage.waitForChatReady()

        for (let i = 0; i < loopTimes; i++) {
            await agentPage.sendAndWaitReply(prompt, { timeout: 120000 })
            await agentPage.sendMessageInOngoingChat('确认')
            await page.waitForTimeout(3000)

            if (i < loopTimes - 1) {
                await agentPage.newChat()
                await agentPage.waitForChatReady()
            }
        }
    })
})
