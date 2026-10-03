import React, {useState} from 'react'
import {createPortal} from 'react-dom'
import {Button} from '@/components/ui/button'
import {Eye, EyeOff, Copy} from 'lucide-react'

interface ExportModalProps {
  open: boolean
  address: string | null
  mnemonic: string | null
  onClose: () => void
}

const ExportModal: React.FC<ExportModalProps> = ({open, address, mnemonic, onClose}) => {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const handleCopy = async () => {
    if (!mnemonic) return
    try {
      await navigator.clipboard.writeText(mnemonic)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.error('Copy failed', e)
    }
  }

  const modal = (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background p-6 rounded-lg shadow-xl w-full max-w-lg space-y-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold">Export Internal Wallet</h2>
        <div className="space-y-3 text-sm">
          <div className="text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800 rounded p-3">
            Never share this mnemonic. Anyone with it can control your funds.
          </div>
          {address && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Address</div>
              <div className="font-mono break-all text-xs">{address}</div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-muted-foreground">Mnemonic</div>
              <button
                className="text-xs inline-flex items-center gap-1 text-blue-600 hover:underline bg-transparent border-0 p-0"
                onClick={() => setRevealed(v => !v)}
                aria-label={revealed ? 'Hide mnemonic' : 'Show mnemonic'}
              >
                {revealed ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                {revealed ? 'Hide' : 'Reveal'}
              </button>
            </div>
            <div className={`font-mono text-sm rounded border p-3 bg-muted ${revealed ? '' : 'select-none blur-sm'}`}
                 style={{wordBreak: 'break-word'}}>
              {mnemonic || ''}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleCopy} disabled={!mnemonic} className="inline-flex items-center gap-2">
            <Copy className="w-4 h-4"/>
            {copied ? 'Copied!' : 'Copy mnemonic'}
          </Button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}

export default ExportModal
