import {beforeEach,expect,it,vi} from 'vitest';
import fixture from '@picomart/order-protocol/fixtures/tempo/agent-order-v2.json';
import {AgentProfileSchema} from '@picomart/order-protocol/tempo-agent';
import {agentProfileChangedEvent,agentProfileFingerprint,agentProfileStorageKey,assertCurrentAgentProfile,
  installedAgentProfile,resetAgentProfile,saveAgentProfile} from './tempoAgentProfile';
const profile=AgentProfileSchema.parse(fixture.profile);
beforeEach(()=>{
  const values=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  vi.stubGlobal('window',new EventTarget());
});
it('saves public runtime settings, emits invalidation and reads them instead of deployment defaults',()=>{
  const changed=vi.fn();window.addEventListener(agentProfileChangedEvent,changed);
  saveAgentProfile(profile);expect(installedAgentProfile()).toEqual(profile);expect(changed).toHaveBeenCalledOnce();
});
it('rejects invalid origins, duplicate keys and a different network or deployment before modifying trust',()=>{
  saveAgentProfile(profile);
  for(const bad of [{...profile,quoteOrigin:'http://untrusted.example'}, {...profile,trustedQuoteKeys:[...profile.trustedQuoteKeys,...profile.trustedQuoteKeys]},
    {...profile,chainId:1},{...profile,contractAddress:'0x'+'11'.repeat(20)}])expect(()=>saveAgentProfile(bad)).toThrow();
  expect(installedAgentProfile()).toEqual(profile);
});
it('blocks an already verified intent after its trusted origins change',()=>{
  saveAgentProfile(profile);assertCurrentAgentProfile(profile);
  saveAgentProfile({...profile,quoteOrigin:'https://another.example'});
  expect(()=>assertCurrentAgentProfile(profile)).toThrow('Trust settings changed');
});
it('never silently falls back to defaults for a damaged runtime profile',()=>{
  localStorage.setItem(agentProfileStorageKey,'broken');expect(()=>installedAgentProfile()).toThrow();
  resetAgentProfile();expect(localStorage.getItem(agentProfileStorageKey)).toBeNull();
});
it('treats key ordering as the same trust configuration',()=>{
  const additional={kid:'second',publicKey:profile.trustedQuoteKeys[0].publicKey};
  const one={...profile,trustedQuoteKeys:[...profile.trustedQuoteKeys,additional]};
  expect(agentProfileFingerprint(one)).toBe(agentProfileFingerprint({...one,trustedQuoteKeys:[...one.trustedQuoteKeys].reverse()}));
});
