import { useCallback, useEffect, useState } from 'react'
import { History, Play, ShieldCheck, Sunrise, Terminal } from 'lucide-react'
import { scriptApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useWarehouse } from '../context/WarehouseContext'
import { Banner, EmptyState, PageHeader, Skeleton } from '../components/ui'

const SEVERITY = {
  critical: 'var(--alert)',
  warning: 'var(--packing)',
  info: 'var(--slate)',
}

const RUN_STATUS = {
  PASSED: 'var(--shipped)',
  FLAGGED: 'var(--packing)',
  FAILED: 'var(--alert)',
  ERROR: 'var(--alert)',
}

export default function ScriptingEngine() {
  const { can } = useAuth()
  const { active } = useWarehouse()
  const [checks, setChecks] = useState([])
  const [selected, setSelected] = useState([])
  const [runs, setRuns] = useState([])
  const [current, setCurrent] = useState(null)
  const [source, setSource] = useState('')
  const [scriptName, setScriptName] = useState('Morning custom check')
  const [scopeToWarehouse, setScopeToWarehouse] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadRuns = useCallback(
    () =>
      scriptApi
        .runs()
        .then(({ data }) => setRuns(data))
        .catch(() => setRuns([])),
    [],
  )

  useEffect(() => {
    Promise.all([scriptApi.checks(), scriptApi.sample(), loadRuns()])
      .then(([checkResponse, sampleResponse]) => {
        setChecks(checkResponse.data)
        setSource(sampleResponse.data.source)
      })
      .catch((err) => setError(err.friendlyMessage))
      .finally(() => setLoading(false))
  }, [loadRuns])

  const runBuiltin = (keys) => {
    setBusy(true)
    setError('')
    scriptApi
      .runChecks({ checks: keys, warehouse_code: scopeToWarehouse ? active : null })
      .then(({ data }) => {
        setCurrent(data)
        loadRuns()
      })
      .catch((err) => setError(err.friendlyMessage))
      .finally(() => setBusy(false))
  }

  const runCustom = () => {
    setBusy(true)
    setError('')
    scriptApi
      .runCustom({ name: scriptName, source, warehouse_code: scopeToWarehouse ? active : null })
      .then(({ data }) => {
        setCurrent(data)
        loadRuns()
      })
      .catch((err) => setError(err.friendlyMessage))
      .finally(() => setBusy(false))
  }

  if (loading) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Before the first wave"
        title="Routine checks"
        actions={
          <>
            <button type="button" className="btn-primary btn-sm" onClick={() => runBuiltin(null)} disabled={busy}>
              <Sunrise className="h-4 w-4" aria-hidden="true" />
              {busy ? 'Running' : 'Run the morning routine'}
            </button>
            <button
              type="button"
              className="btn-quiet btn-sm"
              onClick={() => runBuiltin(selected)}
              disabled={busy || selected.length === 0}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Run selected ({selected.length})
            </button>
          </>
        }
      >
        Clearing critical findings early is what stops a bad count becoming a customer problem two
        days later.
      </PageHeader>

      {error && <Banner tone="error">{error}</Banner>}

      <label className="flex w-fit cursor-pointer items-center gap-2.5 rounded-xl bg-mist px-3.5 py-2.5 text-sm">
        <input
          type="checkbox"
          checked={scopeToWarehouse}
          onChange={(event) => setScopeToWarehouse(event.target.checked)}
        />
        Limit to {active || 'the active building'}
      </label>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="display-md">Available checks</h2>
            <p className="lede mt-1">Tick the ones you want, or run the whole routine above.</p>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {checks.map((check) => (
              <li key={check.key} className="row px-5 py-3.5">
                <label htmlFor={check.key} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    id={check.key}
                    checked={selected.includes(check.key)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, check.key]
                          : current.filter((key) => key !== check.key),
                      )
                    }
                  />
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{check.name}</span>
                      <span className="pill tint" style={{ color: SEVERITY[check.severity] }}>
                        {check.severity}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate">
                      {check.description}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2">
            <Terminal className="h-[1.125rem] w-[1.125rem] text-slate" aria-hidden="true" />
            <h2 className="display-md">Custom check</h2>
          </div>

          {can('script:write') ? (
            <>
              <p className="lede mt-1">
                Python, sandboxed: no imports, no file access, ten second ceiling. You get{' '}
                <code className="data rounded bg-mist px-1 py-0.5 text-[0.8125rem]">inventory</code>,{' '}
                <code className="data rounded bg-mist px-1 py-0.5 text-[0.8125rem]">orders</code> and{' '}
                <code className="data rounded bg-mist px-1 py-0.5 text-[0.8125rem]">flag(...)</code>.
              </p>
              <input
                className="field mt-4"
                value={scriptName}
                onChange={(event) => setScriptName(event.target.value)}
                aria-label="Check name"
              />
              <textarea
                className="field mt-2 h-64 font-mono text-xs leading-relaxed"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                spellCheck="false"
                aria-label="Check source"
              />
              <button type="button" className="btn-primary mt-3" onClick={runCustom} disabled={busy}>
                <Play className="h-4 w-4" aria-hidden="true" />
                Run this check
              </button>
            </>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Admins write custom checks"
              hint="You can run the built-in checks and read every result."
            />
          )}
        </section>
      </div>

      {current && <RunResult run={current} />}

      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4">
          <History className="h-[1.125rem] w-[1.125rem] text-slate" aria-hidden="true" />
          <h2 className="display-md">Run history</h2>
        </div>

        {runs.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState title="No checks have run yet" hint="Start with the morning routine." />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-mist">
                  {['Started', 'Check', 'Kind', 'Status', 'Findings', 'By'].map((heading) => (
                    <th key={heading} className="th">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="row cursor-pointer"
                    onClick={() => setCurrent(run)}
                    tabIndex={0}
                    onKeyDown={(event) => event.key === 'Enter' && setCurrent(run)}
                  >
                    <td className="td data whitespace-nowrap text-slate">
                      {new Date(run.started_at).toLocaleString(undefined, {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="td font-medium">{run.name}</td>
                    <td className="td data text-slate">{run.kind}</td>
                    <td className="td">
                      <span className="pill tint" style={{ color: RUN_STATUS[run.status] || 'var(--slate)' }}>
                        {run.status}
                      </span>
                    </td>
                    <td className="td data">{run.findings.length}</td>
                    <td className="td data text-slate">{run.triggered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function RunResult({ run }) {
  return (
    <section className="card animate-rise p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="display-md">{run.name}</h2>
        <span className="pill tint" style={{ color: RUN_STATUS[run.status] || 'var(--slate)' }}>
          {run.status}
        </span>
        <span className="data text-xs text-slate">{run.duration_ms} ms</span>
      </div>

      {run.output && (
        <pre className="mt-4 overflow-x-auto rounded-xl bg-mist p-4 font-mono text-xs leading-relaxed">
          {run.output}
        </pre>
      )}

      {run.findings.length === 0 ? (
        <p className="mt-4 text-sm font-medium" style={{ color: 'var(--shipped)' }}>
          Nothing to fix. Release the wave.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {run.findings.map((finding, index) => {
            const color = SEVERITY[finding.severity] || 'var(--slate)'
            return (
              <li
                key={index}
                className="rounded-xl border px-4 py-3"
                style={{
                  borderColor: `color-mix(in srgb, ${color} 26%, transparent)`,
                  background: `color-mix(in srgb, ${color} 6%, var(--paper))`,
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill tint" style={{ color }}>
                    {finding.check}
                  </span>
                  {finding.warehouse_code && (
                    <span className="data text-xs text-slate">{finding.warehouse_code}</span>
                  )}
                  {finding.entity && <span className="data text-xs text-slate">{finding.entity}</span>}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed">{finding.message}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
