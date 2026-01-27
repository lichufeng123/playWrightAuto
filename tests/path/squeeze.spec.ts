import { test, expect } from '@playwright/test';
import { HomePage } from '../../pages/home.page';

test('AI chat successful',async({ page }) => {
    await page.goto('/');
    const homePage = new HomePage(page);
    const squeezePage = await homePage.startUse();

    await squeezePage.clickAIEmployee();
    })
