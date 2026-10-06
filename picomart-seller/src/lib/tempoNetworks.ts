import {TEMPO_NETWORK_PROFILES} from '@picomart/config';
export {TEMPO_NETWORK_PROFILES};
export function tempoNetworkLabel(network:string):string {
  return TEMPO_NETWORK_PROFILES.find(profile=>profile.id===network)?.label??'Unsupported network';
}
