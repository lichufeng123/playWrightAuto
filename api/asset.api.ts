import { APIRequestContext, Page, request } from '@playwright/test';
import { getAccessToken } from './client';

export type AssetKind = 'image' | 'video' | 'audio';

// aggregateQuery 接口实际使用的类型码，来自资产面板真实请求体。
const assetTypeCodeMap: Record<AssetKind, number> = {
  image: 1,
  video: 2,
  audio: 3,
};

export interface AssetRecord {
  id: number;
  type: number;
  coverUrl: string;
  fileUrl: string;
  createTime: string;
  sourceParam?: string;
  sourceType?: string;
  canvasId?: number;
  isInCollection?: number;
}

export interface AssetSnapshot {
  assetType: AssetKind;
  total: number;
  records: AssetRecord[];
  latestAssetId: number | null;
  raw: unknown;
}

/**
 * 根据当前页面域名，判断资产接口应该打测试环境还是正式环境。
 */
function resolveAssetGatewayOrigin(page: Page): string {
  const currentUrl = page.url();
  if (!currentUrl || currentUrl === 'about:blank') {
    throw new Error('当前页面未初始化，无法解析资产网关域名');
  }

  const host = new URL(currentUrl).host;
  if (host.startsWith('test-')) {
    return 'https://gapi-test.insight-aigc.com';
  }
  return 'https://gapi.insight-aigc.com';
}

/**
 * 从一批资产记录里取出当前最大的资产 ID。
 *
 * 这个值会被拿来当“快照分界线”，后面就能判断哪些资产是执行之后新增的。
 */
export function getLatestAssetId(records: AssetRecord[]): number | null {
  if (!records.length) {
    return null;
  }
  return Math.max(...records.map(record => record.id));
}

/**
 * 过滤出“在某个快照之后才出现”的资产。
 *
 * latestKnownId 就像一道时间线：
 * - 大于它的记录，视为新增资产
 * - 小于等于它的记录，视为旧资产
 */
export function filterAssetsAfter(
  records: AssetRecord[],
  latestKnownId: number | null,
): AssetRecord[] {
  if (latestKnownId == null) {
    return records;
  }
  return records.filter(record => record.id > latestKnownId);
}

/**
 * 根据 workflow 节点类型，映射到资产类型。
 */
export function resolveAssetKindByNodeType(nodeType: string): AssetKind | null {
  if (nodeType === 'image') return 'image';
  if (nodeType === 'video') return 'video';
  if (nodeType === 'audio') return 'audio';
  return null;
}

export function normalizeAssetUrl(url: string): string {
  // 资产 CDN 常带签名或裁剪参数，做前后对比时先去掉 query，避免同一资源被误判成不同 URL。
  return url.split('?')[0];
}

export function canVerifyAssetUrlsInPanel(assetType: AssetKind): boolean {
  // 音频面板目前只有通用图标，没有稳定的媒体 URL 可比对，只能做 API 级校验。
  return assetType === 'image' || assetType === 'video';
}

/**
 * 资产库 API 封装。
 * 只负责读取资产快照，不在这里揉进页面交互和业务判断。
 */
export class AssetApi {
  private constructor(
    private readonly requestContext: APIRequestContext,
    private readonly gatewayOrigin: string,
  ) {}

  /**
   * 创建资产 API 客户端。
   *
   * 这里会复用当前页面登录态里的 access token，
   * 所以不需要再手工传账号密码。
   */
  static async create(page: Page): Promise<AssetApi> {
    const token = await getAccessToken(page);
    const context = await request.newContext({
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return new AssetApi(context, resolveAssetGatewayOrigin(page));
  }

  /**
   * 拼完整接口地址。
   */
  private buildUrl(path: string): string {
    return `${this.gatewayOrigin}${path}`;
  }

  /**
   * 查询某一类资产列表，并包装成统一快照结构。
   *
   * 返回值除了接口原始数据，还会补充：
   * - total：总条数
   * - latestAssetId：当前页里最大的资产 ID
   * 这些字段是后续做“新增资产判断”要用的。
   */
  async listAssets(
    assetType: AssetKind,
    options?: {
      pageSize?: number;
      pageIndex?: number;
      isPublic?: 0 | 1;
      isDesc?: 0 | 1;
    },
  ): Promise<AssetSnapshot> {
    const pageSize = options?.pageSize ?? 15;
    const pageIndex = options?.pageIndex ?? 1;
    const isPublic = options?.isPublic ?? 0;
    const isDesc = options?.isDesc ?? 1;

    const response = await this.requestContext.post(
      this.buildUrl('/material-server/asset/aggregateQuery'),
      {
        data: {
          pageSize,
          pageIndex,
          isPublic,
          isDesc,
          type: assetTypeCodeMap[assetType],
        },
      },
    );

    if (!response.ok()) {
      throw new Error(`获取${assetType}资产失败: ${response.status()}`);
    }

    const payload = await response.json();
    const records = (payload.data?.dataList ?? []) as AssetRecord[];

    return {
      assetType,
      total: Number(payload.data?.total ?? 0),
      records,
      latestAssetId: getLatestAssetId(records),
      raw: payload,
    };
  }

  /**
   * 抓一份资产库快照。
   *
   * 语义上它和 listAssets 的区别是：
   * - listAssets 更像“普通查询接口”
   * - captureSnapshot 更像“我要记录此刻状态，后面拿来做前后对比”
   */
  async captureSnapshot(assetType: AssetKind, pageSize = 15): Promise<AssetSnapshot> {
    return this.listAssets(assetType, { pageSize });
  }

  /**
   * 释放请求上下文。
   */
  async dispose(): Promise<void> {
    await this.requestContext.dispose();
  }
}
