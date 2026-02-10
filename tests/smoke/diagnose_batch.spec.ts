import { test } from '@playwright/test';
import { AgentPage } from '../../pages/agent.page';
import { enterAgentPage } from '../helpers/navigation';

test('DIAGNOSE: Check agent count', async ({ page }) => {
    const agentPage = new AgentPage(page);
    await enterAgentPage(page);
    const names = await agentPage.getAllAgentNames();
    console.log(`[DIAGNOSE] Current agents in list: ${names.length}`);
    console.log(`[DIAGNOSE] Names:`, names);

    // Check if stopButton is visible for any agent (indicates active chat)
    const stopVisible = await agentPage.stopButton.count();
    console.log(`[DIAGNOSE] Stop button count: ${stopVisible}`);
});
