import { AccountBalance, AccountFlowRecord, BillingApi, getBalanceTotal } from '../api/billing.api';
import { pollUntil } from '../utils/polling';

export class BillingFlow {
  constructor(private readonly billingApi: BillingApi) {}

  async getBalance(): Promise<AccountBalance> {
    return this.billingApi.getBalance();
  }

  async waitForBalanceDelta(
    balanceBefore: AccountBalance,
    delta: number,
    timeoutMs = 30_000,
  ): Promise<AccountBalance> {
    const expectedTotal = getBalanceTotal(balanceBefore) + delta;
    return pollUntil(
      () => this.billingApi.getBalance(),
      balance => getBalanceTotal(balance) === expectedTotal,
      {
        timeoutMs,
        intervalMs: 1_500,
        description: `等待赛点余额变化 ${delta}`,
      },
    );
  }

  async waitForLatestFlowRecord(
    matcher: (record: AccountFlowRecord) => boolean,
    timeoutMs = 30_000,
  ): Promise<AccountFlowRecord> {
    const records = await pollUntil(
      () => this.billingApi.listFlows(10),
      items => items.some(matcher),
      {
        timeoutMs,
        intervalMs: 1_500,
        description: '等待消费流水生成',
      },
    );

    const matched = records.find(matcher);
    if (!matched) {
      throw new Error('未找到匹配的消费流水记录');
    }

    return matched;
  }
}
