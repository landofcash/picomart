// Public application configuration only. Never load environment secrets here.
const source = require('./picomart.json');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value) && !/^0x0{40}$/.test(value);
function validateConfig(value) {
  const fail = message => { throw new Error(`Picomart configuration: ${message}`); };
  const url = (input, label) => {
    try {
      const parsed = new URL(input);
      if (parsed.username || parsed.password || !['https:', 'http:'].includes(parsed.protocol) ||
          (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) throw Error();
    } catch { fail(`${label} must be an HTTPS URL (HTTP is allowed locally).`); }
  };
  if (!value?.networks || !own(value.networks, value.defaultNetwork)) fail('defaultNetwork must identify a configured network.');
  url(value.app?.buyerUrl, 'Buyer URL'); url(value.app?.sellerUrl, 'Seller URL');
  const profiles = new Set(), chains = new Set();
  for (const [id, network] of Object.entries(value.networks)) {
    if (typeof network.enabled !== 'boolean' || !network.label || !network.modeLabel) fail(`${id} needs labels and an enabled flag.`);
    if (!/^[12]$/.test(network.qrProfile) || profiles.has(network.qrProfile)) fail(`${id} has an invalid or duplicate QR profile.`);
    profiles.add(network.qrProfile);
    if (!network.enabled) continue; // Disabled networks can be explicit, incomplete placeholders.
    if (!Number.isSafeInteger(network.chainId) || network.chainId <= 0 || chains.has(network.chainId)) fail(`${id} needs a unique positive chain ID.`);
    chains.add(network.chainId);
    url(network.rpcUrl, `${id} RPC`); url(network.explorerUrl, `${id} explorer`);
    if (!address(network.contract?.address) || !Number.isSafeInteger(network.contract?.deploymentBlock) || network.contract.deploymentBlock < 0) fail(`${id} needs a contract address and deployment block.`);
    if (!address(network.adminAddress)) fail(`${id} needs an admin address.`);
    for (const key of ['syncOrigin', 'catalogOrigin', 'x402Origin', 'builderOrigin']) url(network.services?.[key], `${id} ${key}`);
    for (const key of ['syncPath', 'agentPath']) if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(network.services?.[key] ?? '')) fail(`${id} needs ${key}.`);
    const addresses = new Set(), ids = new Set();
    for (const [key, currency] of Object.entries(network.currencies ?? {})) {
      if (!address(currency.address) || addresses.has(currency.address)) fail(`${id}/${key} has an invalid or duplicate currency address.`);
      if (!Number.isSafeInteger(currency.id) || currency.id < 0 || ids.has(currency.id)) fail(`${id}/${key} needs a unique presentation ID.`);
      addresses.add(currency.address); ids.add(currency.id);
      if (!currency.name || !currency.symbol || !Number.isInteger(currency.decimals) || currency.decimals < 0 || currency.decimals > 255) fail(`${id}/${key} has invalid metadata.`);
      if (typeof currency.accountEnabled !== 'boolean' || typeof currency.checkoutEnabled !== 'boolean') fail(`${id}/${key} needs explicit account/checkout flags.`);
      if (currency.checkoutEnabled && (!currency.accountEnabled || currency.decimals !== 6)) fail(`${id}/${key}: checkout requires account support and six decimals.`);
      if (typeof currency.icon !== 'string' || !currency.icon) fail(`${id}/${key} needs an icon.`);
      if (!currency.icon.startsWith('/') || currency.icon.startsWith('//')) url(currency.icon, `${id}/${key} icon`);
    }
    for (const [field, capability] of [['defaultPaymentCurrency', 'checkoutEnabled'], ['defaultFeeCurrency', 'accountEnabled']]) {
      const key = network[field];
      if (!own(network.currencies, key) || !network.currencies[key][capability]) fail(`${id}/${field} must reference an enabled currency.`);
    }
    if (network.currencies[network.defaultFeeCurrency].decimals !== 6) fail(`${id}: fee currency must use six decimals.`);
  }
  if (!value.networks[value.defaultNetwork].enabled) fail('defaultNetwork must be enabled.');
  return value;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const PICOMART_CONFIG = freeze(validateConfig(source));
function getNetworkConfig(id = PICOMART_CONFIG.defaultNetwork) {
  if (!own(PICOMART_CONFIG.networks, id)) throw new Error(`Unknown Picomart network: ${id}`);
  const config = PICOMART_CONFIG.networks[id];
  if (!config.enabled) throw new Error(`${config.label} is not enabled.`);
  return config;
}
function getTempoConfig(id = PICOMART_CONFIG.defaultNetwork) {
  const network = getNetworkConfig(id);
  const currencies = Object.entries(network.currencies).map(([key, c]) => ({...c, key, tokenId: c.address, img: c.icon}));
  return freeze({network: id, chainId: network.chainId, rpcUrl: network.rpcUrl, explorerUrl: network.explorerUrl,
    label: network.label, mainnetEnabled: Boolean(PICOMART_CONFIG.networks.mainnet?.enabled),
    deployment: {address: network.contract.address, block: network.contract.deploymentBlock},
    tokens: currencies.filter(c => c.accountEnabled), paymentTokens: currencies.filter(c => c.checkoutEnabled),
    defaultPaymentToken: currencies.find(c => c.key === network.defaultPaymentCurrency),
    feeToken: currencies.find(c => c.key === network.defaultFeeCurrency), services: network.services, adminAddress: network.adminAddress});
}
function assertTempoChainId(chainId, expected = getTempoConfig().chainId) {
  if (BigInt(chainId) !== BigInt(expected)) throw new Error(`Unsupported Tempo chain ${chainId}; expected ${expected}.`);
}
function getAgentConfig(id = PICOMART_CONFIG.defaultNetwork) {
  const n = getTempoConfig(id);
  return {chainId: n.chainId, contractAddress: n.deployment.address, paymentTokens: n.paymentTokens,
    defaultPaymentToken: n.defaultPaymentToken.tokenId, apiPath: n.services.agentPath};
}
exports.PICOMART_CONFIG = PICOMART_CONFIG;
exports.getNetworkConfig = getNetworkConfig;
exports.getTempoConfig = getTempoConfig;
exports.getAgentConfig = getAgentConfig;
exports.assertTempoChainId = assertTempoChainId;
exports.validateConfig = validateConfig;
exports.PICOMART_TEMPO_CONFIG = getTempoConfig();
exports.COMPACT_LINK_CONFIG = freeze({origin: PICOMART_CONFIG.app.buyerUrl, network: PICOMART_CONFIG.defaultNetwork,
  profiles: Object.fromEntries(Object.entries(PICOMART_CONFIG.networks).filter(([, n]) => n.enabled).map(([id, n]) => [n.qrProfile, id]))});
exports.TEMPO_NETWORK_PROFILES = freeze(Object.entries(PICOMART_CONFIG.networks).map(([id, n]) => ({id, label: n.modeLabel, badge: n.label,
  qrProfile: n.qrProfile, available: n.enabled, chainId: n.chainId, rpcUrl: n.rpcUrl, explorerUrl: n.explorerUrl,
  deployment: n.contract ? {address: n.contract.address, block: n.contract.deploymentBlock} : null})));

exports.isPaymentCurrency = (token, network) => typeof token === 'string' && getTempoConfig(network).paymentTokens.some(c => c.tokenId === token.toLowerCase());
exports.getCurrency = (token, network) => {
  const currency = getTempoConfig(network).tokens.find(c => c.tokenId === String(token).toLowerCase());
  if (!currency) throw new Error('Unsupported account currency.');
  return currency;
};
