import {describe, expect, it} from 'vitest'

import {getAvailableNetworkIds, getConfig, getCurrentConfig,TEMPO_NETWORK_PROFILES} from './config'

describe('Tempo network configuration', () => {
  it('reserves the mainnet profile without enabling an unconfigured deployment',()=>{
    expect(TEMPO_NETWORK_PROFILES.find(profile=>profile.id==='mainnet')).toMatchObject({qrProfile:'1',available:false,chainId:null,deployment:null});
    expect(TEMPO_NETWORK_PROFILES.find(profile=>profile.id==='moderato')).toMatchObject({qrProfile:'2',available:true});
  });
  it('keeps the verified deployment and configured payment currencies', () => {
    const config = getCurrentConfig()
    expect(config.name).toBe('moderato')
    expect(config.contractAddress).toBe('0x3c91183f0454eab6eff6f570ac402be278dbd6f4')
    expect(config.apiUrl.endsWith('/api/v1/moderato')).toBe(true)
    expect(config.supportedTokens).toHaveLength(4)
    expect(config.supportedTokens[0]).toMatchObject({
      name: 'PathUSD', decimals: 6,
      tokenId: '0x20c0000000000000000000000000000000000000',
      img: '/tokens/0-icon.png',
    })
    expect(config.trustedPicomartProfile).toBeUndefined()
  })

  it('offers only configured Tempo networks and returns a fresh list', () => {
    const networks = getAvailableNetworkIds()
    expect(networks).toEqual(['moderato'])
    networks.push('testnet')
    expect(getAvailableNetworkIds()).toEqual(['moderato'])
  })

  it.each(['testnet', 'mainnet', 'previewnet', 'local', '', '__proto__', 'toString'])(
    'rejects unsupported network %j without selecting a fallback', network => {
      expect(() => getConfig(network)).toThrow('Unsupported network:')
    },
  )
})
