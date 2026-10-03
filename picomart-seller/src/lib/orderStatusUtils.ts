/**
 * Utility functions for order status handling
 */

/**
 * Maps status codes to readable text based on the smart contract status enum
 */
export function getOrderStatusText(status: string): string {
  switch (status) {
    case '1':
      return 'Initial'
    case '2':
      return 'Paid'
    case '3':
      return 'Delivering'
    case '4':
      return 'Completed'
    case '5':
      return 'Refund Requested'
    case '6':
      return 'Refunded to Buyer'
    case '7':
      return 'Refunded to Seller'
    case '8':
      return 'Refunded'
    default:
      return `Status ${status}`
  }
}

/**
 * Maps status codes to appropriate Tailwind CSS color classes
 */
export function getOrderStatusColor(status: string): string {
  switch (status) {
    case '1':
      return 'text-gray-600 bg-gray-100'
    case '2':
      return 'text-green-600 bg-green-100'
    case '3':
      return 'text-blue-600 bg-blue-100'
    case '4':
      return 'text-purple-600 bg-purple-100'
    case '5':
      return 'text-orange-600 bg-orange-100'
    case '6':
      return 'text-red-600 bg-red-100'
    case '7':
      return 'text-yellow-600 bg-yellow-100'
    case '8':
      return 'text-red-600 bg-red-100'
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

/**
 * Gets a description of what each status means
 */
export function getOrderStatusDescription(status: string): string {
  switch (status) {
    case '1':
      return 'Order has been created but payment is pending'
    case '2':
      return 'Payment has been confirmed and order is ready for processing'
    case '3':
      return 'Order is being delivered to the customer'
    case '4':
      return 'Order has been successfully completed'
    case '5':
      return 'Customer has requested a refund'
    case '6':
      return 'Refund has been processed and returned to buyer'
    case '7':
      return 'Refund has been processed and returned to seller'
    case '8':
      return 'Order was canceled and funds were returned to the buyer'
    default:
      return 'Unknown status'
  }
}
