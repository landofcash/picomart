import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {StorefrontConfigSchema} from '../../../picomart-storefront-template/src/lib/shop/schema.ts';
import {ProductCatalogueSchema} from '../../../picomart-storefront-template/src/lib/productSchemas.ts';
import {TEMPLATE_ROOT} from './config.ts';
import type {FileSet} from './files.ts';

const InputSchema=z.object({config:StorefrontConfigSchema,products:z.array(z.object({Price:z.string().regex(/^[0-9]+$/)}).passthrough()).min(1).max(1000),brief:z.string().trim().min(10).max(12000)}).strict();
export function parseInput(value:unknown) {
  const input=InputSchema.parse(value);
  const products=ProductCatalogueSchema.parse(input.products.map(p=>({...p,Price:BigInt(p.Price)})));
  if(new Set(products.map(p=>p.ProductId)).size!==products.length) throw new Error('Duplicate catalog products');
  return {...input,products:products.map(p=>({...p,Price:p.Price.toString()}))};
}
export type GenerationInput=ReturnType<typeof parseInput>;
export async function readInput(file?:string,fixture?:string):Promise<GenerationInput> {
  if(file && fixture) throw new Error('Choose --input or --fixture');
  if(file) {if((await fs.stat(file)).size>2*1024*1024) throw new Error('Generation input exceeds 2 MiB');return parseInput(JSON.parse(await fs.readFile(file,'utf8')));}
  if(fixture==='pantry') {
    const catalog=JSON.parse(await fs.readFile(path.join(TEMPLATE_ROOT,'template/fixtures/pantry.json'),'utf8'));
    const config=JSON.parse(await fs.readFile(path.join(TEMPLATE_ROOT,'public/storefront.json'),'utf8'));
    return parseInput({config,products:catalog.products,brief:'Create a warm independent Portuguese pantry shop. Use terracotta and cream, generous serif headlines, an inviting editorial hero and product discovery. Change the homepage composition visibly. Keep all product facts and prices live, and all required browsing and purchase handoff behavior.'});
  }
  if(fixture==='studio') {
    const catalog=JSON.parse(await fs.readFile(path.join(TEMPLATE_ROOT,'template/fixtures/studio.json'),'utf8'));
    return parseInput({...catalog,brief:'Create a minimal contemporary clothing studio shop. Use sharp black and white typography, cool grey surfaces, asymmetric homepage composition and strong product imagery. Make this visibly different from a traditional pantry store. Preserve accessible browsing and purchase handoff behavior. Do not invent sizes or variants.'});
  }
  throw new Error('Pass --input <JSON file> or --fixture pantry|studio. Fixtures use mocked catalog data in browser checks.');
}
export function configureSource(source:FileSet,input:GenerationInput):FileSet {
  const configured=new Map(source);
  configured.set('public/storefront.json',Buffer.from(JSON.stringify(input.config,null,2)+'\n'));
  return configured;
}
