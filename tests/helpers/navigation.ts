import { Page } from '@playwright/test';
import { HomePage } from '../../pages/home.page';
import { SqueezePage } from '../../pages/squeeze.page';
import { AgentPage } from '../../pages/agent.page';
import { GroupPage } from '../../pages/group.page';

export async function enterAgentPage(page: Page): Promise<AgentPage> {
  await page.goto('/');

  const homePage = new HomePage(page);
  const squeezePage = await homePage.startUse();

  // Create AgentPage early to attach response observers before the module loads.
  const agentPage = new AgentPage(page);
  await squeezePage.clickAIEmployee();

  return agentPage;
}

export async function enterGroupPage(page: Page): Promise<GroupPage> {
  await page.goto('/');

  const homePage = new HomePage(page);
  const squeezePage = await homePage.startUse();

  const groupPage = new GroupPage(page);
  await squeezePage.clickAIGroup();

  return groupPage;
}
