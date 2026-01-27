import { test } from '@playwright/test';
import { HomePage } from '../../pages/home.page';

test.describe('Home → Squeeze 页面流', () => {

  test('user can enter squeeze page from home', async ({ page }) => {
    await page.goto('/');

    const homePage = new HomePage(page);

    const squeezePage = await homePage.startUse();

    // 后续所有操作，只能基于 SqueezePage
    await squeezePage.waitForReady();
  });

});
