import { APIRequestContext, Page, request } from '@playwright/test';

function resolveGatewayOriginByHost(host: string): string {
  if (host.startsWith('test-')) {
    return 'https://gapi-test.idealead.com';
  }
  return 'https://gapi.idealead.com';
}

export function resolveGatewayOrigin(page: Page): string {
  const currentUrl = page.url();
  if (!currentUrl || currentUrl === 'about:blank') {
    throw new Error('当前页面未初始化，无法解析网关域名');
  }
  return resolveGatewayOriginByHost(new URL(currentUrl).host);
}

export async function getAccessToken(page: Page): Promise<string> {
  const storageState = await page.context().storageState();
  const tokenEntry = storageState.origins
    .flatMap(origin => origin.localStorage)
    .find(entry => entry.name === 'accessToken');

  if (!tokenEntry?.value) {
    throw new Error('未在 storageState 中找到 accessToken');
  }

  const parsed = JSON.parse(tokenEntry.value) as { value?: string };
  if (!parsed.value) {
    throw new Error('accessToken 格式异常，缺少 value 字段');
  }

  return parsed.value;
}

export async function createAuthedApiContext(page: Page): Promise<{
  gatewayOrigin: string;
  context: APIRequestContext;
}> {
  const gatewayOrigin = resolveGatewayOrigin(page);
  const token = await getAccessToken(page);
  const context = await request.newContext({
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    gatewayOrigin,
    context,
  };
}
