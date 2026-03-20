import { Locator, Page } from '@playwright/test';
import { withRetry } from '../utils/retry';
import { waitForClickable, waitForVisible } from '../utils/wait';

export class DrawerComponent {
  readonly page: Page;
  readonly addNodeButton: Locator;
  readonly panelTitle: Locator;
  readonly nodeItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addNodeButton = page.locator('button.w-12.h-12').first();
    this.panelTitle = page.getByText('基础节点', { exact: true });
    this.nodeItems = page.locator('button[class*="_nodeItem_"]');
  }

  nodeItemByName(name: string): Locator {
    return this.nodeItems.filter({ hasText: name }).first();
  }

  async open(): Promise<void> {
    await waitForClickable(this.addNodeButton, 30_000);
    if (await this.panelTitle.isVisible().catch(() => false)) {
      return;
    }

    await withRetry(
      '打开节点抽屉',
      async () => {
        await this.addNodeButton.click({ force: true });
        await waitForVisible(this.panelTitle, 10_000);
      },
      { retries: 2 },
    );
  }

  async addNode(name: string): Promise<void> {
    await this.open();
    const nodeItem = this.nodeItemByName(name);
    await waitForClickable(nodeItem, 15_000);
    await nodeItem.click({ force: true });
  }
}
