import {AGENT_CHAIN_ID,AGENT_CONTRACT,AGENT_NETWORK,AgentProfileSchema,type AgentProfile} from '@picomart/order-protocol/tempo-agent';

export const agentProfileStorageKey='picomart_tempo_agent_trust_v2';
export const agentProfileChangedEvent='picomart:tempo-agent-trust-changed';
export function defaultAgentProfileInput(){
  const origin=import.meta.env.VITE_PICOMART_X402_ORIGIN||'https://x402.picomart.zkbytes.com';
  const keys=JSON.parse(import.meta.env.VITE_PICOMART_QUOTE_PUBLIC_KEYS||'{}') as Record<string,string>;
  return {version:2,profileId:'picomart-tempo-agent-v2',quoteOrigin:origin,resourceOrigin:origin,
    network:AGENT_NETWORK,chainId:AGENT_CHAIN_ID,contractAddress:AGENT_CONTRACT,
    trustedQuoteKeys:Object.entries(keys).map(([kid,publicKey])=>({kid,publicKey}))};
}
export function installedAgentProfile():AgentProfile{
  const saved=typeof localStorage==='undefined'?null:localStorage.getItem(agentProfileStorageKey);
  return AgentProfileSchema.parse(saved?JSON.parse(saved):defaultAgentProfileInput());
}
export function agentProfileEditorInput():unknown{
  const saved=localStorage.getItem(agentProfileStorageKey);
  return saved?JSON.parse(saved):defaultAgentProfileInput();
}
export function agentProfileFingerprint(profile:AgentProfile):string{
  const parsed=AgentProfileSchema.parse(profile);
  return JSON.stringify({...parsed,trustedQuoteKeys:[...parsed.trustedQuoteKeys].sort((a,b)=>a.kid.localeCompare(b.kid))});
}
export function assertCurrentAgentProfile(profile:AgentProfile):void{
  if(agentProfileFingerprint(profile)!==agentProfileFingerprint(installedAgentProfile()))throw new Error('Trust settings changed. Request a new approval link.');
}
export function saveAgentProfile(input:unknown):AgentProfile{
  const parsed=AgentProfileSchema.parse(input);localStorage.setItem(agentProfileStorageKey,JSON.stringify(parsed));
  window.dispatchEvent(new Event(agentProfileChangedEvent));return parsed;
}
export function resetAgentProfile():void{
  localStorage.removeItem(agentProfileStorageKey);window.dispatchEvent(new Event(agentProfileChangedEvent));
}
