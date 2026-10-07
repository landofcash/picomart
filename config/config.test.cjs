const {test} = require('node:test');
const assert = require('node:assert/strict');
const {PICOMART_CONFIG, getTempoConfig, getNetworkConfig, validateConfig, COMPACT_LINK_CONFIG, isPaymentCurrency, getAgentConfig} = require('./schema.cjs');
const copy = () => structuredClone(PICOMART_CONFIG);
test('network settings and named defaults do not depend on currency order', () => {
  const c = copy(), n = c.networks.moderato;
  n.currencies = Object.fromEntries(Object.entries(n.currencies).reverse());
  assert.equal(validateConfig(c).networks.moderato.defaultPaymentCurrency, 'pathUSD');
  assert.equal(getTempoConfig().defaultPaymentToken.symbol, 'PathUSD');
  assert.equal(getTempoConfig().tokens.length, 4);
  assert.deepEqual(COMPACT_LINK_CONFIG.profiles, {'2':'moderato'});
});
test('disabled and unknown networks fail without a fallback', () => {
  for (const network of ['mainnet', 'unknown', '__proto__', 'constructor']) assert.throws(() => getNetworkConfig(network));
  const c=copy(); c.networks.mainnet.enabled=true;
  assert.throws(()=>validateConfig(c), /chain ID/);
});
test('currencies belong to their network and enabled currencies meet commerce requirements', () => {
  const c=copy(); const n=c.networks.moderato;
  n.currencies.extra={...n.currencies.alphaUSD,id:8,address:'0x1111111111111111111111111111111111111111',symbol:'EXTRA'};
  validateConfig(c);
  n.currencies.extra.address=n.currencies.pathUSD.address;
  assert.throws(()=>validateConfig(c), /duplicate currency address/);
  n.currencies.extra.address='0x1111111111111111111111111111111111111111';
  n.currencies.extra.decimals=8;
  assert.throws(()=>validateConfig(c), /six decimals/);
});
test('invalid defaults, deployment and credential-bearing URLs fail clearly', () => {
  for (const mutate of [c=>c.networks.moderato.defaultPaymentCurrency='missing',
    c=>c.networks.moderato.currencies.pathUSD.accountEnabled=false,
    c=>c.networks.moderato.contract=null, c=>c.networks.moderato.rpcUrl='https://secret:password@rpc.example']) {
    const c=copy(); mutate(c); assert.throws(()=>validateConfig(c), /Picomart configuration/);
  }
});

test('all enabled configured currencies are available for catalogs and agent payments', () => {
  const tempo=getTempoConfig();
  assert.deepEqual(tempo.paymentTokens, tempo.tokens);
  assert.deepEqual(getAgentConfig().paymentTokens, tempo.tokens);
  for(const token of tempo.tokens) assert.equal(isPaymentCurrency(token.tokenId), true);
  assert.equal(isPaymentCurrency('0x1111111111111111111111111111111111111111'), false);
  const c=copy(); c.networks.moderato.defaultPaymentCurrency='alphaUSD';
  validateConfig(c);
});
test('same symbol on two networks never supplies a missing network configuration', () => {
  const c=copy(); c.networks.mainnet={...structuredClone(c.networks.moderato),chainId:999,label:'Other',qrProfile:'1'};
  c.networks.mainnet.currencies.pathUSD.address='0x2222222222222222222222222222222222222222';
  validateConfig(c);
  assert.notEqual(c.networks.mainnet.currencies.pathUSD.address,c.networks.moderato.currencies.pathUSD.address);
});
