import { AssetApi, AssetRecord, AssetSnapshot, AssetKind, filterAssetsAfter } from '../api/asset.api';
import { assertConditionRemains, pollUntil } from '../utils/polling';

export interface AssetWaitResult {
  matchedAssets: AssetRecord[];
  newAssets: AssetRecord[];
  snapshot: AssetSnapshot;
}

/**
 * 资产库业务编排层。
 * 通过“执行前快照 + 执行后轮询”的方式判断是否新增了本次任务对应的资产。
 */
export class AssetFlow {
  constructor(private readonly assetApi: AssetApi) {}

  /**
   * 记录当前资产库状态，给后续“成功后有新增 / 失败后无新增”做基线。
   */
  async captureSnapshot(assetType: AssetKind, pageSize = 15): Promise<AssetSnapshot> {
    return this.assetApi.captureSnapshot(assetType, pageSize);
  }

  /**
   * 等待指定条件的资产在快照之后出现。
   *
   * 典型用法：
   * - 先在执行前抓快照
   * - 执行工作流
   * - 用 matcher 过滤出属于当前 canvas / 当前输出 URL 的资产
   * - 直到命中数量满足预期才返回
   */
  async waitForNewAssetsSince(
    snapshotBefore: AssetSnapshot,
    matcher: (record: AssetRecord) => boolean,
    options?: {
      timeoutMs?: number;
      minCount?: number;
      pageSize?: number;
    },
  ): Promise<AssetWaitResult> {
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const minCount = options?.minCount ?? 1;
    const pageSize = options?.pageSize ?? 15;

    const snapshotAfter = await pollUntil(
      () => this.assetApi.captureSnapshot(snapshotBefore.assetType, pageSize),
      snapshot => {
        // 先按最新资产 ID 过滤出新增项，再用业务 matcher 缩小到当前 workflow 生成的资产。
        const newAssets = filterAssetsAfter(snapshot.records, snapshotBefore.latestAssetId);
        const matchedAssets = newAssets.filter(matcher);
        return snapshot.total >= snapshotBefore.total + minCount && matchedAssets.length >= minCount;
      },
      {
        timeoutMs,
        intervalMs: 1_500,
        description: `等待${snapshotBefore.assetType}资产新增 ${minCount} 个`,
      },
    );

    const newAssets = filterAssetsAfter(snapshotAfter.records, snapshotBefore.latestAssetId);
    return {
      matchedAssets: newAssets.filter(matcher),
      newAssets,
      snapshot: snapshotAfter,
    };
  }

  /**
   * 断言在一段观察时间内，不会出现符合条件的新资产。
   *
   * 这是给失败场景、低余额拦截场景用的：
   * 不是简单看资产总数是否变化，而是看“当前 workflow 对应的资产有没有冒出来”。
   */
  async assertNoNewAssetsSince(
    snapshotBefore: AssetSnapshot,
    matcher: (record: AssetRecord) => boolean,
    observeMs = 5_000,
    pageSize = 15,
  ): Promise<AssetWaitResult> {
    const snapshotAfter = await assertConditionRemains(
      () => this.assetApi.captureSnapshot(snapshotBefore.assetType, pageSize),
      snapshot => {
        // 失败 / 拦截场景不是看“总数完全不变”，而是看“没有属于当前画布的新增资产”。
        const newAssets = filterAssetsAfter(snapshot.records, snapshotBefore.latestAssetId);
        return newAssets.filter(matcher).length === 0;
      },
      {
        timeoutMs: observeMs,
        intervalMs: 1_000,
        description: `出现了新的${snapshotBefore.assetType}资产，未命中资产拦截`,
      },
    );

    const newAssets = filterAssetsAfter(snapshotAfter.records, snapshotBefore.latestAssetId);
    return {
      matchedAssets: newAssets.filter(matcher),
      newAssets,
      snapshot: snapshotAfter,
    };
  }
}
