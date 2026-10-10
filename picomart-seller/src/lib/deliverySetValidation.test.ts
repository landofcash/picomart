import {describe, expect, it} from 'vitest';
import {newDeliverySet, publishedDeliverySet} from './deliverySets';
import {deliverySetErrors} from './deliverySetValidation';

const currency = '0x20c0000000000000000000000000000000000000';
describe('delivery set field validation', () => {
  it('points a physical preset at its unfinished pickup address, while allowing shipping only', () => {
    const set = newDeliverySet(currency, 'physical');
    expect(deliverySetErrors(set)).toEqual({'options.methods.1.locations.0.address':'Enter the address where customers will collect their order.'});
    set.disabledTypes.push('shop-pickup');
    expect(deliverySetErrors(set)).toEqual({});
    expect(publishedDeliverySet(set).methods.map(method=>method.type)).toEqual(['customer-address']);
  });
  it('accepts a completed pickup location and identifies missing names and whitespace addresses', () => {
    const set = newDeliverySet(currency, 'pickup');
    const pickup = set.options.methods[1];
    if (pickup.type !== 'shop-pickup') throw new Error('Expected shop pickup');
    pickup.locations[0].address = '12 Main Street';
    expect(deliverySetErrors(set)).toEqual({});
    pickup.locations[0].address = '   ';
    pickup.locations[0].name = '';
    expect(deliverySetErrors(set)).toHaveProperty('options.methods.1.locations.0.address');
    expect(deliverySetErrors(set)).toHaveProperty('options.methods.1.locations.0.name');
  });
  it('requires a method and keeps malformed disabled data visible for correction', () => {
    const set = newDeliverySet(currency, 'digital');
    set.disabledTypes = set.options.methods.map(method=>method.type);
    set.options.methods[0].name = '';
    expect(deliverySetErrors(set)).toHaveProperty('methods');
    expect(deliverySetErrors(set)).toHaveProperty('options.methods.0.name');
  });
  it('accepts digital delivery and maps protocol fee errors to their input', () => {
    const set = newDeliverySet(currency, 'digital');
    expect(deliverySetErrors(set)).toEqual({});
    expect(publishedDeliverySet(set).methods[0].description).toContain('URL or code');
    const shipping = set.options.methods[0];
    if (shipping.type !== 'customer-address') throw new Error('Expected shipping');
    shipping.services[0].amount = '-1';
    expect(deliverySetErrors(set)).toHaveProperty('options.methods.0.services.0.amount');
  });
});
