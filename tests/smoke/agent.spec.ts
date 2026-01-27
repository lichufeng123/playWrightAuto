import { test, expect} from '@playwright/test'
import { AgentPage } from '../../pages/agent.page'
import { enterAgentPage } from '../helpers/navigation';
import { HomePage } from '../../pages/home.page';
import { SqueezePage } from '../../pages/squeeze.page';


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
    await agentPage.addAgent('文本助手小C');
    }


);

test('can select agent ',async({page}) => {
    const agentPage = await enterAgentPage(page);
    await agentPage.ensureAgentExists('文本助手小C');
    await agentPage.selectAgent('文本助手小C')
    }
)

test('send Message',async({page})=>{
    const agentPage = await enterAgentPage(page);
    await agentPage.ensureAgentExists('文本助手小C');
    await agentPage.sendMessage('你好');

    }
)



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
