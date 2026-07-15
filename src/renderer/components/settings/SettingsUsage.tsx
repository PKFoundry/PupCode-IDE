import { useState, useEffect } from 'react';
import { Zap, Trash2, BarChart3 } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { getSidecarClient } from '../../services/sidecar';

interface UsageSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cache_read_tokens?: number;
  total_cache_write_tokens?: number;
  model_counts: number;
  session_counts: number;
  sessions_count?: number;
  message_counts: number;
}

interface DailyUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  message_count: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

interface ModelUsageEntry {
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  message_count: number;
  session_count: number;
  cost_usd: number;
  last_used?: string;
}

interface ModelUsageResponse {
  models: ModelUsageEntry[];
  total_cost_usd: number;
  total_models: number;
  limit: number;
  offset: number;
}

export default function SettingsUsage() {
  const { sidecarPort } = useAppStore();
  const [period, setPeriod] = useState('week');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [dailyData, setDailyData] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchData = async () => {
    if (!sidecarPort) return;
    setLoading(true);
    try {
      const client = getSidecarClient(sidecarPort);
      const [summaryData, dailyJson] = await Promise.all([
        client.getUsageSummary(period),
        client.getDailyUsage(period === 'today' ? 1 : period === 'week' ? 7 : 30),
      ]);
      setSummary(summaryData);
      setDailyData(dailyJson.days || []);
    } catch (e) {
      console.error('Failed to fetch usage data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [sidecarPort, period]);

  const handleClear = async () => {
    if (!sidecarPort) return;
    setClearing(true);
    try {
      const client = getSidecarClient(sidecarPort);
      await client.clearUsage();
      setShowClearConfirm(false);
      fetchData();
    } catch (e) {
      console.error('Failed to clear token stats:', e);
    } finally {
      setClearing(false);
    }
  };

  const formatCost = (cost: number) => `$${cost.toFixed(2)}`;
  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const periods: { key: string; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                period === p.key
                  ? 'bg-blue-600/30 text-blue-200 border border-blue-500/30'
                  : 'bg-bg-secondary text-text-muted border border-border hover:text-text-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {!showClearConfirm ? (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Clear Stats
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">Clear all?</span>
            <button onClick={handleClear} disabled={clearing}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors">
              {clearing ? '...' : 'Yes'}
            </button>
            <button onClick={() => setShowClearConfirm(false)}
              className="px-2 py-1 text-xs border border-border text-text-muted rounded hover:text-text-primary transition-colors">
              No
            </button>
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div className="bg-bg-secondary rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted mb-0.5">Total Cost</div>
            <div className="text-lg font-semibold text-text-primary">{formatCost(summary.total_cost_usd)}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted mb-0.5">Input Tokens</div>
            <div className="text-lg font-semibold text-text-primary">{formatTokens(summary.total_input_tokens)}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted mb-0.5">Output Tokens</div>
            <div className="text-lg font-semibold text-text-primary">{formatTokens(summary.total_output_tokens)}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted mb-0.5">Cache Reads</div>
            <div className="text-lg font-semibold text-text-primary">{formatTokens(summary.total_cache_read_tokens ?? 0)}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted mb-0.5">Cache Writes</div>
            <div className="text-lg font-semibold text-text-primary">{formatTokens(summary.total_cache_write_tokens ?? 0)}</div>
          </div>
          <div className="bg-bg-secondary rounded-lg border border-border p-3">
            <div className="text-[10px] text-text-muted mb-0.5">Sessions</div>
            <div className="text-lg font-semibold text-text-primary">{summary.sessions_count ?? summary.session_counts}</div>
          </div>
        </div>
      )}

      {dailyData.length > 0 && (
        <div className="bg-bg-secondary rounded-lg border border-border p-4">
          <div className="text-sm font-semibold text-text-primary mb-4">Daily Usage</div>
          <div className="space-y-2">
            {dailyData.slice(0, 14).reverse().map(day => (
              <div key={day.date} className="flex items-center gap-3">
                <div className="w-16 text-xs text-text-muted flex-shrink-0">{day.date.slice(5)}</div>
                <div className="flex-1 flex items-center gap-0.5 h-5">
                  <div className="bg-blue-500/40 rounded-l-sm h-full transition-all"
                    style={{ width: `${Math.max(((day.input_tokens) / (summary?.total_input_tokens || 1)) * 100, 1)}%` }}
                    title={`Input: ${formatTokens(day.input_tokens)}`} />
                  <div className="bg-green-500/40 h-full transition-all"
                    style={{ width: `${Math.max((day.output_tokens / (summary?.total_output_tokens || 1)) * 100, 1)}%` }}
                    title={`Output: ${formatTokens(day.output_tokens)}`} />
                  <div className="bg-purple-500/40 h-full transition-all"
                    style={{ width: `${Math.max((((day.cache_read_tokens ?? 0)) / (summary?.total_cache_read_tokens ?? 1)) * 100, 0.5)}%` }}
                    title={`Cache Read: ${formatTokens(day.cache_read_tokens ?? 0)}`} />
                  <div className="bg-orange-500/40 rounded-r-sm h-full transition-all"
                    style={{ width: `${Math.max((((day.cache_write_tokens ?? 0)) / (summary?.total_cache_write_tokens ?? 1)) * 100, 0.5)}%` }}
                    title={`Cache Write: ${formatTokens(day.cache_write_tokens ?? 0)}`} />
                </div>
                <div className="w-16 text-xs text-text-primary text-right">{formatCost(day.cost_usd)}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-500/40 rounded-sm" /><span className="text-[10px] text-text-muted">Input</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-500/40 rounded-sm" /><span className="text-[10px] text-text-muted">Output</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-purple-500/40 rounded-sm" /><span className="text-[10px] text-text-muted">Cache Read</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-orange-500/40 rounded-sm" /><span className="text-[10px] text-text-muted">Cache Write</span></div>
          </div>
        </div>
      )}

      <ModelUsageTable period={period} />

      {!summary || (summary.sessions_count ?? summary.session_counts) === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No usage data yet</p>
          <p className="text-xs mt-1">Token usage will appear here after your first conversation</p>
        </div>
      ) : null}
    </div>
  );
}

function ModelUsageTable({ period }: { period: string }) {
  const { sidecarPort } = useAppStore();
  const [data, setData] = useState<ModelUsageResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 3;

  const fetchData = async () => {
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.getUsageByModel(period, limit, offset);
      setData(data);
    } catch (e) {
      console.error('Failed to fetch model usage:', e);
    }
  };

  useEffect(() => { fetchData(); setOffset(0); }, [sidecarPort, period]);
  useEffect(() => { fetchData(); }, [offset]);

  const totalPages = data ? Math.ceil(data.total_models / limit) : 0;

  if (!data || data.models.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-xs">No model usage data</p>
      </div>
    );
  }

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div>
      <div className="bg-bg-secondary rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 text-text-muted font-medium">Model</th>
              <th className="text-right px-4 py-2 text-text-muted font-medium">Tokens</th>
              <th className="text-right px-4 py-2 text-text-muted font-medium">Messages</th>
              <th className="text-right px-4 py-2 text-text-muted font-medium">Sessions</th>
              <th className="text-right px-4 py-2 text-text-muted font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.models.map(entry => (
              <tr key={entry.model} className="border-b border-border/50 hover:bg-bg-hover/50">
                <td className="px-4 py-3">
                  <div className="text-text-primary font-medium truncate max-w-[180px]" title={entry.model}>
                    {entry.model}
                  </div>
                  {entry.last_used && (
                    <div className="text-[10px] text-text-muted mt-0.5">Last used: {new Date(entry.last_used).toLocaleDateString()}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-text-primary text-right font-mono">
                  {formatTokens(entry.input_tokens + entry.output_tokens)}
                </td>
                <td className="px-4 py-3 text-text-primary text-right">{entry.message_count}</td>
                <td className="px-4 py-3 text-text-primary text-right">{entry.session_count}</td>
                <td className="px-4 py-3 text-text-primary text-right font-mono">
                  ${entry.cost_usd.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-text-muted">Showing {data.models.length} of {data.total_models} models</span>
          <div className="flex gap-1">
            <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
              className="px-2 py-1 text-[10px] rounded border border-border text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors">
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setOffset(i * limit)}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  offset === i * limit ? 'bg-blue-600/30 border-blue-500/30 text-blue-200' : 'border-border text-text-muted hover:text-text-primary'
                }`}>
                {i + 1}
              </button>
            ))}
            <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= data.total_models}
              className="px-2 py-1 text-[10px] rounded border border-border text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
