import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/login.page';
import { validLoginData } from '../data/login.data';

function defaultAuthUserForBaseURL(url: string): 'testUser' | 'prodUser' {
  try {
    const host = new URL(url).host;
    return host.startsWith('test-') ? 'testUser' : 'prodUser';
  } catch {
    return 'testUser';
  }
}

function normalizeAuthUser(value: string | undefined, baseURLForDefault: string): string {
  const raw = (value || '').trim();
  if (!raw) return defaultAuthUserForBaseURL(baseURLForDefault);

  const lowered = raw.toLowerCase();

  // Backward-compatible aliases
  if (lowered === 'vip' || lowered === 'vipuser') return 'testUser';
  if (lowered === 'normal' || lowered === 'normaluser') return 'prodUser';

  // New canonical values
  if (lowered === 'test' || lowered === 'testuser') return 'testUser';
  if (lowered === 'prod' || lowered === 'produser') return 'prodUser';

  return raw;
}

function resolveLoginData(profile: string): { phone: string; code: string } {
  const phoneFromEnv = process.env.LOGIN_PHONE;
  const codeFromEnv = process.env.LOGIN_CODE;

  if (phoneFromEnv || codeFromEnv) {
    if (!phoneFromEnv || !codeFromEnv) {
      throw new Error('LOGIN_PHONE 与 LOGIN_CODE 需要同时设置');
    }
    return { phone: phoneFromEnv, code: codeFromEnv };
  }

  const key = profile as keyof typeof validLoginData;
  const data = validLoginData[key];
  if (!data) {
    throw new Error(
      `未知账号配置 PW_USER="${profile}". 可选值: ${Object.keys(validLoginData).join(', ')}`
    );
  }
  return data;
}

function resolveStorageStatePath(config: FullConfig): string {
  const storageState = config.projects[0]?.use?.storageState;
  if (!storageState || typeof storageState !== 'string') {
    throw new Error('playwright.config.ts 中未配置 use.storageState (string 路径)');
  }
  return storageState;
}

function resolveBaseURL(config: FullConfig): string {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL || typeof baseURL !== 'string') {
    throw new Error('playwright.config.ts 中未配置 use.baseURL');
  }
  return baseURL;
}

async function globalSetup(config: FullConfig) {
  const baseURL = resolveBaseURL(config);
  const storageStatePath = resolveStorageStatePath(config);
  const authUser = normalizeAuthUser(process.env.PW_USER, baseURL);
  const envName = (process.env.PW_ENV || 'test').toLowerCase();

  const storageStateAbsPath = path.resolve(storageStatePath);
  const shouldRefresh =
    process.env.PW_REFRESH_STATE === '1' || process.env.PW_REFRESH_STATE === 'true';

  console.log(
    `[globalSetup] env=${envName} baseURL=${baseURL} user=${authUser} storageState=${storageStatePath} refresh=${
      shouldRefresh ? '1' : '0'
    }`
  );

  if (!shouldRefresh && fs.existsSync(storageStateAbsPath)) {
    console.log(
      `[globalSetup] Reuse storageState: ${storageStatePath} (set PW_REFRESH_STATE=1 to re-login)`
    );
    return;
  }

  console.log('[globalSetup] Logging in...');

  fs.mkdirSync(path.dirname(storageStateAbsPath), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  const loginPage = new LoginPage(page);

  await loginPage.open();
  await loginPage.loginWith(resolveLoginData(authUser));

  // 等登录成功（非常重要）
  await page.waitForURL(url => !url.pathname.includes('/login'));

  // 保存登录态
  await context.storageState({ path: storageStatePath });
  await browser.close();
}

export default globalSetup;
