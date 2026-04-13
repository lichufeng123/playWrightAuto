import { expect, Locator, Page } from '@playwright/test';
import { AssetKind, canVerifyAssetUrlsInPanel, normalizeAssetUrl } from '../api/asset.api';
import { waitForVisible } from '../utils/wait';

const assetTabLabels: Record<AssetKind, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
};

/**
 * 画布左侧资产库面板。
 * 只处理“能否打开 / 能否看到对应资产”的 UI 语义，不承担资产增量判断。
 */
export class AssetPanelPage {
  readonly page: Page;
  readonly toolbarButtons: Locator;
  readonly panelRoot: Locator;
  readonly myAssetsTab: Locator;
  readonly publicAssetsTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.toolbarButtons = page.locator('button.w-12.h-12');
    this.panelRoot = page
      .locator('div')
      .filter({ has: page.getByText('我的资产', { exact: true }) })
      .filter({ has: page.getByText('公共资产', { exact: true }) })
      .filter({ has: page.getByText('图片', { exact: true }) })
      .last();
    this.myAssetsTab = this.panelRoot.getByText('我的资产', { exact: true });
    this.publicAssetsTab = this.panelRoot.getByText('公共资产', { exact: true });
  }

  /**
   * 判断左侧资产面板当前是否已经打开。
   */
  async isOpen(): Promise<boolean> {
    return await this.panelRoot.isVisible().catch(() => false);
  }

  /**
   * 打开左侧资产面板。
   *
   * 这里不是只点一个固定按钮，因为工具栏按钮顺序在不同版本里漂过。
   * 所以会按候选顺序逐个尝试，直到面板真的打开。
   */
  async open(timeoutMs = 10_000): Promise<void> {
    if (await this.isOpen()) {
      return;
    }

    const toggleCandidates = [
      this.toolbarButtons.nth(2),
      this.toolbarButtons.nth(3),
    ];

    // 左侧工具栏按钮顺序在不同版本里有过漂移，这里按已知顺序做兜底探测。
    for (const toggle of toggleCandidates) {
      if ((await toggle.count().catch(() => 0)) === 0) {
        continue;
      }

      await Promise.all([
        this.page
          .waitForResponse(
            response =>
              response.url().includes('/material-server/asset/aggregateQuery') &&
              response.request().method() === 'POST',
            { timeout: 5_000 },
          )
          .catch(() => null),
        toggle.click({ force: true }),
      ]);

      if (await this.isOpen()) {
        return;
      }
    }

    await waitForVisible(this.panelRoot, timeoutMs);
  }

  /**
   * 打开“我的资产”并切到指定资产类型 tab。
   *
   * 例如：
   * - 图片
   * - 视频
   * - 音频
   */
  async openMyAssets(assetType: AssetKind, timeoutMs = 10_000): Promise<void> {
    await this.open(timeoutMs);

    if (await this.publicAssetsTab.isVisible().catch(() => false)) {
      await this.myAssetsTab.click({ force: true }).catch(() => undefined);
    }

    const assetTab = this.assetTab(assetType);
    await assetTab.click({ force: true }).catch(() => undefined);

    if (canVerifyAssetUrlsInPanel(assetType)) {
      await expect
        .poll(async () => (await this.readVisibleAssetUrlsFromPanel(assetType)).length, {
          timeout: timeoutMs,
          intervals: [300, 500, 1_000],
        })
        .toBeGreaterThan(0);
      }
  }

  /**
   * 读取当前面板里能看到的资产媒体 URL。
   *
   * 这里只返回 UI 层可见的媒体地址，不负责判断这些 URL 属不属于本次 workflow。
   */
  async readVisibleAssetUrls(assetType: AssetKind): Promise<string[]> {
    await this.openMyAssets(assetType);
    return this.readVisibleAssetUrlsFromPanel(assetType);
  }

  /**
   * 等待 UI 面板里出现指定的一组资源 URL。
   *
   * 注意它只是“UI 可见性校验”：
   * 真正更严格的归属判断，已经在 AssetFlow 里通过 API 做了。
   */
  async waitForAssetUrls(assetType: AssetKind, urls: string[], timeoutMs = 20_000): Promise<void> {
    if (!canVerifyAssetUrlsInPanel(assetType)) {
      return;
    }

    // UI 只负责确认“面板里确实能看到这些媒体 URL”，更严格的归属判断放在 AssetFlow 做。
    const expectedUrls = urls.map(normalizeAssetUrl);
    await this.openMyAssets(assetType, timeoutMs);

    await expect
      .poll(async () => await this.readVisibleAssetUrlsFromPanel(assetType), {
        timeout: timeoutMs,
        intervals: [500, 1_000, 1_500],
      })
      .toEqual(expect.arrayContaining(expectedUrls));
  }

  /**
   * 根据资产类型返回对应的 tab 按钮。
   */
  private assetTab(assetType: AssetKind): Locator {
    return this.panelRoot.getByRole('button', { name: assetTabLabels[assetType] }).first();
  }

  /**
   * 根据资产类型，决定在面板里读哪种媒体元素。
   *
   * - 视频读 video 标签
   * - 图片读 img 标签
   */
  private mediaLocator(assetType: AssetKind): Locator {
    if (assetType === 'video') {
      return this.panelRoot.locator('video');
    }
    return this.panelRoot.locator('img');
  }

  /**
   * 从当前面板里提取真正可见的资产媒体 URL。
   *
   * 这里会过滤掉：
   * - 小图标
   * - 占位图
   * - 不带媒体地址的节点
   */
  private async readVisibleAssetUrlsFromPanel(assetType: AssetKind): Promise<string[]> {
    if (!canVerifyAssetUrlsInPanel(assetType)) {
      return [];
    }

    const urls = await this.mediaLocator(assetType).evaluateAll(nodes =>
      nodes
        .map(node => {
          const rect = node.getBoundingClientRect();
          const src =
            node.getAttribute('src') ||
            node.getAttribute('poster') ||
            '';
          return {
            src,
            width: rect.width,
            height: rect.height,
          };
        })
        // 过滤掉面板里的小图标、占位图，只保留真正的资产卡片媒体。
        .filter(item => item.width >= 80 && item.height >= 80 && item.src)
        .map(item => item.src),
    );

    return urls.map(normalizeAssetUrl);
  }
}
