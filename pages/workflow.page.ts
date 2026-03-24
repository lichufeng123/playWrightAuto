import { expect, Locator, Page } from '@playwright/test';
import { CanvasComponent } from '../components/canvas.component';
import { DrawerComponent } from '../components/drawer.component';
import { NodePanelPage } from './node.panel.page';
import { withRetry } from '../utils/retry';
import { waitForClickable, waitForVisible } from '../utils/wait';

export class WorkflowPage {
  readonly page: Page;
  readonly canvas: CanvasComponent;
  readonly drawer: DrawerComponent;
  readonly nodePanel: NodePanelPage;
  readonly myProjectsTab: Locator;
  readonly myFavoritesTab: Locator;
  readonly projectSearchInput: Locator;
  readonly createProjectCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvas = new CanvasComponent(page);
    this.drawer = new DrawerComponent(page);
    this.nodePanel = new NodePanelPage(page);
    this.myProjectsTab = page.getByRole('button', { name: '我的项目' });
    this.myFavoritesTab = page.getByRole('button', { name: '我的收藏' });
    this.projectSearchInput = page.getByPlaceholder('搜索项目').first();
    this.createProjectCard = page
      .locator('div[class*="aspect-square"][class*="cursor-pointer"][class*="rounded-[10px]"]')
      .first();
  }

  async waitForReady(): Promise<void> {
    await expect(this.page).toHaveURL(/\/workflow/, { timeout: 30_000 });
    await waitForVisible(this.myProjectsTab, 30_000);
    await waitForVisible(this.projectSearchInput, 30_000);
    await waitForVisible(this.createProjectCard, 30_000);
  }

  async createWorkflow(): Promise<number> {
    await this.waitForReady();
    await waitForClickable(this.createProjectCard, 15_000);

    await withRetry(
      '点击空白工作流卡片',
      async () => {
        await this.createProjectCard.click();
        await expect(this.page).toHaveURL(/\/canvas\/\d+/, { timeout: 30_000 });
      },
      { retries: 2 },
    );

    await this.canvas.waitForReady();
    return this.getCanvasId();
  }

  getCanvasId(): number {
    const matched = this.page.url().match(/\/canvas\/(\d+)/);
    if (!matched) {
      throw new Error(`当前页面不是画布页: ${this.page.url()}`);
    }
    return Number(matched[1]);
  }
}
