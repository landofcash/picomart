import {formatUnits} from 'ethers';
import {getCurrency} from '@picomart/config';
import {Portal as TooltipPortal} from '@radix-ui/react-tooltip';
import TokenIcon from './TokenIcon';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from './ui/tooltip';
import {cn} from '@/lib/utils';

export default function TokenPrice({amount,token,className,iconSize=18}:{amount:string|bigint;token:string;className?:string;iconSize?:number}){
  const currency=getCurrency(token),value=formatUnits(amount,currency.decimals);
  return <TooltipProvider delayDuration={200}><Popover><Tooltip>
    <TooltipTrigger asChild><PopoverTrigger asChild>
      <button type="button" aria-label={`${value} ${currency.symbol}, token details`} className={cn('inline-flex min-h-11 items-center gap-1.5 rounded bg-transparent text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',className)}>
        <span aria-hidden="true"><TokenIcon assetId={token} size={iconSize}/></span><span>{value}</span>
      </button>
    </PopoverTrigger></TooltipTrigger>
    <TooltipPortal><TooltipContent>{currency.name}</TooltipContent></TooltipPortal>
  </Tooltip><PopoverContent className="w-auto px-3 py-2 text-sm" onOpenAutoFocus={event=>event.preventDefault()}>{currency.name}</PopoverContent></Popover></TooltipProvider>;
}
