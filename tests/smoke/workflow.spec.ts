import { test, expect } from '@playwright/test';
import { enterWorkflowPage } from '../helpers/navigation';
import { WorkflowPage } from '../../pages/workflow.page';

test.describe('workflow module', () => {
  test('页面加载展示项目和工作流', async ({ page }) => {
    const workflowPage = await enterWorkflowPage(page);
    await workflowPage.waitForReady();

    await expect(workflowPage.projectGalleryFirstImage).toBeVisible();
    await expect(workflowPage.workflowCard).toBeVisible();
  });

  test('工作流筛选与搜索输入可用', async ({ page }) => {
    const workflowPage = await enterWorkflowPage(page);
    await workflowPage.waitForReady();

    await workflowPage.selectWorkflowCategory('全部');
    await workflowPage.selectWorkflowCategory('通用类');

    await workflowPage.searchInProjects('项目');
    await workflowPage.searchInWorkflows('项目');
  });

  test('项目中心标签切换与搜索框存在', async ({ page }) => {
    const workflowPage = await enterWorkflowPage(page);
    await workflowPage.waitForReady();

    await workflowPage.switchProjectTab('我的收藏');
    await workflowPage.switchProjectTab('我的项目');

    await expect(workflowPage.projectSearch).toBeVisible();
  });

  test('工作流分类全量可点', async ({ page }) => {
    const workflowPage = await enterWorkflowPage(page);
    await workflowPage.waitForReady();

    for (const cat of workflowPage.workflowCategories) {
      await workflowPage.selectWorkflowCategory(cat);
    }
  });

  test('项目操作：新建/复制/收藏/删除/展开', async ({ page }) => {
    const workflowPage = await enterWorkflowPage(page);
    await workflowPage.waitForReady();

    await workflowPage.expandProjects();
    await workflowPage.clickNewProject();
    const copied = await workflowPage.copyFirstProject();
    await workflowPage.favoriteFirstProject();
    if (copied) {
      await workflowPage.deleteFirstProject();
    }
  });

  test('分类区域搜索和收藏可见', async ({ page }) => {
    const workflowPage = await enterWorkflowPage(page);
    await workflowPage.waitForReady();

    await workflowPage.selectWorkflowCategory('化妆品类');
    await workflowPage.searchInWorkflows('项目');
    await workflowPage.favoriteWorkflowCard();
    await workflowPage.selectWorkflowCategory('收藏');
    await workflowPage.assertWorkflowCardVisible();
  });
});
