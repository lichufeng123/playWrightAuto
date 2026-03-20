export async function withRetry<T>(
  label: string,
  action: () => Promise<T>,
  options?: {
    retries?: number;
  },
): Promise<T> {
  const retries = options?.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      console.warn(`[retry] ${label} 失败，准备重试 ${attempt + 1}/${retries}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
