import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',
  use: {baseURL: 'http://127.0.0.1:4173', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'retain-on-failure'},
  projects: [
    {name: 'desktop', testIgnore: /published\.spec\.ts/, use: {viewport: {width: 1440, height: 1000}}},
    {name: 'mobile', testMatch: /storefront\.spec\.ts/, use: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}},
    {name: 'published', testMatch: /published\.spec\.ts/, use: {baseURL: 'http://127.0.0.1:4174', viewport: {width: 390, height: 844}}},
  ],
  webServer: [
    {command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 90_000},
    {command: 'npm run build -- --base=/s/template/ --outDir=dist-storefront && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort --outDir=dist-storefront --base=/s/template/', url: 'http://127.0.0.1:4174/s/template/', reuseExistingServer: false, timeout: 120_000},
  ],
});
