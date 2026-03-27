function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function pollUntil<T>(
  action: () => Promise<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    description?: string;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const intervalMs = options?.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  while (Date.now() <= deadline) {
    lastValue = await action();
    if (await predicate(lastValue)) {
      return lastValue;
    }
    await sleep(intervalMs);
  }

  throw new Error(options?.description ?? '轮询超时');
}

export async function waitForQuietPeriod(
  readValue: () => Promise<number>,
  options?: {
    quietMs?: number;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<number> {
  const quietMs = options?.quietMs ?? 1_000;
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const intervalMs = options?.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastValue = await readValue();
  let stableSince = Date.now();

  while (Date.now() <= deadline) {
    await sleep(intervalMs);
    const currentValue = await readValue();
    if (currentValue !== lastValue) {
      lastValue = currentValue;
      stableSince = Date.now();
      continue;
    }

    if (Date.now() - stableSince >= quietMs) {
      return currentValue;
    }
  }

  return lastValue;
}

export async function assertConditionRemains<T>(
  action: () => Promise<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    description?: string;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const intervalMs = options?.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  while (Date.now() <= deadline) {
    lastValue = await action();
    if (!(await predicate(lastValue))) {
      throw new Error(options?.description ?? '稳定性断言失败');
    }
    await sleep(intervalMs);
  }

  if (lastValue === undefined) {
    throw new Error(options?.description ?? '稳定性断言失败');
  }

  return lastValue;
}
