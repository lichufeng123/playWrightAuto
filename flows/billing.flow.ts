import {
  AccountBalance,
  AccountFlowRecord,
  BillingApi,
  BillingSnapshot,
  filterFlowRecordsAfter,
  getBalanceTotal,
} from '../api/billing.api';
import { assertConditionRemains, pollUntil } from '../utils/polling';

export class BillingFlow {
  constructor(private readonly billingApi: BillingApi) {}

  async getBalance(): Promise<AccountBalance> {
    return this.billingApi.getBalance();
  }

  async captureSnapshot(size = 20): Promise<BillingSnapshot> {
    return this.billingApi.captureSnapshot(size);
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

  async waitForFlowRecordsSince(
    snapshotBefore: BillingSnapshot,
    matcher: (record: AccountFlowRecord) => boolean,
    options?: {
      timeoutMs?: number;
      minCount?: number;
      size?: number;
    },
  ): Promise<AccountFlowRecord[]> {
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const minCount = options?.minCount ?? 1;
    const size = options?.size ?? 20;

    return pollUntil(
      async () => {
        const records = await this.billingApi.listFlows(size);
        return filterFlowRecordsAfter(records, snapshotBefore.latestFlowId);
      },
      records => records.filter(matcher).length >= minCount,
      {
        timeoutMs,
        intervalMs: 1_500,
        description: `等待新增消费流水达到 ${minCount} 条`,
      },
    ).then(records => records.filter(matcher));
  }

  async assertBalanceUnchanged(
    balanceBefore: AccountBalance,
    observeMs = 5_000,
  ): Promise<AccountBalance> {
    return assertConditionRemains(
      () => this.billingApi.getBalance(),
      balance => getBalanceTotal(balance) === getBalanceTotal(balanceBefore),
      {
        timeoutMs: observeMs,
        intervalMs: 1_000,
        description: '余额发生变化，未命中余额不足拦截',
      },
    );
  }

  async assertNoNewFlowRecordsSince(
    snapshotBefore: BillingSnapshot,
    observeMs = 5_000,
    size = 20,
  ): Promise<AccountFlowRecord[]> {
    const latestRecords = await assertConditionRemains(
      () => this.billingApi.listFlows(size),
      records => filterFlowRecordsAfter(records, snapshotBefore.latestFlowId).length === 0,
      {
        timeoutMs: observeMs,
        intervalMs: 1_000,
        description: '出现了新增消费流水，未命中余额不足拦截',
      },
    );

    return filterFlowRecordsAfter(latestRecords, snapshotBefore.latestFlowId);
  }
}
