import { expect, Locator, Page } from '@playwright/test';

export async function waitForVisible(locator: Locator, timeoutMs = 15_000): Promise<void> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
}

export async function waitForClickable(locator: Locator, timeoutMs = 15_000): Promise<void> {
  await waitForVisible(locator, timeoutMs);
  await expect(locator).toBeEnabled({ timeout: timeoutMs }).catch(() => undefined);
}

export async function waitForCanvasReady(page: Page, timeoutMs = 30_000): Promise<void> {
  await expect(page).toHaveURL(/\/canvas\/\d+/, { timeout: timeoutMs });
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: timeoutMs });
  await page.waitForFunction(
    () => !document.body.innerText.includes('加载中'),
    undefined,
    { timeout: timeoutMs },
  );
}
