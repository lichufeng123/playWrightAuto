import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly phoneInput: Locator;
  readonly codeButton: Locator;
  readonly codeInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.phoneInput = page.getByRole('textbox', { name: '请输入手机号' });
    this.codeButton = page.getByText('获取验证码')
    this.codeInput = page.getByRole('textbox', { name: '验证码' });
    this.loginButton = page.getByRole('button', { name: '登录' });
    this.errorMessage = page.getByText('请输入正确的验证码');
  }

  async open() {
    await this.page.goto('/login');
  }

  async loginWith(data:{phone:string;code:string}) {
    await this.phoneInput.fill(data.phone);
    await Promise.all([
        this.page.waitForResponse(response =>
            response.url().includes('/getSmsCode') && response.status() == 200
            ),
        this.codeButton.click(),
        ]);
    await this.codeInput.fill(data.code);
    await this.loginButton.click();
  }

  async isLoginSuccess(): Promise<boolean> {
    return !this.page.url().includes('/login');
  }
  async getErrorMessage(): Promise<string | null> {
      if(await this.errorMessage.isVisible()){
          return await this.errorMessage.textContent();
          }
      return null;

    }

}
