import { expect, Locator, Page } from '@playwright/test';
import { withRetry } from '../utils/retry';
import { waitForClickable, waitForVisible } from '../utils/wait';

/**
 * Workflow 项目列表页。
 * 这里只处理项目级动作，例如创建、搜索、删除，不负责画布内部交互。
 */
export class WorkflowPage {
  readonly page: Page;
  readonly myProjectsTab: Locator;
  readonly myFavoritesTab: Locator;
  readonly projectSearchInput: Locator;
  readonly createProjectCard: Locator;
  readonly projectMoreButtons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.myProjectsTab = page.getByRole('button', { name: '我的项目' });
    this.myFavoritesTab = page.getByRole('button', { name: '我的收藏' });
    this.projectSearchInput = page.getByPlaceholder('搜索项目').first();
    this.createProjectCard = page
      .locator('div[class*="aspect-square"][class*="cursor-pointer"][class*="rounded-[10px]"]')
      .first();
    this.projectMoreButtons = page.getByRole('button', { name: '更多操作' });
  }

  /**
   * 等待 workflow 项目页的核心元素出现。
   */
  async waitForReady(): Promise<void> {
    await expect(this.page).toHaveURL(/\/workflow/, { timeout: 30_000 });
    await waitForVisible(this.myProjectsTab, 30_000);
    await waitForVisible(this.projectSearchInput, 30_000);
    await waitForVisible(this.createProjectCard, 30_000);
  }

  /**
   * 创建一个新的空白工作流，并返回新画布 ID。
   */
  async createWorkflow(): Promise<number> {
    await this.waitForReady();
    await waitForClickable(this.createProjectCard, 15_000);

    await withRetry(
      '点击空白工作流卡片',
      async () => {
        // 首页卡片偶发会吞第一次点击，直接在这里重试，别让上层业务再关心这个毛病。
        await this.createProjectCard.click();
        await expect(this.page).toHaveURL(/\/canvas\/\d+/, { timeout: 30_000 });
      },
      { retries: 2 },
    );

    return this.getCanvasId();
  }

  /**
   * 根据关键字筛出项目卡片。
   */
  projectCardsByKeyword(keyword: string): Locator {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByRole('button', { name: '更多操作' }) })
      .filter({ hasText: keyword });
  }

  /**
   * 在“我的项目”里按关键字搜索。
   */
  async searchProjects(keyword: string): Promise<void> {
    await this.waitForReady();
    await this.myProjectsTab.click().catch(() => undefined);
    await this.projectSearchInput.fill('');
    await this.projectSearchInput.fill(keyword);
  }

  /**
   * 删除搜索结果里的第一个匹配项目。
   *
   * 返回值：
   * - true：删到了
   * - false：一个都没找到
   */
  async deleteFirstProjectByKeyword(keyword: string, timeoutMs = 15_000): Promise<boolean> {
    await this.searchProjects(keyword);
    const cards = this.projectCardsByKeyword(keyword);
    const beforeCount = await cards.count();
    if (beforeCount === 0) {
      return false;
    }

    const targetCard = cards.first();
    const moreButton = targetCard.getByRole('button', { name: '更多操作' }).first();
    await waitForClickable(moreButton, timeoutMs);
    await moreButton.click({ force: true });

    const deleteEntry = this.page.getByRole('menuitem', { name: /删除/ }).first();
    // 菜单项有时是 menuitem，有时只是普通文本按钮，两种都兼容掉。
    if (await deleteEntry.count().catch(() => 0)) {
      await deleteEntry.click({ force: true });
    } else {
      await this.page.getByText(/删除/, { exact: true }).first().click({ force: true });
    }

    const confirmButton = this.page.getByRole('button', { name: /确 定|确定|确认/ }).last();
    await waitForClickable(confirmButton, timeoutMs);
    await confirmButton.click({ force: true });

    await expect
      .poll(async () => await this.projectCardsByKeyword(keyword).count(), {
        timeout: timeoutMs,
        intervals: [500, 1_000],
      })
      .toBeLessThan(beforeCount);

    return true;
  }

  /**
   * 从当前 URL 中提取画布 ID。
   */
  getCanvasId(): number {
    const matched = this.page.url().match(/\/canvas\/(\d+)/);
    if (!matched) {
      throw new Error(`当前页面不是画布页: ${this.page.url()}`);
    }
    return Number(matched[1]);
  }
}
