import {isPaymentCurrency} from '@picomart/config';
import {PICOMART_TEMPO_CONFIG} from '@picomart/config';
import {createHash} from 'crypto';
import {verifyMessage} from 'ethers';
import {tempoAddress} from './tempoIdentity';
import {parseTempoCatalog, parseTempoDeliveryOptions} from '@picomart/order-protocol/tempo-protocol';

export const CATALOG_CDN = PICOMART_TEMPO_CONFIG.services.catalogOrigin;
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export const CATALOG_LIMIT = 1_000_000;
export const PATH_USD = PICOMART_TEMPO_CONFIG.defaultPaymentToken.tokenId;
const deployment = PICOMART_TEMPO_CONFIG.deployment.address;
const storageHosts = new Set(['storage.bunnycdn.com', ...['uk','ny','la','sg','se','br','jh','syd'].map(r=>`${r}.storage.bunnycdn.com`)]);
export class CatalogInputError extends Error {}
export function storageConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.BUNNY_UPLOAD_ENABLED !== 'true') throw new CatalogInputError('Catalog uploads are disabled.');
  const endpoint = new URL(env.BUNNY_STORAGE_ENDPOINT || 'https://storage.bunnycdn.com');
  const zone = env.BUNNY_STORAGE_ZONE || '', key = env.BUNNY_STORAGE_ACCESS_KEY || '';
  if(endpoint.protocol !== 'https:' || !storageHosts.has(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password ||
    !['','/'].includes(endpoint.pathname) || endpoint.search || endpoint.hash || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(zone) || !key)
    throw new CatalogInputError('Catalog storage configuration is incomplete or invalid.');
  if((env.BUNNY_PUBLIC_BASE_URL || CATALOG_CDN).replace(/\/$/, '') !== CATALOG_CDN)
    throw new CatalogInputError('Use the configured Picomart catalog CDN.');
  return {baseUrl:`${endpoint.origin}/${zone}`,key,publicBase:CATALOG_CDN};
}
export const sha256 = (bytes: Uint8Array|string) => createHash('sha256').update(bytes).digest('hex');
export function uploadMessage(account:string,kind:'image'|'json'|'delivery',hash:string,expiresAt:number) {
  return `Picomart public catalog upload\nVersion: 1\nChain ID: ${PICOMART_TEMPO_CONFIG.chainId}\nContract: ${deployment}\nCDN: ${CATALOG_CDN}\nAccount: ${account}\nKind: ${kind}\nSHA256: ${hash}\nExpires at: ${expiresAt}`;
}
export function authorizeUpload(auth: Record<string,unknown>,kind:'image'|'json'|'delivery',hash:string,now=Date.now()) {
  try {
    const account=tempoAddress(String(auth.account)),expiry=Number(auth.expiresAt);
    if(!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+300_000||!/^0x[0-9a-f]{130}$/i.test(String(auth.signature)))throw new Error();
    if(verifyMessage(uploadMessage(account,kind,hash,expiry),String(auth.signature)).toLowerCase()!==account)throw new Error();
    return account;
  } catch {throw new CatalogInputError('Invalid or expired wallet upload signature.');}
}
export function imageType(bytes:Buffer) {
  if(bytes.length===0||bytes.length>IMAGE_LIMIT)throw new CatalogInputError('Images must be between 1 byte and 10 MiB.');
  if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return {extension:'png',mime:'image/png'};
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {extension:'jpg',mime:'image/jpeg'};
  if(['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString('ascii')))return {extension:'gif',mime:'image/gif'};
  if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return {extension:'webp',mime:'image/webp'};
  throw new CatalogInputError('Use a PNG, JPEG, GIF or WebP image.');
}
export function catalogBytes(content:unknown,account:string):Buffer {
  if(typeof content!=='string'||Buffer.byteLength(content)>CATALOG_LIMIT)throw new CatalogInputError('Catalog JSON exceeds its limit or is missing.');
  let catalog;try{catalog=parseTempoCatalog(JSON.parse(content));}catch(error){throw new CatalogInputError(error instanceof Error?error.message:'Invalid catalog JSON.');}
  const products=catalog.products;
  if(!new RegExp(`^${CATALOG_CDN.replaceAll('.','\\.')}/moderato/v1/${account}/delivery-options/[0-9a-f]{64}\\.json$`).test(catalog.deliveryOptionsUrl))throw new CatalogInputError('Delivery options must use this wallet’s published Picomart options.');
  const ids=new Set<string>();
  for(const p of products) {
    if(!p||typeof p!=='object'||Object.keys(p).sort().join(',')!=='Description,Image,Name,Price,PriceToken,ProductId'||
      typeof p.ProductId!=='string'||!p.ProductId||p.ProductId.length>100||ids.has(p.ProductId)||
      typeof p.Name!=='string'||!p.Name.trim()||p.Name.length>60||typeof p.Description!=='string'||p.Description.length>320||
      typeof p.Price!=='string'||!/^[1-9][0-9]{0,77}$/.test(p.Price)||BigInt(p.Price)>2n**256n-1n||!isPaymentCurrency(p.PriceToken)||typeof p.Image!=='string')
      throw new CatalogInputError('Invalid payment currency or product terms.');
    ids.add(p.ProductId);
    const imagePattern=new RegExp(`^${CATALOG_CDN.replaceAll('.','\\.')}/moderato/v1/${account}/images/[0-9a-f]{64}\\.(png|jpg|gif|webp)$`);
    if(!imagePattern.test(p.Image))throw new CatalogInputError('Product images must use this wallet’s published Picomart images.');
  }
  return Buffer.from(content,'utf8');
}
export function deliveryBytes(content:unknown):Buffer {
  if(typeof content!=='string'||Buffer.byteLength(content)>CATALOG_LIMIT)throw new CatalogInputError('Delivery JSON exceeds its limit or is missing.');
  try {const options=parseTempoDeliveryOptions(JSON.parse(content));if(!isPaymentCurrency(options.currency))throw new Error('Unsupported delivery currency.');}
  catch(error){throw new CatalogInputError(error instanceof Error?error.message:'Invalid delivery JSON.');}
  return Buffer.from(content,'utf8');
}
export function storagePath(account:string,kind:'image'|'json'|'delivery',hash:string,extension:string) {
  return `moderato/v1/${account}/${kind==='image'?'images':kind==='delivery'?'delivery-options':'catalogs'}/${hash}.${extension}`;
}
