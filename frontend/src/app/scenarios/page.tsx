'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ScenarioSelector from '@/components/scenarios/ScenarioSelector'
import ScenarioComparison from '@/components/scenarios/ScenarioComparison'
import { getScenarios, createScenario, cloneScenario, deleteScenario, getForecast } from '@/lib/api'
import { Scenario, ForecastResponse } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'
import { Plus, Copy, Trash2, FlaskConical } from 'lucide-react'

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [forecasts, setForecasts] = useState<Map<number, ForecastResponse>>(new Map())
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showClone, setShowClone] = useState<Scenario | undefined>()
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [forecastMonths] = useState(24)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getScenarios()
      setScenarios(data)
      // Auto-select baseline
      const baseline = data.find((s) => s.is_baseline)
      if (baseline && selectedIds.length === 0) {
        setSelectedIds([baseline.id])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Load forecasts for selected scenarios
  useEffect(() => {
    const loadForecasts = async () => {
      for (const id of selectedIds) {
        if (!forecasts.has(id)) {
          try {
            const f = await getForecast(id, forecastMonths)
            setForecasts((prev) => new Map(prev).set(id, f))
          } catch (e) {
            console.error(e)
          }
        }
      }
    }
    loadForecasts()
  }, [selectedIds, forecastMonths]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      }
      if (prev.length >= 2) {
        return [prev[1], id]
      }
      return [...prev, id]
    })
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      await createScenario({ name: newName, description: newDesc || undefined, is_baseline: false })
      setShowCreate(false)
      setNewName('')
      setNewDesc('')
      load()
    } catch {
      alert('Failed to create scenario.')
    } finally {
      setSaving(false)
    }
  }

  const handleClone = async () => {
    if (!showClone) return
    setSaving(true)
    try {
      await cloneScenario(showClone.id, newName || `${showClone.name} (Copy)`)
      setShowClone(undefined)
      setNewName('')
      load()
    } catch {
      alert('Failed to clone scenario.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (scenario: Scenario) => {
    if (scenario.is_baseline) {
      alert('Cannot delete the baseline scenario.')
      return
    }
    if (!window.confirm(`Delete scenario "${scenario.name}"?`)) return
    try {
      await deleteScenario(scenario.id)
      setSelectedIds((prev) => prev.filter((id) => id !== scenario.id))
      setForecasts((prev) => { const m = new Map(prev); m.delete(scenario.id); return m })
      load()
    } catch {
      alert('Failed to delete scenario.')
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-text-secondary text-sm">
            {scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''} · Select up to 2 to compare
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              New Scenario
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : scenarios.length === 0 ? (
          <div className="text-center py-16 text-text-secondary">
            <FlaskConical size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No scenarios yet</p>
            <Button variant="primary" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Create Scenario
            </Button>
          </div>
        ) : (
          <>
            {/* Scenario list with actions */}
            <Card title="Scenarios">
              <div className="flex flex-col gap-2 mb-4">
                {scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="flex items-center justify-between p-3 bg-surface-2 rounded-xl border border-[#2d3748]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded-full border-2 cursor-pointer flex-shrink-0 ${
                          selectedIds.includes(scenario.id) ? 'bg-primary border-primary' : 'border-[#2d3748]'
                        }`}
                        onClick={() => handleToggle(scenario.id)}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text-primary">{scenario.name}</p>
                          {scenario.is_baseline && <Badge label="Baseline" variant="info" />}
                        </div>
                        {scenario.description && (
                          <p className="text-xs text-text-secondary">{scenario.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setShowClone(scenario); setNewName(`${scenario.name} (Copy)`) }}
                        className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Clone scenario"
                      >
                        <Copy size={14} />
                      </button>
                      {!scenario.is_baseline && (
                        <button
                          onClick={() => handleDelete(scenario)}
                          className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <ScenarioSelector
                scenarios={scenarios}
                selectedIds={selectedIds}
                onToggle={handleToggle}
                maxSelectable={2}
              />
            </Card>

            {/* Comparison */}
            {selectedIds.length >= 2 ? (
              <ScenarioComparison
                scenarios={scenarios}
                forecasts={forecasts}
                selectedIds={selectedIds}
              />
            ) : selectedIds.length === 1 && forecasts.has(selectedIds[0]) ? (
              <div className="text-center py-8 text-text-secondary border-2 border-dashed border-[#2d3748] rounded-xl">
                <p>Select a second scenario to compare</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Create Scenario Modal */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setNewName(''); setNewDesc('') }} title="New Scenario">
        <div className="flex flex-col gap-4">
          <Input
            label="Scenario Name"
            placeholder="e.g. Higher Income, Extra Savings"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Description (optional)</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              placeholder="What-if scenario description..."
              className="px-3 py-2 rounded-xl bg-surface-2 border border-[#2d3748] text-text-primary placeholder:text-muted text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleCreate} disabled={!newName} className="flex-1">Create</Button>
          </div>
        </div>
      </Modal>

      {/* Clone Scenario Modal */}
      <Modal isOpen={!!showClone} onClose={() => { setShowClone(undefined); setNewName('') }} title={`Clone: ${showClone?.name}`}>
        <div className="flex flex-col gap-4">
          <Input
            label="New Scenario Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowClone(undefined)} className="flex-1">Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleClone} disabled={!newName} className="flex-1">Clone</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
