import { test, expect } from '@playwright/test';
import { LoginFlow } from '../../flows/login.flow';
import { validLoginData, invalidLoginData} from '../../data/login.data'


for(const data of Object.values(validLoginData)){
    test(`login success - ${data.description}`, async ({ page }) => {
    const loginFlow = new LoginFlow(page);

    await loginFlow.login(data);

    await expect.poll(async () => loginFlow.isLoginSuccess()).toBeTruthy();
});

    }


for (const data of Object.values(invalidLoginData)) {
    test(`login failed - ${data.description}`, async ({ page }) => {
      const loginFlow = new LoginFlow(page);

      await loginFlow.submitCredentials(data);

      const error = await loginFlow.loginPage.getErrorMessage();
      expect(error).toContain('验证码');
    });
}
