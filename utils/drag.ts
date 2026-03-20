import { Locator, Page } from '@playwright/test';

function centerOf(box: { x: number; y: number; width: number; height: number }) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

export async function dragBetweenLocators(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('拖拽失败，未获取到连接手柄坐标');
  }

  const start = centerOf(sourceBox);
  const end = centerOf(targetBox);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 16 });
  await page.mouse.up();
}

export async function dragLocatorByOffset(
  page: Page,
  locator: Locator,
  offsetX: number,
  offsetY: number,
): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('拖拽失败，未获取到节点坐标');
  }

  const start = {
    x: box.x + Math.min(160, box.width * 0.25),
    y: box.y + Math.min(48, box.height * 0.08),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + offsetX, start.y + offsetY, { steps: 20 });
  await page.mouse.up();
}
