import {useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {Switch} from '@/components/ui/switch'
import {Truck} from 'lucide-react'

export interface DeliveryInfo {
  fullName: string
  address: string
  city: string
  postalCode: string
  country: string
  phone: string
  email: string
  deliveryComments?: string
  noPhysicalDelivery: boolean
}

interface DeliveryInfoFormProps {
  onDeliveryInfoChange: (info: DeliveryInfo) => void
  deliveryInfo: DeliveryInfo
}

export function DeliveryInfoForm({onDeliveryInfoChange, deliveryInfo}: DeliveryInfoFormProps) {
  const [errors, setErrors] = useState<Partial<DeliveryInfo>>({})

  const handleInputChange = (field: keyof DeliveryInfo, value: string | boolean) => {
    const updatedInfo = {...deliveryInfo, [field]: value}
    onDeliveryInfoChange(updatedInfo)

    // Clear error for this field when the user starts typing
    if (errors[field]) {
      setErrors(prev => ({...prev, [field]: undefined}))
    }
  }

  const handleAutoFill = () => {
    const testInfo: DeliveryInfo = {
      fullName: 'John Doe',
      address: '123 Main Street, Apt 4B',
      city: 'New York',
      postalCode: '10001',
      country: 'United States',
      phone: '+1 (555) 123-4567',
      email: 'john.doe@example.com',
      deliveryComments: 'Please leave package at front door if no one is home. Ring doorbell twice.',
      noPhysicalDelivery: false
    }
    onDeliveryInfoChange(testInfo)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5"/>
          Delivery Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* No Physical Delivery Switch */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label htmlFor="no-physical-delivery" className="text-sm font-medium">
              No physical delivery
            </label>
            <p className="text-xs text-muted-foreground">
              Digital products or services only </p>
          </div>
          <Switch id="no-physical-delivery" checked={deliveryInfo.noPhysicalDelivery}
                  onCheckedChange={(checked) => handleInputChange('noPhysicalDelivery', checked)}/>
        </div>
        <Button variant="outline" size="sm" onClick={handleAutoFill} className="w-full">
          🔧 Auto-fill with test data
        </Button>
        <div className="grid grid-cols-1 gap-4">
          {/* Physical delivery fields - only show when physical delivery is required */}
          {!deliveryInfo.noPhysicalDelivery && (
            <>
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium mb-1">
                  Full Name *
                </label>
                <input id="fullName" type="text" value={deliveryInfo.fullName}
                       onChange={(e) => handleInputChange('fullName', e.target.value)}
                       className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                         errors.fullName ? 'border-destructive' : 'border-input'
                       }`} placeholder="Enter your full name"/>
                {errors.fullName && (
                  <p className="text-xs text-destructive mt-1">{errors.fullName}</p>
                )}
              </div>

              <div>
                <label htmlFor="address" className="block text-sm font-medium mb-1">
                  Address *
                </label>
                <input id="address" type="text" value={deliveryInfo.address}
                       onChange={(e) => handleInputChange('address', e.target.value)}
                       className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                         errors.address ? 'border-destructive' : 'border-input'
                       }`} placeholder="Street address, apartment, suite, etc."/>
                {errors.address && (
                  <p className="text-xs text-destructive mt-1">{errors.address}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium mb-1">
                    City *
                  </label>
                  <input id="city" type="text" value={deliveryInfo.city}
                         onChange={(e) => handleInputChange('city', e.target.value)}
                         className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                           errors.city ? 'border-destructive' : 'border-input'
                         }`} placeholder="City"/>
                  {errors.city && (
                    <p className="text-xs text-destructive mt-1">{errors.city}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="postalCode" className="block text-sm font-medium mb-1">
                    Postal Code *
                  </label>
                  <input id="postalCode" type="text" value={deliveryInfo.postalCode}
                         onChange={(e) => handleInputChange('postalCode', e.target.value)}
                         className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                           errors.postalCode ? 'border-destructive' : 'border-input'
                         }`} placeholder="Postal code"/>
                  {errors.postalCode && (
                    <p className="text-xs text-destructive mt-1">{errors.postalCode}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="country" className="block text-sm font-medium mb-1">
                  Country *
                </label>
                <input id="country" type="text" value={deliveryInfo.country}
                       onChange={(e) => handleInputChange('country', e.target.value)}
                       className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                         errors.country ? 'border-destructive' : 'border-input'
                       }`} placeholder="Country"/>
                {errors.country && (
                  <p className="text-xs text-destructive mt-1">{errors.country}</p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium mb-1">
                  Phone Number *
                </label>
                <input id="phone" type="tel" value={deliveryInfo.phone}
                       onChange={(e) => handleInputChange('phone', e.target.value)}
                       className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                         errors.phone ? 'border-destructive' : 'border-input'
                       }`} placeholder="+1 (555) 123-4567"/>
                {errors.phone && (
                  <p className="text-xs text-destructive mt-1">{errors.phone}</p>
                )}
              </div>
            </>
          )}

          {/* Email field - always visible but optional for no physical delivery */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email Address {!deliveryInfo.noPhysicalDelivery && '*'}
            </label>
            <input id="email" type="email" value={deliveryInfo.email}
                   onChange={(e) => handleInputChange('email', e.target.value)}
                   className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                     errors.email ? 'border-destructive' : 'border-input'
                   }`} placeholder="your.email@example.com"/>
            {errors.email && (
              <p className="text-xs text-destructive mt-1">{errors.email}</p>
            )}
          </div>

          {/* Delivery Comments - always visible */}
          <div>
            <label htmlFor="deliveryComments" className="block text-sm font-medium mb-1">
              {deliveryInfo.noPhysicalDelivery ? 'Additional Comments' : 'Delivery Comments'}
            </label>
            <textarea id="deliveryComments" value={deliveryInfo.deliveryComments || ''}
                      onChange={(e) => handleInputChange('deliveryComments', e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      placeholder={
                        deliveryInfo.noPhysicalDelivery
                          ? "Any additional information or special instructions"
                          : "Special delivery instructions, preferred delivery time, etc."
                      } rows={3}/>
            <p className="text-xs text-muted-foreground mt-1">
              {deliveryInfo.noPhysicalDelivery
                ? 'Optional: Any additional information'
                : 'Optional: Any special instructions for delivery'
              }
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
