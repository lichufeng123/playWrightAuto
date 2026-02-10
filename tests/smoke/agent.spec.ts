import { test, expect } from '@playwright/test'
import { AgentPage } from '../../pages/agent.page'
import { enterAgentPage } from '../helpers/navigation'
import { HomePage } from '../../pages/home.page'
import { SqueezePage } from '../../pages/squeeze.page'
import { AGENTS, MESSAGE_TEST_AGENTS } from '../data/agents'
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

test('can enter AI employee module', async ({ page }) => {
    await page.goto('/')
    const homePage = new HomePage(page)
    const squeezePage = await homePage.startUse()

    await squeezePage.clickAIEmployee()
    const agentPage = new AgentPage(page)
    await agentPage.waitForReady()
})

test('can add agent ', async ({ page }) => {
    const agentPage = await enterAgentPage(page)
    const name = AGENTS.TEST_ADD_TARGET

    try {
        await expect(agentPage.agentItemByName(name)).toBeVisible({ timeout: 2000 })
        console.log(`[Test] Agent ${name} exists, deleting...`)
        await agentPage.deleteAgent(name)
    } catch {
        // Not visible, good to go
    }

    await agentPage.addAgent(name)
    await expect(agentPage.agentItemByName(name)).toBeVisible()
})

test('smoke: can select preset agent', async ({ page }) => {
    const agentPage = await enterAgentPage(page)

    await agentPage.ensureAgentAvailable(AGENTS.PUBLIC_READ_ONLY)
    await agentPage.selectAgent(AGENTS.PUBLIC_READ_ONLY)
})

test('can select agent ', async ({ page }) => {
    const agentPage = await enterAgentPage(page)
    await agentPage.ensureAgentAvailable(AGENTS.PUBLIC_READ_ONLY)
    await agentPage.selectAgent(AGENTS.PUBLIC_READ_ONLY)
})

test('open NewChat', async ({ page }) => {
    const agentPage = await enterAgentPage(page)

    await agentPage.ensureAgentAvailable(AGENTS.PUBLIC_READ_ONLY)
    await agentPage.selectAgent(AGENTS.PUBLIC_READ_ONLY)
    await agentPage.newChat()
})

test.describe('batch messaging', () => {
    test.describe.configure({ mode: 'serial' });
    const perTestTimeoutMs = Number(process.env.PW_BATCH_TEST_TIMEOUT_MS || '180000');

    const batchCount = Number(process.env.PW_BATCH_COUNT || '')
    const agentsToTest = Number.isFinite(batchCount) && batchCount > 0
        ? MESSAGE_TEST_AGENTS.slice(0, batchCount)
        : MESSAGE_TEST_AGENTS

    agentsToTest.forEach(name => {
        test(`send Message: ${name}`, async ({ page }) => {
            test.setTimeout(perTestTimeoutMs);
            const agentPage = await enterAgentPage(page)

            await agentPage.ensureAgentAvailable(name)
            await agentPage.selectAgent(name)
            await agentPage.newChat()

            let message = '你好'
            if (name.includes('视频生成') || name === '电商视频制作师') {
                message = '我需要生成一段关于【人物情绪变化】的视频。主要内容包括【低落→思考→释然】。视频节奏希望是【舒缓】，整体风格偏向【文艺电影感】，参考风格类似【是枝裕和电影】。'
            } else if (name.includes('图片生成')) {
                message = '我需要生成一张【插画】风格的图片。主题是【一位年轻人坐在咖啡馆窗边阅读，窗外是城市街景】。整体风格偏向【温暖插画风】，需要避免出现【文字】。'
            } else if (name === '电商美工设计师') {
                message = '我需要为【无线键盘】制作场景图，使用场景设定为【居家办公】。需要突出产品的【舒适手感与效率感】，人物出镜【不需要模特】，期望风格是【明亮温馨】，其他要求是【环境简洁不抢主体】。'
            } else if (name === 'ppt制作大师') {
                message = '我需要制作一个关于【公司三年战略规划】的PPT，目标受众是【公司管理层】，核心目标是【战略汇报】，内容应包含【市场环境分析、战略方向、重点举措、资源需求】，风格偏好【高端商务】，请特别强调【战略取舍与优先级】。'
            }

            // 新建或者进入员工会话后先等待三秒再发送
            await page.waitForTimeout(3000);

            await agentPage.sendMessage(message)

            // 发送会话后等待三秒
            await page.waitForTimeout(3000);

            const safeName = name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')
            await page.screenshot({ path: `test-results/batch-screenshots/${safeName}.png`, fullPage: true })
        })
    })
})

test('can navigate history records', async ({ page }) => {
    const agentPage = await enterAgentPage(page)

    await agentPage.ensureAgentAvailable(AGENTS.HISTORY_NAVIGATE_ANCHOR)
    await agentPage.clickHistoryTab()
    await agentPage.openConversation('元气森林新年陪伴团圆创意概念')
    await agentPage.clickHistoryTab()
    await agentPage.openConversation('问候语“你好”')
})

test('管理：清空聊天记录', async ({ page }) => {
    const agentPage = await enterAgentPage(page)
    const name = AGENTS.TEST_HISTORY_TARGET

    await agentPage.ensureAgentAvailable(name)
    await agentPage.selectAgent(name)
    await agentPage.clearAgentChatHistory(name)
})

test('管理：置顶与取消置顶', async ({ page }) => {
    const agentPage = await enterAgentPage(page)
    const name = AGENTS.TEST_PIN_TARGET

    await agentPage.ensureAgentAvailable(name)
    await agentPage.togglePinAgent(name, true)
    await agentPage.togglePinAgent(name, false)
})

test('管理：重命名员工', async ({ page }) => {
    const agentPage = await enterAgentPage(page)
    const oldName = AGENTS.TEST_RENAME_TARGET
    const newName = AGENTS.TEST_RENAME_NEW

    await agentPage.ensureAgentAvailable(oldName)
    await agentPage.renameAgent({ name: oldName, newName })
    await agentPage.renameAgent({ name: newName, newName: oldName })
})

test('管理：删除并重新添加员工', async ({ page }) => {
    const agentPage = await enterAgentPage(page)
    const name = AGENTS.TEST_DELETE_TARGET

    await agentPage.ensureAgentAvailable(name)
    await agentPage.deleteAgent(name)
    await agentPage.addAgent(name)
})

test('清理：删除所有员工(保留特殊锚点)', async ({ page }) => {
    test.setTimeout(300000)
    const agentPage = await enterAgentPage(page)

    const agentsToKeep = [
        AGENTS.HISTORY_NAVIGATE_ANCHOR,
        AGENTS.LIST_READY_ANCHOR,
    ]

    await agentPage.deleteAllAgentsExcept(agentsToKeep)

    for (const agentName of agentsToKeep) {
        await expect(agentPage.agentItemByName(agentName)).toBeVisible()
    }
})

// （流程型测试） 添加->选择:每一步都想作为“独立 test”呈现
// test.describe.serial('agent lifecycle', () => {
//   test('add agent', async ({ page }) => {
//     const agentPage = await enterAgentPage(page)
//     await agentPage.addAgent('文本助手小C')
//   })
//
//   test('use agent', async ({ page }) => {
//     const agentPage = await enterAgentPage(page)
//     await agentPage.selectAgent('文本助手小C')
//   })
// })
