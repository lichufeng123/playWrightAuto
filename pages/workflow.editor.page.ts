import { expect, Locator, Page } from '@playwright/test';
import { dragBetweenLocators, dragLocatorByOffset } from '../utils/drag';
import { withRetry } from '../utils/retry';
import { waitForCanvasReady, waitForClickable, waitForVisible } from '../utils/wait';
import { AssetPanelPage } from './asset.panel.page';
import { NodePanelPage } from './node.panel.page';

/**
 * Workflow 画布编辑页。
 * 负责画布域交互，并把节点面板、资产面板这类子区域组合成一个页面对象。
 */
export class WorkflowEditorPage {
  readonly page: Page;
  readonly assetPanel: AssetPanelPage;
  readonly nodePanel: NodePanelPage;
  readonly canvasRoot: Locator;
  readonly uploadDialog: Locator;
  readonly uploadDialogCloseButton: Locator;
  readonly addNodeButton: Locator;
  readonly drawerTitle: Locator;
  readonly nodeItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.assetPanel = new AssetPanelPage(page);
    this.nodePanel = new NodePanelPage(page);
    this.canvasRoot = page.locator('.react-flow').first();
    this.uploadDialog = page.getByRole('dialog', { name: '文件上传' });
    this.uploadDialogCloseButton = page.getByRole('button', { name: /Close/ }).last();
    this.addNodeButton = page.locator('button.w-12.h-12').first();
    this.drawerTitle = page.getByText('基础节点', { exact: true });
    this.nodeItems = page.locator('button[class*="_nodeItem_"]');
  }

  /**
   * 等待画布页面核心区域准备完成。
   *
   * 条件包括：
   * - React Flow 画布已渲染
   * - 画布根节点可见
   * - 右侧节点面板如果存在，也尽量等它恢复
   */
  async waitForReady(): Promise<void> {
    await waitForCanvasReady(this.page, 45_000);
    await waitForVisible(this.canvasRoot, 15_000);
    await this.nodePanel.waitForPanelReady(20_000).catch(() => undefined);
  }

  /**
   * 从当前 URL 中解析出 canvasId。
   */
  getCanvasId(): number {
    const matched = this.page.url().match(/\/canvas\/(\d+)/);
    if (!matched) {
      throw new Error(`当前页面不是画布页: ${this.page.url()}`);
    }
    return Number(matched[1]);
  }

  /**
   * 按节点类型和索引拿到画布上的节点定位器。
   */
  nodeByType(type: string, index = 0): Locator {
    return this.page.locator(`.react-flow__node-${type}`).nth(index);
  }

  /**
   * 从左侧抽屉里添加一个节点到画布。
   */
  async addNode(nodeLabel: string): Promise<void> {
    await this.openDrawer();
    const nodeItem = this.nodeItems.filter({ hasText: nodeLabel }).first();
    await waitForClickable(nodeItem, 15_000);
    await nodeItem.click({ force: true });
  }

  /**
   * 选中画布上的某个节点，让右侧参数面板切到它。
   */
  async selectNode(type: string, index = 0): Promise<void> {
    const node = this.nodeByType(type, index);
    await waitForVisible(node, 15_000);
    await node.click({ force: true });
  }

  async closeUploadDialogIfOpen(): Promise<void> {
    if (!(await this.uploadDialog.isVisible().catch(() => false))) {
      return;
    }

    // 上传弹窗会挡住右侧参数区和画布点击，任何节点操作前都先把它关掉。
    await this.page.keyboard.press('Escape').catch(() => undefined);
    if (await this.uploadDialog.isVisible().catch(() => false)) {
      await this.uploadDialogCloseButton.click({ force: true });
    }
    await expect(this.uploadDialog).toBeHidden({ timeout: 10_000 });
  }

  async dragNodeByOffset(
    type: string,
    index: number,
    offsetX: number,
    offsetY: number,
  ): Promise<void> {
    const node = this.nodeByType(type, index);
    await waitForVisible(node, 15_000);
    await dragLocatorByOffset(this.page, node, offsetX, offsetY);
  }

  /**
   * 用拖拽的方式把两个节点连起来。
   *
   * 这里只负责 UI 拖线动作；
   * 如果后面要做 API 自愈，是 WorkflowFlow 那一层的事。
   */
  async connectNodes(options: {
    sourceType: string;
    sourceIndex?: number;
    targetType: string;
    targetIndex?: number;
    targetHandleIndex?: number;
  }): Promise<void> {
    const sourceHandle = this.nodeByType(options.sourceType, options.sourceIndex ?? 0)
      .locator('.react-flow__handle-right')
      .first();
    const targetHandle = this.nodeByType(options.targetType, options.targetIndex ?? 0)
      .locator('.react-flow__handle-left')
      .nth(options.targetHandleIndex ?? 0);

    await waitForVisible(sourceHandle, 15_000);
    await waitForVisible(targetHandle, 15_000);
    await dragBetweenLocators(this.page, sourceHandle, targetHandle);
  }

  /**
   * 打开左侧“基础节点”抽屉。
   */
  private async openDrawer(): Promise<void> {
    await waitForClickable(this.addNodeButton, 30_000);
    if (await this.drawerTitle.isVisible().catch(() => false)) {
      return;
    }

    await withRetry(
      '打开节点抽屉',
      async () => {
        // 抽屉偶发第一次点击不响应，重试一次比在调用侧到处补 wait 更干净。
        await this.addNodeButton.click({ force: true });
        await waitForVisible(this.drawerTitle, 10_000);
      },
      { retries: 2 },
    );
  }
}
