'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from 'recharts';
import { TrendingUp, Upload, Download, Users } from 'lucide-react';
import { formatBytes, getYearRange } from '@/lib/utils';

interface ChartPoint {
  month: string;
  upload: number;
  download: number;
  activeUsers: number;
}

interface TopUser {
  userId: string;
  username: string;
  totalUpload: number;
  totalDownload: number;
}

interface AnalyticsData {
  chart: ChartPoint[];
  topUsers: TopUser[];
  summary: {
    totalUsers: number;
    activeUsers: number;
    totalOvpnGenerated: number;
  };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-card border border-neutral-800 rounded-lg p-3 shadow-xl">
      <p className="font-semibold mb-1 text-brand-primary">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-xs" style={{ color: p.color }}>
          {p.name}: {p.name === 'Active Users' ? p.value : `${p.value} GB`}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const years = getYearRange();
  const [year, setYear] = useState(years[0]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'bar' | 'area' | 'line'>('area');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/stats/analytics?year=${year}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [year]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const totalUploadGB = data?.chart.reduce((s, d) => s + d.upload, 0) ?? 0;
  const totalDownloadGB = data?.chart.reduce((s, d) => s + d.download, 0) ?? 0;

  return (
    <div>
      <div className="page-header flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Monthly bandwidth and usage trends</p>
        </div>
        <div className="flex gap-3 items-center">
          <label className="text-xs text-brand-secondary">Year:</label>
          <select className="select-field" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary row */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
          <div className="stat-card">
            <div className="stat-icon"><Upload size={20} /></div>
            <div className="stat-value">{totalUploadGB.toFixed(1)} <span className="text-sm text-brand-secondary font-normal">GB</span></div>
            <div className="stat-label">Total Uploaded {year}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-info/10 text-info"><Download size={20} /></div>
            <div className="stat-value">{totalDownloadGB.toFixed(1)} <span className="text-sm text-brand-secondary font-normal">GB</span></div>
            <div className="stat-label">Total Downloaded {year}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-success/10 text-success"><Users size={20} /></div>
            <div className="stat-value">{data.summary.totalUsers}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-warning/10 text-warning"><TrendingUp size={20} /></div>
            <div className="stat-value">{data.summary.totalOvpnGenerated}</div>
            <div className="stat-label">VPN Profiles</div>
          </div>
        </div>
      )}

      {/* Chart type selector */}
      <div className="flex gap-2 mb-4">
        {(['area', 'bar', 'line'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setChartType(t)}
            className={`capitalize text-xs ${chartType === t ? 'btn-primary' : 'btn-ghost'}`}
          >
            {t} chart
          </button>
        ))}
      </div>

      {/* Bandwidth chart */}
      <div className="card mb-6">
        <h2 className="text-base font-semibold mb-5">
          Monthly Bandwidth (GB) — {year}
        </h2>
        {loading ? (
          <div className="h-[280px] flex items-center justify-center text-neutral-600 text-sm">
            Loading chart...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {chartType === 'bar' ? (
              <BarChart data={data?.chart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 12 }} />
                <YAxis tick={{ fill: '#666', fontSize: 12 }} unit=" GB" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="upload" name="Upload (GB)" fill="#EA6800" radius={[4,4,0,0]} />
                <Bar dataKey="download" name="Download (GB)" fill="#3B82F6" radius={[4,4,0,0]} />
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={data?.chart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 12 }} />
                <YAxis tick={{ fill: '#666', fontSize: 12 }} unit=" GB" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="upload" name="Upload (GB)" stroke="#EA6800" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="download" name="Download (GB)" stroke="#3B82F6" strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={data?.chart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EA6800" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#EA6800" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 12 }} />
                <YAxis tick={{ fill: '#666', fontSize: 12 }} unit=" GB" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="upload" name="Upload (GB)" stroke="#EA6800" strokeWidth={2} fill="url(#colorUpload)" />
                <Area type="monotone" dataKey="download" name="Download (GB)" stroke="#3B82F6" strokeWidth={2} fill="url(#colorDownload)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Active Users chart */}
      <div className="card mb-6">
        <h2 className="text-base font-semibold mb-5">
          Active Users per Month — {year}
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data?.chart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 12 }} />
            <YAxis tick={{ fill: '#666', fontSize: 12 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="activeUsers" name="Active Users" fill="#22C55E" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Users */}
      {data?.topUsers && data.topUsers.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold mb-4">
            Top Bandwidth Users — {year}
          </h2>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Username</th>
                  <th>Upload</th>
                  <th>Download</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.topUsers.map((u, i) => (
                  <tr key={u.userId}>
                    <td className={`font-bold ${i < 3 ? 'text-primary' : 'text-brand-muted'}`}>#{i + 1}</td>
                    <td className="font-medium">{u.username}</td>
                    <td className="text-primary">{formatBytes(u.totalUpload)}</td>
                    <td className="text-info">{formatBytes(u.totalDownload)}</td>
                    <td className="font-semibold text-brand-primary">{formatBytes(u.totalUpload + u.totalDownload)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
