import { chromium } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { validLoginData } from '../data/login.data';

async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const loginPage = new LoginPage(page);

  await loginPage.openGlobal();
  await loginPage.loginWith(validLoginData.vipUser);

  // 等登录成功（非常重要）
  await page.waitForURL(url => !url.pathname.includes('/login'));

  // 保存登录态
  await context.storageState({ path: 'auth/state.json' });
  await browser.close();
}

export default globalSetup;
