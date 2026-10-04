// Run against an isolated seller Vite server. Wallet and storage are mocked;
// the actual catalog editor and unlock dialog are rendered. No upload is sent.
import {createRequire} from 'node:module';
import {sellerMarketMock} from './fixtures/seller-market.mjs';
const browserRequire=createRequire(new URL('../picomart-storefront-template/package.json',import.meta.url));
const {chromium,expect}=browserRequire('@playwright/test');
const origin=process.argv[2]??'http://127.0.0.1:5187';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL});
try {
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route(origin+'/src/context/WalletContext.tsx',route=>route.fulfill({contentType:'application/javascript',body:`
    import React from '/node_modules/.vite/deps/react.js';
    import UnlockDialog from '/src/components/wallet/InternalWalletUnlockDialog.tsx';
    let locked=true,request=null,resolveSign=null,rejectSign=null,address='0x'+'11'.repeat(20),sequence=0;
    const notify=()=>{sequence++;window.dispatchEvent(new Event('catalog-wallet-change'));};
    const subscribe=fn=>{window.addEventListener('catalog-wallet-change',fn);return()=>window.removeEventListener('catalog-wallet-change',fn);};
    const useUpdates=()=>React.useSyncExternalStore(subscribe,()=>sequence);
    window.catalogWallet={unlock:()=>{locked=false;notify();},changeAddress:()=>{address='0x'+'22'.repeat(20);notify();},lock:()=>{locked=true;notify();}};
    const adapter={chain:'tempo',getAddress:async()=>address,getNetwork:async()=>'moderato',signMessage:async()=>{
      request={walletId:'mock',walletLabel:'Disposable mock wallet',reason:'sign-message',reasonLabel:'Unlock Tempo wallet',network:'moderato'};
      const promise=new Promise((resolve,reject)=>{resolveSign=resolve;rejectSign=reject;});notify();return promise;
    }};
    export function WalletProvider({children}){useUpdates();return React.createElement(React.Fragment,null,children,React.createElement(UnlockDialog,{open:Boolean(request),request,busy:false,error:null,onCancel:()=>{request=null;rejectSign(new Error('Wallet unlock was cancelled.'));notify();},onConfirm:()=>{locked=false;request=null;notify();resolveSign(new Uint8Array([1]));}}));}
    export function useWallet(){useUpdates();return{network:'moderato',walletAddress:address,walletAdapter:adapter,walletKind:'internal',walletIdentity:{evmAddress:address},walletLocked:locked,walletCanTransact:!locked,walletActionPending:Boolean(request),walletActionLabel:'Sign public catalog upload',internalWallets:[],walletBalances:[],availableExternalProviders:[],refreshActiveInternalWallet:async()=>{},refreshInternalWallets:async()=>{}};}
  `}));
  await context.route(origin+'/src/lib/catalogStorage.ts',route=>route.fulfill({contentType:'application/javascript',body:`
    export const validateImage=()=>{},pathUsdPrice=value=>String(Math.round(Number(value)*1000000));
    export async function uploadCatalog(wallet,api,products,signal){
      await wallet.signMessage('Mock public catalog upload');
      await new Promise(resolve=>setTimeout(resolve,100));
      signal.throwIfAborted();
      window.catalogUploadWrites=(window.catalogUploadWrites??0)+1;
      return {url:'https://cdn.picomart.zkbytes.com/mock-catalog.json',products};
    }
  `}));
  await page.goto(origin+'/edit-product-catalogue',{waitUntil:'domcontentloaded'});
  const publish=page.getByRole('button',{name:'Publish Catalog',exact:true});
  const prepareDraft=async()=>{
  await page.getByRole('button',{name:'Confirm Token & Continue',exact:true}).click();
  await expect(publish).toBeDisabled();
  await page.getByRole('button',{name:'Add New Product',exact:true}).click();
  await page.getByLabel('Product Name',{exact:true}).fill('Mock product');
  await page.getByLabel('Price (PathUSD)',{exact:true}).fill('1');
  await page.locator('input[type=file]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Add Product',exact:true}).click();
  };
  await prepareDraft();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByRole('heading',{name:'Disposable mock wallet',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(publish).toBeEnabled();
  expect(await page.evaluate(()=>window.catalogUploadWrites??0)).toBe(0);
  await expect(page.getByRole('heading',{name:'Catalog Uploaded',exact:true})).toHaveCount(0);
  await publish.click();
  await page.getByLabel('Passphrase',{exact:true}).fill('mock-passphrase');
  await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Catalog Uploaded',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.catalogUploadWrites)).toBe(1);

  for(const race of ['changeAddress','lock']) {
    await page.reload({waitUntil:'domcontentloaded'});
    await prepareDraft();
    if(race==='lock')await page.evaluate(()=>window.catalogWallet.unlock());
    await publish.click();
    await expect(page.getByRole('heading',{name:'Disposable mock wallet',exact:true})).toBeVisible();
    await page.evaluate(race=>window.catalogWallet[race](),race);
    await page.getByLabel('Passphrase',{exact:true}).fill('mock-passphrase');
    await page.getByRole('button',{name:'Unlock',exact:true}).click();
    await expect(page.getByRole('status',{exact:true}).filter({hasText:'Upload not completed.'})).toBeVisible();
    expect(await page.evaluate(()=>window.catalogUploadWrites??0)).toBe(0);
    await expect(page.getByRole('heading',{name:'Catalog Uploaded',exact:true})).toHaveCount(0);
  }

  let marketMock=sellerMarketMock('BAQEBAQEBAQEBAQEBAQEBA','AwMDAwMDAwMDAwMDAwMDAw');
  marketMock=marketMock.replace("receivingIdentity:async()=>({publicKey:btoa(String.fromCharCode(...new Uint8Array(32))),identityId:'0x'+'55'.repeat(32)})","receivingIdentity:async wallet=>{await wallet.signMessage('Mock catalog receiving identity');return {publicKey:btoa(String.fromCharCode(...new Uint8Array(32).fill(1))),identityId:'0x'+'55'.repeat(32)};}");
  await context.route(origin+'/src/lib/tempoMarket.ts',route=>route.fulfill({contentType:'application/javascript',body:marketMock}));
  const loadCatalog=async()=>{
    await page.goto(origin+'/add-product-catalogue',{waitUntil:'domcontentloaded'});
    await page.getByRole('textbox',{name:'Catalog URL',exact:true}).fill('https://catalog.test/catalog.json');
    await page.getByRole('button',{name:'Fetch & Review Catalog',exact:true}).click();
    await expect(page.getByText('Preview (1 products)',{exact:true})).toBeVisible();
  };
  await loadCatalog();
  const signSeed=page.getByRole('button',{name:'Sign Seed',exact:true});
  await expect(signSeed).toBeEnabled();
  await signSeed.click();
  await expect(page.getByRole('heading',{name:'Disposable mock wallet',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(signSeed).toBeEnabled();
  await expect(page.getByRole('button',{name:'Submit to Picomart',exact:true})).toBeDisabled();
  await signSeed.click();
  await page.getByLabel('Passphrase',{exact:true}).fill('mock-passphrase');
  await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await expect(page.getByRole('button',{name:'Signed',exact:true})).toBeVisible();
  await expect(page.getByText('Preview (1 products)',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Submit to Picomart',exact:true}).click();
  await page.getByRole('dialog',{name:'Confirm Catalog Submission',exact:true}).getByRole('button',{name:'Confirm & Submit',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Catalog Published Successfully',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.catalogCallArgs.length)).toBe(3);
  for(const race of ['changeAddress','lock']) {
    await loadCatalog();
    if(race==='lock')await page.evaluate(()=>window.catalogWallet.unlock());
    await signSeed.click();
    await expect(page.getByRole('heading',{name:'Disposable mock wallet',exact:true})).toBeVisible();
    await page.evaluate(race=>window.catalogWallet[race](),race);
    await page.getByLabel('Passphrase',{exact:true}).fill('mock-passphrase');
    await page.getByRole('button',{name:'Unlock',exact:true}).click();
    await expect(page.getByRole('button',{name:'Fetch & Review Catalog',exact:true})).toBeEnabled();
    await expect(page.getByRole('button',{name:'Signed',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Submit to Picomart',exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>window.contractCalls??[])).toEqual([]);
  }
  expect(errors).toEqual([]);
  console.log('Locked-wallet catalog publication passed: disabled with no products; enabled with products; unlock cancellation writes nothing; successful unlock continues; wallet changes and explicit locking still abort. Sign Seed also unlocks, preserves preview, submits three ABI arguments and rejects stale preparation. Wallet/storage mocked.');
} finally {await browser.close();}
