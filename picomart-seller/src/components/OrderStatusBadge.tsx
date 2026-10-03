import React from 'react'
import { getOrderStatusText, getOrderStatusColor } from '@/lib/orderStatusUtils'

interface OrderStatusBadgeProps {
  status: string
  label?: string
  className?: string
}

const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, label, className = '' }) => {
  const statusText = label ?? getOrderStatusText(status)
  const statusColor = getOrderStatusColor(status)

  return (
    <span 
      className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor} ${className}`}
    >
      {statusText}
    </span>
  )
}

export default OrderStatusBadge
