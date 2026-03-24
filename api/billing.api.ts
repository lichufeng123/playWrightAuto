import { APIRequestContext, Page } from '@playwright/test';
import { createAuthedApiContext } from './client';

export interface AccountBalance {
  id: number;
  userId: number;
  rechargeBalance: number;
  rechargeTotal: number;
  giftBalance: number;
  giftTotal: number;
}

export interface AccountFlowRecord {
  id: number;
  flowType: string;
  flowName: string;
  flowTime: string;
  flowPoints: number;
  remark: string;
}

export interface BillingSnapshot {
  balance: AccountBalance;
  flowRecords: AccountFlowRecord[];
  latestFlowId: number | null;
}

export function getBalanceTotal(balance: AccountBalance): number {
  return balance.rechargeBalance + balance.giftBalance;
}

export function getLatestFlowRecordId(records: AccountFlowRecord[]): number | null {
  if (!records.length) {
    return null;
  }
  return Math.max(...records.map(record => record.id));
}

export function filterFlowRecordsAfter(
  records: AccountFlowRecord[],
  latestKnownId: number | null,
): AccountFlowRecord[] {
  if (latestKnownId == null) {
    return records;
  }
  return records.filter(record => record.id > latestKnownId);
}

export function sumFlowPoints(records: AccountFlowRecord[]): number {
  return records.reduce((total, record) => total + record.flowPoints, 0);
}

export class BillingApi {
  private constructor(
    private readonly requestContext: APIRequestContext,
    private readonly gatewayOrigin: string,
  ) {}

  static async create(page: Page): Promise<BillingApi> {
    const { context, gatewayOrigin } = await createAuthedApiContext(page);
    return new BillingApi(context, gatewayOrigin);
  }

  private buildUrl(path: string): string {
    return `${this.gatewayOrigin}${path}`;
  }

  async getBalance(): Promise<AccountBalance> {
    const response = await this.requestContext.post(
      this.buildUrl('/order-server/api/account/balance'),
      {
        data: { timestamp: '' },
      },
    );

    if (!response.ok()) {
      throw new Error(`获取赛点余额失败: ${response.status()}`);
    }

    const payload = await response.json();
    return payload.data as AccountBalance;
  }

  async listFlows(size = 10): Promise<AccountFlowRecord[]> {
    const response = await this.requestContext.post(
      this.buildUrl('/order-server/api/account/flow'),
      {
        data: {
          flowType: '',
          bizType: '',
          pageQueryVO: {
            page: 1,
            size,
            pageSortList: [
              {
                field: 'create_time',
                order: 'desc',
              },
            ],
          },
        },
      },
    );

    if (!response.ok()) {
      throw new Error(`获取消费流水失败: ${response.status()}`);
    }

    const payload = await response.json();
    return (payload.data?.dataList ?? []) as AccountFlowRecord[];
  }

  async listWorkflowFlows(size = 20): Promise<AccountFlowRecord[]> {
    const records = await this.listFlows(size);
    return records.filter(record => record.flowName === 'WORKFLOW');
  }

  async captureSnapshot(size = 20): Promise<BillingSnapshot> {
    const [balance, flowRecords] = await Promise.all([
      this.getBalance(),
      this.listFlows(size),
    ]);

    return {
      balance,
      flowRecords,
      latestFlowId: getLatestFlowRecordId(flowRecords),
    };
  }

  async dispose(): Promise<void> {
    await this.requestContext.dispose();
  }
}
