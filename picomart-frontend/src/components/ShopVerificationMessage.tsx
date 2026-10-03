import React from 'react'
import {AlertTriangle, CheckCircle} from 'lucide-react'
import {useApprovedShopStatus} from '@/lib/approvedShop'

interface ShopVerificationMessageProps {
  shopWallet: string
  className?: string
}

const ShopVerificationMessage: React.FC<ShopVerificationMessageProps> = ({
                                                                           shopWallet,
                                                                           className = ''
                                                                         }) => {
  const isApprovedShop = useApprovedShopStatus(shopWallet)

  if (isApprovedShop) {
    return (
      <div className={`flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md ${className}`}>
        <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0"/>
        <p className="text-xs text-blue-800">
          <strong>Verified Shop:</strong> This is a Picomart-verified merchant. </p>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md ${className}`}>
      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0"/>
      <p className="text-xs text-amber-800">
        <strong>Important:</strong> Delivery and refunds are handled by the shop, not Picomart. Picomart is not
        responsible for order fulfillment or customer service. Payments are final and can't be reversed by
        Picomart. </p>
    </div>
  )
}

export default ShopVerificationMessage
