'use client'

import { useState, useRef } from 'react'
import { importTransactions } from '@/lib/api'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const res = await importTransactions(file)
      setResult(res)
      onSuccess()
    } catch {
      setError('Import failed. Please check your file format.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setResult(null)
    setError('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Transactions">
      {result ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <CheckCircle2 size={48} className="text-primary" />
          <div className="text-center">
            <p className="text-lg font-semibold text-text-primary">Import Complete!</p>
            <p className="text-text-secondary text-sm">{result.imported} transactions imported</p>
          </div>
          {result.errors.length > 0 && (
            <div className="w-full">
              <p className="text-sm font-medium text-warning mb-2">Errors ({result.errors.length}):</p>
              <div className="max-h-32 overflow-y-auto bg-surface-2 rounded-xl p-3">
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-danger mb-1">{err}</p>
                ))}
              </div>
            </div>
          )}
          <Button variant="primary" onClick={handleClose} className="w-full">Done</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Upload a CSV file to import your transactions. The file should have columns: date, description, amount, account, category.
          </p>

          {error && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-[#2d3748] rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary transition-colors"
          >
            <Upload size={32} className="text-muted" />
            {file ? (
              <div className="text-center">
                <p className="text-sm font-medium text-text-primary">{file.name}</p>
                <p className="text-xs text-text-secondary">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-text-primary">Click to select a CSV file</p>
                <p className="text-xs text-text-secondary">or drag and drop</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleClose} className="flex-1">Cancel</Button>
            <Button
              variant="primary"
              onClick={handleImport}
              loading={loading}
              disabled={!file}
              className="flex-1"
            >
              Import
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
