import {getConfig,getCurrentConfig} from '@/config';
import type {NetworkId} from '@/context/wallet/types';
export async function isApprovedShopWallet(address:string,network?:NetworkId){
  if(!/^0x[0-9a-f]{40}$/i.test(address)||address.toLowerCase()==='0x'+'0'.repeat(40))return false;
  return (network?getConfig(network):getCurrentConfig()).approvedShopWallets.some(a=>a.toLowerCase()===address.toLowerCase());
}
