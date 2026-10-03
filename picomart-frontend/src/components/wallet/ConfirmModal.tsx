import React from 'react'
import {Button} from '@/components/ui/button'

interface ConfirmModalProps {
  open: boolean
  title?: string
  message: React.ReactNode
  confirmLabel?: string
  confirmVariant?: 'default' | 'destructive' | 'secondary' | 'outline' | 'ghost' | 'link'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'destructive',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null
  const modal = (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background p-6 rounded-lg shadow-xl w-full max-w-md space-y-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="text-sm text-foreground/90 leading-relaxed">
          {message}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
  return modal
}

export default ConfirmModal
