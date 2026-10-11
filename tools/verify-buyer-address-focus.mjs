// Run against an isolated buyer Vite server; wallet and payment recovery are mocked.
import {createRequire} from 'node:module';
import fixture from '../picomart-order-protocol/fixtures/tempo/agent-order-v2.json' with {type:'json'};
const browserRequire = createRequire(new URL('../picomart-storefront-template/package.json', import.meta.url));
const {chromium, expect} = browserRequire('@playwright/test');
const origin = process.argv[2] ?? 'http://127.0.0.1:5186';
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [];
  page.on('pageerror', error => {errors.push(error.message); console.error(error.message);});
  await page.route(origin + '/**', async route => {
    const {pathname} = new URL(route.request().url());
    if (['/order', '/pay-crypto'].includes(pathname)) return route.fulfill({contentType:'text/html', body:`
      <meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>
      <script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
        window.__vite_plugin_react_preamble_installed__=true;
      </script><script type="module" src="/src/testFixtures/addressFocusHarness.tsx"></script>`});
    if (pathname === '/src/context/WalletContext.tsx') return route.fulfill({contentType:'application/javascript', body:`
      export const useWallet=()=>({walletAddress:'0x'+'11'.repeat(20),walletAdapter:{},walletLocked:false,network:'moderato'});
    `});
    if (pathname === '/src/lib/tempoMarket.ts') return route.fulfill({contentType:'application/javascript', body:`
      const options=${JSON.stringify(fixture.deliveryOptions)};
      export const TEMPO_MARKET_ENABLED=true;
      export const validateSelection=s=>({subtotal:1250000n,amount:1750000n});
      export const selectionHash=s=>JSON.stringify(s);
      export const checkoutInputHash=(s,d)=>JSON.stringify([s,d]);
      export const fetchCatalogDocument=async()=>({deliveryOptionsUrl:${JSON.stringify(fixture.catalog.deliveryOptionsUrl)},deliveryOptions:options});
      export const checkoutIntent=async()=>{window.intentChecks=(window.intentChecks??0)+1;return 'test-intent';};
      export const loadCheckout=async()=>{window.recoveryChecks=(window.recoveryChecks??0)+1;await new Promise(r=>setTimeout(r,100));return null;};
      export const marketTransactions={recoverOperation:async()=>null};
      export const validateCheckoutDraft=()=>{};
      export const commerceService=()=>({});
      export const prepareCheckout=()=>{throw new Error('No payment preparation expected');};
      export const previewPreparedMessage=()=>{},checkoutCall=()=>{},submitCheckout=()=>{},submitBuiltinCheckout=()=>{};
    `});
    return route.continue();
  });
  await page.addInitScript(({catalog}) => {
    sessionStorage.setItem('picomart_tempo_public_checkout_selection_v1', JSON.stringify({
      catalog:{catalogId:'mock',seed:'AQEBAQEBAQEBAQEBAQEBAQ',seller:'0x'+'22'.repeat(20),catalogUrl:catalog.deliveryOptionsUrl.replace(/delivery-options\/[^/]+$/, 'catalogs/'+'aa'.repeat(32)+'.json')},
      products:catalog.products.map(p=>({...p,quantity:1})),
    }));
  }, fixture);
  await page.goto(origin + '/order');
  await page.getByRole('radio', {name:'Delivery to your address',exact:true}).click();
  await page.getByRole('radio', {name:/Standard delivery/}).click();
  const fields = [
    ['fullName','Test Buyer'], ['address','123 Test Street'], ['city','Lisbon'],
    ['postalCode','1000-001'], ['country','Portugal'], ['phone','123456789'],
    ['email','buyer@example.com'], ['deliveryComments','Ring the bell'],
  ];
  for (const [id, value] of fields) {
    const input = page.locator('#' + id);
    await input.click();
    for (const char of value) {
      await page.keyboard.type(char);
      await expect(input).toBeFocused();
      await expect(input).toBeEnabled();
    }
    await expect(input).toHaveValue(value);
  }
  expect(await page.evaluate(()=>window.intentChecks??0)).toBe(0);
  expect(await page.evaluate(()=>window.recoveryChecks??0)).toBe(0);
  await page.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await expect(page).toHaveURL(origin + '/pay-crypto');
  await expect(page.getByRole('button',{name:'Prepare your order',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>window.intentChecks)).toBe(1);
  expect(await page.evaluate(()=>window.recoveryChecks)).toBe(1);
  expect(errors).toEqual([]);
  console.log('Buyer address focus passed: all recipient fields retain focus per character; zero recovery checks during address entry; recovery starts on the payment page. Wallet and recovery mocked; no transactions submitted.');
} finally {
  await browser.close();
}
