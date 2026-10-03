import React, {useMemo, useState} from 'react'
import {Button} from '@/components/ui/button'

interface ImportModalProps {
  open: boolean
  onClose: () => void
  onImport: (mnemonic: string) => void | Promise<void>
}

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ')

const ImportModal: React.FC<ImportModalProps> = ({open, onClose, onImport}) => {
  const [mnemonic, setMnemonic] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wordsCount = useMemo(() => (normalize(mnemonic) ? normalize(mnemonic).split(' ').length : 0), [mnemonic])
  const canSubmit = mnemonic.trim().length > 0 && wordsCount >= 12 && !submitting

  if (!open) return null

  const handleSubmit = async () => {
    const cleaned = normalize(mnemonic)
    if (!cleaned) return
    setSubmitting(true)
    setError(null)
    try {
      await onImport(cleaned)
      setMnemonic('')
    } catch (e: any) {
      console.error('Import failed', e)
      setError(e?.message || 'Failed to import wallet. Check your mnemonic and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const modal = (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-background p-6 rounded-lg shadow-xl w-full max-w-lg space-y-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold">Import Internal Wallet</h2>
        <div className="space-y-3 text-sm">
          <div className="text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded p-3">
            Paste your 12/24-word mnemonic to import a saved wallet. Never share this phrase.
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Mnemonic (seed phrase)</label>
            <textarea
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              rows={4}
              placeholder="e.g. skate donkey ..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-28"
              spellCheck={false}
            />
            <div className="mt-1 text-[11px] text-muted-foreground">Words: {wordsCount}</div>
            {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Importing…' : 'Import Wallet'}
          </Button>
        </div>
      </div>
    </div>
  )

  return modal
}

export default ImportModal
