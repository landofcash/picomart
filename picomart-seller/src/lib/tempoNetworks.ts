import {PICOMART_TEMPO_CONFIG} from '@picomart/order-protocol/tempo';

/** QR profiles are stable. Mainnet stays unavailable until its full integration is verified. */
export const TEMPO_NETWORK_PROFILES = Object.freeze([
  Object.freeze({id:'moderato',label:'Testnet',qrProfile:'2',available:true,
    chainId:PICOMART_TEMPO_CONFIG.chainId,rpcUrl:PICOMART_TEMPO_CONFIG.rpcUrl,
    explorerUrl:PICOMART_TEMPO_CONFIG.explorerUrl,
    deployment:{address:'0x3c91183f0454eab6eff6f570ac402be278dbd6f4',block:37694566}}),
  Object.freeze({id:'mainnet',label:'Mainnet',qrProfile:'1',available:false,
    chainId:null,rpcUrl:null,explorerUrl:null,deployment:null}),
]);

export function tempoNetworkLabel(network:string):string {
  return TEMPO_NETWORK_PROFILES.find(profile=>profile.id===network)?.label??'Unsupported network';
}
