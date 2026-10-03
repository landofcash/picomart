import type {ComponentProps} from 'react';
import {cn} from '@/lib/utils';

export function Button({variant = 'secondary', className, type = 'button', ...props}: ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'icon';
}) {
  return <button {...props} type={type} className={cn('shop-button', `shop-button-${variant}`, className)}/>;
}
