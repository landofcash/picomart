import {test, expect} from '@playwright/test';
import {mockCatalog, pantry} from './catalogMocks';

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
