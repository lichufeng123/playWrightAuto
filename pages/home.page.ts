import { Page, Locator, expect } from '@playwright/test';
import { SqueezePage } from './squeeze.page';
export class HomePage {
  readonly page: Page;
  readonly startButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.startButton = page.getByText('立即开始');
  }

  async waitForReady(): Promise<void> {
    await expect(this.startButton).toBeVisible();
    await expect(this.startButton).toBeEnabled();
  }

  async startUse(): Promise<SqueezePage> {
    await this.waitForReady();
    await this.startButton.click();
    const squeezePage = new SqueezePage(this.page)
    await squeezePage.waitForReady();
    return squeezePage;
  }
}
