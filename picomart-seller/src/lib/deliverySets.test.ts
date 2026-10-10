import {beforeEach,describe,it,expect,vi} from 'vitest';
import {Wallet,getBytes} from 'ethers';
import {newDeliverySet,parseDeliverySets,publishedDeliverySet,saveDeliverySets,loadDeliverySets,backupDeliverySets,restoreDeliverySets} from './deliverySets';
import type {WalletAdapter} from '@/context/wallet/types';
const state=vi.hoisted(()=>({upload:vi.fn(),download:vi.fn(),revision:1}));
vi.mock('./internalWallet/tempoRecoveryProof',()=>({configuredProofClient:()=>({upload:state.upload,download:state.download})}));
vi.mock('./internalWallet/providers/tempoInternalWalletProvider',()=>({tempoWalletRevision:()=>state.revision,assertTempoWalletRevision:(revision:number)=>{if(revision!==state.revision)throw new Error('Wallet changed');}}));
const currency='0x20c0000000000000000000000000000000000000';
const key=new Wallet('0x'+'11'.repeat(32)); // Public synthetic test key.
const wallet={chain:'tempo',getNetwork:async()=> 'moderato',getAddress:async()=>key.address.toLowerCase(),signMessage:async(message:string)=>getBytes(await key.signMessage(message))} as WalletAdapter;
beforeEach(()=>{vi.clearAllMocks();state.revision=1;const storage=new Map();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});vi.stubGlobal('window',{dispatchEvent:vi.fn()});});
describe('reusable seller delivery sets',()=>{
 it('saves local sets and freezes a confirmed catalogue copy independently of later edits',()=>{
  const set=newDeliverySet(currency,'digital'),confirmed=publishedDeliverySet(set);saveDeliverySets([set]);
  const restored=loadDeliverySets();restored[0].options.methods[3].name='Updated digital delivery';
  expect(confirmed.methods[0].name).toBe('Digital delivery');expect(publishedDeliverySet(loadDeliverySets()[0]).methods[0].name).toBe(confirmed.methods[0].name);
  expect(()=>parseDeliverySets([set,set])).toThrow();
 });
 it('rejects empty active configurations and malformed disabled method data',()=>{
  const set=newDeliverySet(currency,'digital');set.disabledTypes=['customer-address','shop-pickup','pickup-box','digital'];expect(()=>publishedDeliverySet(set)).toThrow();
  const bad=newDeliverySet(currency,'digital');(bad.options.methods[0] as {name:string}).name='';expect(()=>parseDeliverySets([bad])).toThrow();
 });
 it('encrypts a backup and restores its exact sets with the same wallet',async()=>{
  const set=newDeliverySet(currency,'digital');let encrypted:unknown;state.upload.mockImplementation(async(item:unknown)=>{encrypted=item;return {accepted:true};});state.download.mockImplementation(async()=>encrypted);
  const code=await backupDeliverySets(wallet,[set]);expect(JSON.stringify(encrypted)).not.toContain('Digital only');
  expect(await restoreDeliverySets(wallet,code)).toEqual([set]);expect(loadDeliverySets()).toEqual([set]);
  const other=new Wallet('0x'+'22'.repeat(32)),foreign={...wallet,getAddress:async()=>other.address.toLowerCase(),signMessage:async(message:string)=>getBytes(await other.signMessage(message))};
  await expect(restoreDeliverySets(foreign,code)).rejects.toThrow('another wallet');
 });
 it('makes the restore code available before an uncertain upload result',async()=>{
  state.upload.mockRejectedValue(new Error('Network interrupted'));const prepared=vi.fn();
  await expect(backupDeliverySets(wallet,[newDeliverySet(currency,'digital')],prepared)).rejects.toThrow('Network interrupted');expect(prepared).toHaveBeenCalledOnce();expect(prepared.mock.calls[0][0]).toMatch(/^[a-z2-7]{26}$/);
 });
});
