import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PICOMART_TEMPO_CONFIG } from '@picomart/config';
import TokenAmount, { TokenLabel } from './TokenAmount';
import ProductQRCodeCard from './ProductQRCodeCard';

describe('seller currency displays', () => {
  it.each(PICOMART_TEMPO_CONFIG.paymentTokens)('renders $symbol amounts with the matching icon', currency => {
    const html = renderToStaticMarkup(<TokenAmount token={currency.tokenId.toUpperCase()} amount="1234567" />);
    expect(html).toContain(`1.234567 ${currency.symbol}`);
    expect(html).toContain(`src="${currency.img}"`);
    expect(renderToStaticMarkup(<TokenLabel token={currency.tokenId} />)).toContain(currency.symbol);
  });

  it.each(PICOMART_TEMPO_CONFIG.paymentTokens)('prints QR prices in $symbol rather than the default currency', currency => {
    const html = renderToStaticMarkup(<ProductQRCodeCard product={{ ProductId: Buffer.alloc(16, 18).toString('base64url'), Name: 'Product', Description: '', Image: 'https://example.com/image.png', Price: '1234567', PriceToken: currency.tokenId }} productCatalogueSeed={Buffer.alloc(16, 17).toString('base64url')} />);
    expect(html).toContain(`1.234567 ${currency.symbol}`);
    expect(html).toContain(`src="${currency.img}"`);
    if (currency.symbol !== 'PathUSD') expect(html).not.toContain('PathUSD');
  });

  it('keeps large base-unit amounts exact', () => {
    const token = PICOMART_TEMPO_CONFIG.paymentTokens[0].tokenId;
    expect(renderToStaticMarkup(<TokenAmount token={token} amount="9007199254740993123456" />)).toContain('9007199254740993.123456');
  });
});
