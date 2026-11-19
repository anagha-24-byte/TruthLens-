import { useCallback, useEffect, useState } from 'react';
import { Database, KeyRound, RefreshCw, Table2 } from 'lucide-react';

interface DatabaseColumnMeta {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
}

interface DatabaseTableSnapshot {
  name: string;
  rowCount: number;
  columns: DatabaseColumnMeta[];
  rows: Array<Record<string, string | number | null>>;
}

interface DatabaseSnapshotResponse {
  databaseFile: string;
  engine: string;
  tables: DatabaseTableSnapshot[];
}

export function DatabasePage({ authToken }: { authToken: string }) {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshotResponse | null>(null);
  const [selectedTableName, setSelectedTableName] = useState<string>('investigations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/database/tables', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not load SQLite tables.');
        return;
      }
      const data = (await res.json()) as DatabaseSnapshotResponse;
      setSnapshot(data);
      if (data.tables.length > 0 && !data.tables.some((t) => t.name === selectedTableName)) {
        setSelectedTableName(data.tables[0].name);
      }
    } catch {
      setError('Failed to query local database.');
    } finally {
      setLoading(false);
    }
  }, [authToken, selectedTableName]);

  useEffect(() => {
    void fetchTables();
  }, [fetchTables]);

  const activeTable = snapshot?.tables.find((t) => t.name === selectedTableName) || snapshot?.tables[0] || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Database Tables</h1>
          <p className="text-sm text-slate-600">
            Live SQLite schema and persisted records stored in{' '}
            <code className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
              {snapshot?.databaseFile || 'data/truthlens.db'}
            </code>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchTables()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Tables
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Table Selector Strip */}
      {snapshot && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {snapshot.tables.map((t) => {
            const active = activeTable?.name === t.name;
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => setSelectedTableName(t.name)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'forensic-bezel text-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold truncate">
                    <Table2 className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-sky-300' : 'text-blue-600'}`} />
                    {t.name}
                  </span>
                  <span
                    className={`font-mono text-xs tabular-nums px-2 py-0.5 rounded ${
                      active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {t.rowCount}
                  </span>
                </div>
                <p className={`text-[11px] mt-1.5 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                  {t.columns.length} columns
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Schema Structure Table */}
      {activeTable && (
        <section className="forensic-bezel rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-display font-semibold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              Table Schema: <span className="font-mono">{activeTable.name}</span>
            </h2>
            <span className="text-xs text-slate-500 font-mono">{snapshot?.engine}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-500 font-medium">
                  <th className="py-2.5 px-4">Column</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Key</th>
                  <th className="py-2.5 px-4">Nullable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {activeTable.columns.map((col) => (
                  <tr key={col.name} className="hover:bg-slate-50/70">
                    <td className="py-2 px-4 font-mono font-medium text-slate-900">{col.name}</td>
                    <td className="py-2 px-4 font-mono text-blue-700">{col.type}</td>
                    <td className="py-2 px-4">
                      {col.primaryKey ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          <KeyRound className="w-3 h-3" /> PK
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-slate-600">{col.notNull ? 'NOT NULL' : 'NULL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Live Records Table */}
      {activeTable && (
        <section className="forensic-bezel rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-display font-semibold text-slate-900">
              Records ({activeTable.rowCount})
            </h2>
            <span className="text-xs text-slate-500">
              Showing up to 50 rows · credentials redacted &amp; emails masked
            </span>
          </div>

          {activeTable.rows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No rows stored in <span className="font-mono text-slate-700">{activeTable.name}</span> yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-500 font-medium">
                    {activeTable.columns.map((col) => (
                      <th key={col.name} className="py-2.5 px-4 font-mono whitespace-nowrap">
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {activeTable.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/80">
                      {activeTable.columns.map((col) => {
                        const val = row[col.name];
                        return (
                          <td
                            key={col.name}
                            className="py-2.5 px-4 font-mono text-slate-800 max-w-[260px] truncate whitespace-nowrap"
                            title={val === null ? 'NULL' : String(val)}
                          >
                            {val === null ? <span className="text-slate-400">NULL</span> : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
