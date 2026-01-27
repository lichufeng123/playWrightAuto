import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { validLoginData, invalidLoginData} from '../../data/login.data'


for(const data of Object.values(validLoginData)){
    test(`login success - ${data.description}`, async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.open();
    await loginPage.loginWith(data);
//     await loginPage.login('validLoginData.phone', 'validLoginData.code');

    expect(loginPage.isLoginSuccess()).toBeTruthy();
});

    }


test('login failed with wrong code', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.loginWith(invalidLoginData);
//   await loginPage.login('invalidLoginData.phone', 'invalidLoginData.code');

  const error = await loginPage.getErrorMessage();
  expect(error).toContain('验证码');
});
