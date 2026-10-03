import React from 'react'
import {CheckCircle} from 'lucide-react'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useApprovedShopStatus} from '@/lib/approvedShop'

interface ApprovedShopBadgeProps {
  walletAddress: string
  className?: string
}

const ApprovedShopBadge: React.FC<ApprovedShopBadgeProps> = ({walletAddress, className = ''}) => {
  const isApproved = useApprovedShopStatus(walletAddress)

  if (!isApproved) {
    return null
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <CheckCircle className={`h-4 w-4 text-green-600 ${className}`}/>
        </TooltipTrigger>
        <TooltipContent side="top" align="center">
          <p className="text-xs">Verified Shop</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default ApprovedShopBadge
