import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/home.page';

test.describe('HomePage → SqueezePage 页面流', () => {

  test('click start button should enter squeeze page', async ({ page }) => {
    // 1️⃣ 直接进入 HomePage（不走 LoginPage）
    await page.goto('/');

    // 2️⃣ 创建 Page Object
    const homePage = new HomePage(page);

    // 3️⃣ 等 HomePage 真正 ready（非常关键）
    await homePage.waitForReady();

    // 4️⃣ 点击「立即开始」，并等待跳转完成
    await homePage.startUse();

  });

});
