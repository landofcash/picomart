import {TempoDeliveryOptionsSchema} from '@picomart/order-protocol/tempo-protocol';
import {isPaymentCurrency} from '@picomart/config';
import type {DeliverySet} from './deliverySets';

export function deliverySetErrors(set: DeliverySet): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!set.name.trim()) errors.name = 'Enter a set name.';
  else if (set.name.length > 200) errors.name = 'Use 200 characters or fewer.';
  if (set.description.length > 2000) errors.description = 'Use 2,000 characters or fewer.';
  if (!isPaymentCurrency(set.options.currency)) errors.currency = 'Choose a supported currency.';
  const parsed = TempoDeliveryOptionsSchema.safeParse(set.options);
  if (!parsed.success) for (const issue of parsed.error.issues) errors[`options.${issue.path.join('.')}`] ??= issue.message;
  if (set.options.methods.every(method => set.disabledTypes.includes(method.type))) errors.methods = 'Enable at least one delivery method.';
  set.options.methods.forEach((method, index) => {
    const prefix = `options.methods.${index}`;
    if (!method.name.trim()) errors[`${prefix}.name`] = 'Enter a buyer-facing name.';
    if (method.type === 'digital') return;
    const list = method.type === 'customer-address' ? 'services' : 'locations';
    const options = method.type === 'customer-address' ? method.services : method.locations;
    if (!options.length) errors[`${prefix}.${list}`] = `Add at least one ${list === 'services' ? 'service' : 'location'}.`;
    options.forEach((option, optionIndex) => {
      const optionPrefix = `${prefix}.${list}.${optionIndex}`;
      if (!option.name.trim()) errors[`${optionPrefix}.name`] = `Enter a ${list === 'services' ? 'service' : 'location'} name.`;
      if ('address' in option && typeof option.address === 'string' && !set.disabledTypes.includes(method.type) &&
        (!option.address.trim() || ['Enter the collection address', 'Enter the pickup box address'].includes(option.address))) {
        errors[`${optionPrefix}.address`] = 'Enter the address where customers will collect their order.';
      }
    });
  });
  return errors;
}
