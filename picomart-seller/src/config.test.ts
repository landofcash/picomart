import {describe, expect, it} from 'vitest'
import {getAvailableNetworkIds, getConfig, getCurrentConfig, isAdminWalletAddress} from './config'

describe('Tempo network configuration', () => {
  it('keeps the verified deployment, admin and configured payment currencies', () => {
    const config = getCurrentConfig()
    expect(config.name).toBe('moderato')
    expect(config.account).toBe('0x3c91183f0454eab6eff6f570ac402be278dbd6f4')
    expect(config.adminWalletAddress).toBe('0xa7965ff717af7a9689930bf8b438080e1d7ffaca')
    expect(config.apiUrl.endsWith('/api/v1/moderato')).toBe(true)
    expect(config.supportedTokens).toHaveLength(4)
    expect(config.supportedTokens[0]).toMatchObject({
      name: 'PathUSD', decimals: 6,
      tokenId: '0x20c0000000000000000000000000000000000000',
      img: '/tokens/0-icon.png',
    })
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
      expect(isAdminWalletAddress(getCurrentConfig().adminWalletAddress, network)).toBe(false)
    },
  )

  it('matches the configured admin by address only on the configured network', () => {
    expect(isAdminWalletAddress(getCurrentConfig().adminWalletAddress.toUpperCase(), 'moderato')).toBe(true)
    expect(isAdminWalletAddress('0xc295fd4dcef05cd7ea3923c7ff47e58ed64f9ace', 'moderato')).toBe(false)
    expect(isAdminWalletAddress(null, 'moderato')).toBe(false)
  })
})
