import {test, expect} from '@playwright/test';
import {mockCatalog, pantry} from './catalogMocks';

test('compiled shop supports a deployment subpath, direct product URLs, assets and QR', async ({page, request}) => {
  await mockCatalog(page);
  const url = `/s/template/products/${pantry.products[0].ProductId}`;
  const html = await (await request.get(url)).text();
  expect(html).toContain('<title>Picomart Demo Shop</title>');
  expect(html).toContain('property="og:description"');
  expect(html).toContain('id="picomart-storefront-config"');
  expect(html.indexOf('<meta charset="UTF-8"')).toBeLessThan(1024);
  expect(html).not.toContain('id="picomart-ai-ordering"');
  const failed: string[] = [];
  page.on('pageerror', error => failed.push(error.message));
  page.on('response', response => {if (response.url().includes('/s/template/') && response.status() >= 400) failed.push(response.url());});
  await page.goto(url);
  await expect(page.getByRole('heading', {name: 'Extra Virgin Olive Oil', exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Open in Picomart', exact: true})).toHaveAttribute('href', `https://app.picomart.zkbytes.com/#${pantry.catalogSeed}${pantry.products[0].ProductId}2`);
  await page.getByRole('button', {name: 'Show product QR code'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', {name: 'Back to the collection'}).click();
  await expect(page).toHaveURL(/\/s\/template\/products$/);
  await page.reload();
  await expect(page.locator('.shop-product-card')).toHaveCount(3);
  await expect(page.locator('#picomart-catalog-data')).toHaveAttribute('href', `https://sync.picomart.zkbytes.com/api/v1/moderato/catalogs/${pantry.catalogSeed}`);
  expect(failed).toEqual([]);
});
