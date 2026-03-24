import { expect, Locator, Page } from '@playwright/test';
import { dragBetweenLocators, dragLocatorByOffset } from '../utils/drag';
import { waitForCanvasReady, waitForClickable, waitForVisible } from '../utils/wait';

export class CanvasComponent {
  readonly page: Page;
  readonly canvasRoot: Locator;
  readonly uploadDialog: Locator;
  readonly uploadDialogCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvasRoot = page.locator('.react-flow').first();
    this.uploadDialog = page.getByRole('dialog', { name: '文件上传' });
    this.uploadDialogCloseButton = page.getByRole('button', { name: /Close/ }).last();
  }

  nodeByType(type: string, index = 0): Locator {
    return this.page.locator(`.react-flow__node-${type}`).nth(index);
  }

  targetHandleByType(type: string, index = 0, handleIndex = 0): Locator {
    return this.nodeByType(type, index).locator('.react-flow__handle-left').nth(handleIndex);
  }

  sourceHandleByType(type: string, index = 0): Locator {
    return this.nodeByType(type, index).locator('.react-flow__handle-right').first();
  }

  async waitForReady(): Promise<void> {
    await waitForCanvasReady(this.page, 45_000);
    await waitForVisible(this.canvasRoot, 15_000);
  }

  async selectNode(type: string, index = 0): Promise<void> {
    const node = this.nodeByType(type, index);
    await waitForClickable(node, 15_000);
    await node.click();
  }

  async closeUploadDialogIfOpen(): Promise<void> {
    if (!(await this.uploadDialog.isVisible().catch(() => false))) {
      return;
    }

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

  async connectNodes(options: {
    sourceType: string;
    sourceIndex?: number;
    targetType: string;
    targetIndex?: number;
    targetHandleIndex?: number;
  }): Promise<void> {
    const sourceHandle = this.sourceHandleByType(options.sourceType, options.sourceIndex ?? 0);
    const targetHandle = this.targetHandleByType(
      options.targetType,
      options.targetIndex ?? 0,
      options.targetHandleIndex ?? 0,
    );

    await waitForVisible(sourceHandle, 15_000);
    await waitForVisible(targetHandle, 15_000);
    await dragBetweenLocators(this.page, sourceHandle, targetHandle);
  }
}
