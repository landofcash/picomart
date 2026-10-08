import {test, expect} from '@playwright/test';
import {mockCatalog, pantry} from './catalogMocks';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';

test('catalog prices use each configured symbol and load its icon', async ({page}) => {
  let currency = PICOMART_TEMPO_CONFIG.paymentTokens[0];
  await mockCatalog(page, {getProducts: () => pantry.products.map(product => ({
    ...product, PriceToken: currency.tokenId, Price: '1234567',
  }))});
  for (const token of PICOMART_TEMPO_CONFIG.paymentTokens) {
    currency = token;
    await page.goto(`/${pantry.catalogSeed}?n=moderato&currency=${token.id}`);
    await expect(page.getByTestId('product-price').first()).toHaveText(`1.234567 ${token.symbol}`);
    const icon = page.locator(`img[src="${token.img}"]`).first();
    await expect(icon).toHaveAttribute('alt', `Token ${token.name}`);
    await expect.poll(() => icon.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
});

test('existing promo seed/query URLs, catalog descriptor and about page still work', async ({page}, info) => {
  await mockCatalog(page);
  for (const url of [`/${pantry.catalogSeed}?n=moderato`, `/?seed=${pantry.catalogSeed}&network=moderato`]) {
    await page.goto(url);
    await expect(page.locator('.promo-catalogue')).toBeVisible();
    await expect(page.locator('#picomart-catalog-data')).toHaveAttribute('href', `https://sync.picomart.zkbytes.com/api/v1/moderato/catalogs/${pantry.catalogSeed}`);
    await expect(page.locator('.shop-root')).toHaveCount(0);
  }
  await page.screenshot({path: `output/playwright/promo-${info.project.name}.png`, fullPage: true});
  await page.goto('/about');
  await expect(page.locator('#picomart-ai-ordering')).toBeHidden();
});
