import { expect, Locator, Page } from '@playwright/test';

const ALT_PROJECT_CENTER = /项目中心/;
const ALT_MY_PROJECTS = /我的项目/;
const ALT_MY_FAVORITES = /我的收藏/;
const ALT_SEARCH_PROJECT = /搜索项目/;
const ALT_WORKFLOW = /电商工作流/;

export class WorkflowPage {
    readonly page: Page;
    readonly projectCenterHeading: Locator;
    readonly projectCenterSection: Locator;
    readonly projectTabs: Locator;
    readonly projectSearch: Locator;
    readonly projectGalleryFirstImage: Locator;
    readonly projectCards: Locator;

    readonly workflowHeading: Locator;
    readonly workflowSection: Locator;
    readonly workflowFilterBar: Locator;
    readonly workflowSearch: Locator;
    readonly workflowCard: Locator;
    readonly workflowCategories: string[] = ['全部', '通用类', '化妆品类', '3C类', '珠宝类', '服装类', '收藏'];

    constructor(page: Page) {
        this.page = page;

        this.projectCenterHeading = page.getByText(ALT_PROJECT_CENTER);
        this.projectCenterSection = this.projectCenterHeading.locator('xpath=ancestor::*[self::section or self::div][2]');
        this.projectTabs = this.projectCenterSection.getByText(new RegExp([ALT_MY_PROJECTS.source, ALT_MY_FAVORITES.source].join('|')));
        this.projectSearch = this.projectCenterSection.getByPlaceholder(ALT_SEARCH_PROJECT);
        this.projectGalleryFirstImage = this.projectCenterSection.locator('img').first();
        this.projectCards = this.projectCenterSection.locator('div').filter({ has: this.projectCenterSection.locator('img') });

        this.workflowHeading = page.getByText(ALT_WORKFLOW);
        // 向上取更高一层容器，包含标题与下方卡片区域
        this.workflowSection = this.workflowHeading.locator('xpath=ancestor::*[self::section or self::div][2]');
        this.workflowFilterBar = this.workflowSection.getByRole('button');
        this.workflowSearch = this.workflowSection.getByPlaceholder(ALT_SEARCH_PROJECT);
        this.workflowCard = this.workflowSection.locator('img').first();
    }

    async waitForReady(): Promise<void> {
        await expect(this.projectCenterHeading).toBeVisible();
        await expect(this.projectTabs.first()).toBeVisible();
        await expect(this.projectSearch).toBeVisible();

        await expect(this.workflowHeading).toBeVisible();
        await expect(this.workflowFilterBar.first()).toBeVisible();
        await expect(this.workflowCard).toBeVisible({ timeout: 20000 });
    }

    async selectWorkflowCategory(name: string): Promise<void> {
        const pattern = this.mapFilterName(name);
        const button = this.workflowSection.getByText(pattern);
        await expect(button).toBeVisible();
        await button.click();
        await this.assertWorkflowCardVisible();
    }

    async switchProjectTab(name: '我的项目' | '我的收藏'): Promise<void> {
        const pattern = name === '我的项目' ? ALT_MY_PROJECTS : ALT_MY_FAVORITES;
        const tab = this.projectCenterSection.getByText(pattern);
        await expect(tab).toBeVisible();
        await tab.click();
    }

    async expandProjects(): Promise<void> {
        const expandBtn = this.projectCenterSection.getByText(/展开/);
        await expect(expandBtn).toBeVisible();
        await expandBtn.click();
    }

    async clickNewProject(): Promise<boolean> {
        let addButton = this.projectCenterSection.getByRole('button', { name: /新建|创建|添加|新增|\+/ }).first();
        if (await addButton.count() === 0) {
            addButton = this.projectCenterSection.getByText('+').first();
        }
        if (await addButton.count() === 0) {
            console.warn('新建项目入口未找到，跳过新建操作');
            return false;
        }
        await addButton.click();
        return true;
    }

    async copyFirstProject(): Promise<boolean> {
        const card = this.projectCards.nth(0);
        const copyBtn = card.getByRole('button', { name: /复制|copy/i }).first();
        if (await copyBtn.count() === 0) {
            console.warn('复制按钮未找到，跳过复制操作');
            return false;
        }
        await copyBtn.click();
        return true;
    }

    async favoriteFirstProject(): Promise<boolean> {
        const card = this.projectCards.nth(0);
        const favBtn = card.getByRole('button', { name: /收藏|favorite/i }).first();
        if (await favBtn.count() === 0) {
            console.warn('收藏按钮未找到，跳过收藏操作');
            return false;
        }
        await favBtn.click();
        return true;
    }

    async deleteFirstProject(): Promise<boolean> {
        const card = this.projectCards.nth(0);
        const deleteBtn = card.getByRole('button', { name: /删除|移除|delete/i }).first();
        if (await deleteBtn.count() === 0) {
            console.warn('删除按钮未找到，跳过删除操作');
            return false;
        }
        await deleteBtn.click();
        return true;
    }

    async favoriteWorkflowCard(): Promise<boolean> {
        const card = this.workflowCard.locator('xpath=ancestor::*[self::div][1]');
        let favBtn = card.getByRole('button', { name: /收藏|favorite|星标/i }).first();
        if (await favBtn.count() === 0) {
            favBtn = card.locator('[aria-label*="收藏"], [title*="收藏"]').first();
        }
        if (await favBtn.count() === 0) {
            console.warn('工作流收藏按钮未找到，跳过收藏操作');
            return false;
        }
        await favBtn.click();
        return true;
    }

    async assertWorkflowCardVisible(): Promise<void> {
        await expect(this.workflowCard).toBeVisible({ timeout: 20000 });
    }

    async searchInProjects(keyword: string): Promise<void> {
        await expect(this.projectSearch).toBeVisible();
        await this.projectSearch.fill(keyword);
    }

    async searchInWorkflows(keyword: string): Promise<void> {
        await expect(this.workflowSearch).toBeVisible();
        await this.workflowSearch.fill(keyword);
    }

    private mapFilterName(name: string): RegExp {
        const map: Record<string, RegExp> = {
            '全部': /全部/,
            '通用类': /通用类/,
            '化妆品类': /化妆品类/,
            '3C类': /3C类/,
            '珠宝类': /珠宝类/,
            '服装类': /服装类/,
            '收藏': /收藏/,
        };
        return map[name] ?? new RegExp(name);
    }
}
