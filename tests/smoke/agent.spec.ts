import { test, expect } from '@playwright/test'
import { AgentPage } from '../../pages/agent.page'
import { enterAgentPage } from '../helpers/navigation';
import { HomePage } from '../../pages/home.page';
import { SqueezePage } from '../../pages/squeeze.page';
import { AGENTS } from '../data/agents';


/*
test('can enter AI employee module',async({page}) =>{

    await page.goto('/');
    const homePage = new HomePage(page);
    const squeezePage = await homePage.startUse();

    await squeezePage.clickAIEmployee();
    const agentPage = new AgentPage(page);

    }
);

test('can add agent ',async({page}) => {
    const agentPage = await enterAgentPage(page);
    await agentPage.addAgent(AGENTS.TEXT_ASSISTANT_C);
    }


);

test('smoke: can select preset agent', async ({ page }) => {
  const agentPage = await enterAgentPage(page);

  await agentPage.ensureAgentAvailable(AGENTS.TEXT_ASSISTANT_C);
  await agentPage.selectAgent(AGENTS.TEXT_ASSISTANT_C);
});

test('can select agent ',async({page}) => {
    const agentPage = await enterAgentPage(page);
    await agentPage.ensureAgentAvailable(AGENTS.TEXT_ASSISTANT_C);
    await agentPage.selectAgent(AGENTS.TEXT_ASSISTANT_C)
    }
)

test('open NewChat',async({page}) => {
    const agentPage = new AgentPage(page);
    await enterAgentPage(page);

    await agentPage.ensureAgentAvailable(AGENTS.TEXT_ASSISTANT_C);
    await agentPage.selectAgent(AGENTS.TEXT_ASSISTANT_C);

    await agentPage.newChat();

    })

*/
test('send Message', async ({ page }) => {
    // 进入 Agent 页面（你已有）
    const agentPage = new AgentPage(page);
    await enterAgentPage(page);

    // 选择预置 Agent
    await agentPage.ensureAgentAvailable(AGENTS.TEXT_ASSISTANT_C);
    await agentPage.selectAgent(AGENTS.TEXT_ASSISTANT_C);
    await agentPage.newChat();


    // 发送消息
    await agentPage.sendMessage('hello');

}
)

test('can navigate history records', async ({ page }) => {
    // 1. Enter Agent Page
    const agentPage = await enterAgentPage(page);

    // 2. Click History Tab
    await agentPage.clickHistoryTab();

    // 3. Open first conversation & verify
    // Using simple approach: just click for now as per user request
    await agentPage.openConversation('元气森林新年陪伴团圆创意概念');

    // (Optional) Verify we entered the chat? 
    // User script clicks '历史对话' again - maybe to return to list?
    // If clicking conversation opens it in main view, we might need to click tab again to see list?
    // The user script says: await page.getByText('历史对话').click();
    // I'll assume that clicking '历史对话' acts as a "Back" or "Reset" to list view if it's in a side panel.
    // Or maybe it's just a check.
    // Let's stick to the flow: Tab -> Item 1 -> Tab -> Item 2

    // Click History Tab/List again to ensure list is visible/active
    await agentPage.clickHistoryTab();

    // 4. Open second conversation
    await agentPage.openConversation('问候语“你好”');
});




















// （流程型测试） 添加->选择:每一步都想作为“独立 test”呈现
// test.describe.serial('agent lifecycle', () => {
//   test('add agent', async ({ page }) => {
//     const agentPage = await enterAgentPage(page);
//     await agentPage.addAgent('文本助手小C');
//   });
//
//   test('use agent', async ({ page }) => {
//     const agentPage = await enterAgentPage(page);
//     await agentPage.selectAgent('文本助手小C');
//   });
// });
