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

export function getBalanceTotal(balance: AccountBalance): number {
  return balance.rechargeBalance + balance.giftBalance;
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

  async dispose(): Promise<void> {
    await this.requestContext.dispose();
  }
}
