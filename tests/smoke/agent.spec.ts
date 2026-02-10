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
            } else if (name === '电商美工设计师'|| name === '设计师小香蕉') {
                message = '我需要为【无线键盘】制作场景图，使用场景设定为【居家办公】。需要突出产品的【舒适手感与效率感】，人物出镜【不需要模特】，期望风格是【明亮温馨】，其他要求是【环境简洁不抢主体】。'
            } else if (name === 'ppt制作大师') {
                message = '我需要制作一个关于【公司三年战略规划】的PPT，目标受众是【公司管理层】，核心目标是【战略汇报】，内容应包含【市场环境分析、战略方向、重点举措、资源需求】，风格偏好【高端商务】，请特别强调【战略取舍与优先级】。'
            } else if (name === '传播概念专家') {
                message = '我需要为【智能手表】策划一个传播战役概念。传播的核心目标是【提升新品知名度】，核心信息是【健康监测更精准】，目标受众是【都市白领】，计划通过【社交媒体+KOL】进行传播，希望营造【全民热议】的效果。'
            } else if (name === '活动策划专家') {
                message = '我需要为【openAI】策划一场【线下发布会】活动。核心目标是【发布新品】，目标参与者是【媒体与合作伙伴】，预算范围约为【100万元】，希望活动能突出【科技互动感】。'
            } else if (name === '产品传播策划') {
                message = '我需要为新品耳机【飓风4】制定上市传播策划。产品的核心卖点是【降噪+长续航】，定位是【性价比旗舰】，目标用户是【通勤白领】，上市周期为【1个月】，希望通过【短视频平台】快速引爆市场。'
            } else if (name === '品牌传播策划师') {
                message = '我需要为【美的】制定【2025年度】的品牌传播规划。品牌当前的挑战是【形象老化】，长期愿景是【成为可信赖的家庭品牌】，希望通过对【专业可靠】的持续沟通，提升品牌在【一线城市】的【年轻家庭认知】。'
            } else if (name === '设计专员') {
                message = '我需要为【喜茶】设计一个新的【产品LOGO】。设计主题是【年轻有活力】，需要包含的文案信息有【品牌名】，视觉元素有【圆形符号】，尺寸要求为【1:1】，视觉风格需遵循【现代简约】。'
            } else if (name === '美术专员') {
                message = '我需要为【巴黎欧莱雅】进行【品牌主视觉】的美术方向设定。创意概念是【纯净修护】，期望的视觉风格是【自然极简】，主要色彩倾向【浅色系】，希望给受众带来【安心信任】的视觉感受。'
            } else if (name === '文案专员') {
                message = '我需要为【Airpods pro4】撰写用于【朋友圈广告】的文案。核心需要突出【降噪与续航】，目标是促使目标受众【通勤白领】产生【点击了解】。文案调性需是【简洁有力】，字数限制在【50字】左右。'
            } else if (name === '创意脚本策划') {
                message = '我需要为【魔爪】策划一个【30秒品牌TVC】的脚本。创意核心概念是【突破自我】，脚本需包含【开场悬念、产品展示、结尾口号】，整体风格偏向【戏剧化】，目标是在【短视频平台】上吸引观众。'
            } else if (name === '创意概念专家') {
                message = '我需要为【元气森林】的【新年战役】发想创意概念。本次传播的核心信息是【陪伴与团圆】，目标是要引发目标受众【年轻家庭】的【情感共鸣】。期望的创意基调是【温暖感人】。'
            } else if (name.includes('消费者洞察')) {
                message = '我需要深入研究【新中产宝妈】的消费洞察。希望了解她们在【母婴用品】下的【购买决策因素】，以期优化【产品设计】。'
            } else if (name === '市场分析师') {
                message = '我需要分析【新能源汽车行业】的市场状况。分析的重点范围是【中国市场】，希望深入了解【市场规模与增长趋势、竞争格局】，并为【评估市场进入可行性】提供决策参考。'
            } else if (name === '品牌分析师') {
                message = '我需要分析【咖啡行业 星巴克】当前的品牌资产与市场认知状况，希望评估其在【知名度、联想度、忠诚度】方面的表现，并与【瑞幸】进行对比，诊断【认知差异】并提出改善方向。'
            } else if (name === '品牌价值构建师') {
                message = '我需要为已确立核心概念【健康轻负担】的【元气森林】构建价值体系，希望从功能【低糖解渴】、情感【安心】、社会【健康生活倡导者】层面展开。'
            } else if (name === '品牌核心概念策划师') {
                message = '我需要为【瑞幸】的品牌策划核心概念。它处于【咖啡行业】，核心优势是【精品豆】，希望面向【都市白领】传递一种【专业与仪式感】，并与竞争对手【星巴克】形成差异化。品牌的长期愿景是【高端精品咖啡代表】。'
            } else if (name === '文本助手小G') {
                message = '我需要处理一个【决策支持】任务，核心目标是【在两个方案中选择最优解】，关键背景信息包括【方案A成本低风险高，方案B成本高风险低】，任务约束条件是【时间紧、资源有限】，期望的输出形式是【决策建议报告】，请特别关注【风险与收益权衡】。'
            } else if (name === '文本助手小C') {
                message = '请将这段复杂的技术文档简化为通俗易懂的语言: 基于多模态泛化范式的全链路异构系统架构白皮书（摘要）在当前数字化转型的深水区，本技术中台致力于构建一种去中心化的微服务拓扑结构，旨在通过高内聚、低耦合的原子化组件编排，实现业务逻辑的动态解耦与弹性伸缩。核心架构范式,我们采用响应式编程范式与函数响应式架构深度融合的策略，利用背压机制有效治理流量洪峰。数据持久层摒弃了传统的阻塞式IO模型，转而拥抱非阻塞的异步流式处理引擎，通过编排器对海量离散事件进行序列化聚合与状态机迁移。关键技术栈,语言基石： 依托 GraalVM 多语言运行时，发挥 Project Loom 虚拟线程的高并发吞吐潜力。中间件治理： 引入 Service Mesh 服务网格，将东西向流量与南北向流量进行精细化切面控制，确保熔断降级与限流策略的最终一致性。实施路径,通过领域驱动设计的限界上下文划分，我们将复杂的业务域映射为可复用的能力中心。此举不仅消除了单体架构的刚性依赖，更在混沌工程的持续验证下，保障了系统的混沌韧性与故障自愈能力。结语： 本方案旨在通过技术栈的降维打击，实现业务价值流的全链路数字化闭环。'
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

test.describe('图片类生成用例', () => {
    const IMAGE_AGENTS = [
        {
            name: '电商美工设计师',
            prompt: '我需要为【无线键盘】制作两张场景图，使用场景设定为【居家办公】。需要突出产品的【舒适手感与效率感】，人物出镜【不需要模特】，期望风格是【明亮温馨】，其他要求是【环境简洁不抢主体】。',
        },
        {
            name: '设计师小香蕉',
            prompt: '我需要为【无线键盘】制作两张场景图，使用场景设定为【居家办公】。需要突出产品的【舒适手感与效率感】，人物出镜【不需要模特】，期望风格是【明亮温馨】，其他要求是【环境简洁不抢主体】。',
        },
        {
            name: '图片生成-MJ',
            prompt: '我需要生成二张【插画】风格的图片。主题是【一位年轻人坐在咖啡馆窗边阅读，窗外是城市街景】。整体风格偏向【温暖插画风】，需要避免出现【文字】。',
        },
        {
            name: '图片生成-即梦',
            prompt: '我需要生成二张【插画】风格的图片。主题是【一位年轻人坐在咖啡馆窗边阅读，窗外是城市街景】。整体风格偏向【温暖插画风】，需要避免出现【文字】。',
        },
        {
            name: '图片生成-星流',
            prompt: '我需要生成二张【插画】风格的图片。主题是【一位年轻人坐在咖啡馆窗边阅读，窗外是城市街景】。整体风格偏向【温暖插画风】，需要避免出现【文字】。',
        },
    ]

    test('图片生成员工统一选择4张并发送提示语', async ({ page }) => {
        test.setTimeout(180000)
        const agentPage = await enterAgentPage(page)

        for (const { name, prompt } of IMAGE_AGENTS) {
            await agentPage.ensureAgentAvailable(name)
            await agentPage.selectAgent(name)
            await agentPage.newChat()

            await page.waitForTimeout(3000)

            const combo = page.getByRole('combobox').nth(1)
            await expect(combo).toBeVisible()
            await combo.click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')

            await agentPage.sendMessage(prompt)
            await page.waitForTimeout(3000)
        }
    })
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
