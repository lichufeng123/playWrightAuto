import { Page } from '@playwright/test';
import { HomePage } from '../../pages/home.page';
import { SqueezePage } from '../../pages/squeeze.page';
import { AgentPage } from '../../pages/agent.page';

export async function enterAgentPage(page: Page): Promise<AgentPage> {
  await page.goto('/');

  const homePage = new HomePage(page);
  const squeezePage = await homePage.startUse();

  await squeezePage.clickAIEmployee();

  return new AgentPage(page);
}
