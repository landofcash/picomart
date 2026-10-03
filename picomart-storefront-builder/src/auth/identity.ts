import type {Config,Network} from '../config.ts';
import {AccountId} from '../domain/records.ts';
import {ApiError} from '../domain/errors.ts';
import {readOwnedCatalog} from '../tempo.ts';
export interface AccountIdentity {accountId:string;signerAddress:string;}
export interface IdentityProvider {account(network:Network,accountId:string):Promise<AccountIdentity>;assertCatalogOwner(network:Network,catalogSeed:string,ownerAccountId:string):Promise<void>;}
export class PicomartIdentity implements IdentityProvider {
  #config:Config;#fetch:typeof fetch;
  constructor(config:Config,transport:typeof fetch=fetch){this.#config=config;this.#fetch=transport;}
  async account(network:Network,accountId:string):Promise<AccountIdentity>{
    if(network!=='moderato'||!this.#config.networks.has(network))throw new ApiError(400,'unsupported_network');
    const parsed=AccountId.safeParse(accountId);if(!parsed.success)throw new ApiError(403,'unsupported_or_inactive_account');
    // The challenge signature proves control of this EVM address; no alias/key lookup.
    return {accountId:parsed.data,signerAddress:parsed.data};
  }
  async assertCatalogOwner(network:Network,catalogSeed:string,ownerAccountId:string){
    await this.account(network,ownerAccountId);await readOwnedCatalog(this.#config,catalogSeed,ownerAccountId,this.#fetch);
  }
}
