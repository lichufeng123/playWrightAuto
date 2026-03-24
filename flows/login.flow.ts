import { Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

export interface LoginCredentials {
  phone: string;
  code: string;
}

export class LoginFlow {
  readonly loginPage: LoginPage;

  constructor(private readonly page: Page) {
    this.loginPage = new LoginPage(page);
  }

  async openLoginPage(): Promise<void> {
    await this.loginPage.open();
  }

  async login(credentials: LoginCredentials): Promise<void> {
    await this.openLoginPage();
    await this.loginPage.loginWith(credentials);
  }

  async submitCredentials(credentials: LoginCredentials): Promise<void> {
    await this.openLoginPage();
    await this.loginPage.submitCredentials(credentials);
  }

  async loginAndEnterApp(
    credentials: LoginCredentials,
    landingPath = '/aichat',
  ): Promise<void> {
    await this.login(credentials);
    await this.page.goto(landingPath, { waitUntil: 'networkidle' });
    await this.page.waitForURL(url => !url.pathname.includes('/login'));
  }

  async isLoginSuccess(): Promise<boolean> {
    return this.loginPage.isLoginSuccess();
  }
}
