'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Download, Upload, Activity, RefreshCw, Server } from 'lucide-react';
import { formatBytes, MONTHS } from '@/lib/utils';
import { io } from 'socket.io-client';

interface MonthStats {
  month: number;
  year: number;
  billingCycleStartDay?: number;
  totalUpload: number;
  totalDownload: number;
  users: Array<{
    username: string;
    bytesUploaded: number;
    bytesDownloaded: number;
  }>;
}

interface Summary {
  totalUsers: number;
  activeUsers: number;
  totalOvpnGenerated: number;
}

interface ActiveVpnClient {
  username: string;
  realAddress: string;
  virtualAddress: string;
  bytesReceived: number;
  bytesSent: number;
  connectedSince: string;
  uploadSpeed: number;
  downloadSpeed: number;
}

export default function AdminOverviewPage() {
  const now = new Date();
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activeClients, setActiveClients] = useState<ActiveVpnClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Socket.IO for real-time overview updates
  useEffect(() => {
    const socket = io({
      path: '/api/socket',
    });

    socket.on('connect', () => {
      console.log('Connected to real-time socket server');
    });

    socket.on('dashboard-data', (data) => {
      if (data.summary) {
        setSummary(data.summary);
      }
      if (data.activeClients) {
        setActiveClients(data.activeClients);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const query = (month !== null && year !== null) ? `?month=${month}&year=${year}` : '';
      const statsRes = await fetch(`/api/stats${query}`);
      const statsData = await statsRes.json();
      setStats(statsData);
      if (month === null || year === null) {
        setMonth(statsData.month);
        setYear(statsData.year);
      }
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const getBillingDateRangeStr = () => {
    if (!stats) return '';
    const startDay = stats.billingCycleStartDay || 1;
    const m = stats.month;
    const y = stats.year;
    
    const startDate = new Date(y, m - 1, startDay);
    const endDate = new Date(y, m - 1 + 1, startDay - 1);
    
    const formatDate = (d: Date) => {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };
    
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/stats/sync', { method: 'POST' });
      const data = await res.json();
      setSyncMsg(data.message);
      loadStats();
    } catch {
      setSyncMsg('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="page-header flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">Monitor your OpenVPN server activity</p>
        </div>
        <button
          onClick={handleSync}
          className="btn-ghost"
          disabled={syncing}
        >
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync VPN Logs'}
        </button>
      </div>

      {syncMsg && (
        <div className="alert-success mb-5">
          {syncMsg}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-7">
          <div className="stat-card">
            <div className="stat-icon"><Users size={20} /></div>
            <div className="stat-value">{summary.totalUsers}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-success/10 text-success"><Activity size={20} /></div>
            <div className="stat-value">{summary.activeUsers}</div>
            <div className="stat-label">Active Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon bg-info/10 text-info"><Server size={20} /></div>
            <div className="stat-value">{summary.totalOvpnGenerated}</div>
            <div className="stat-label">OVPN Profiles</div>
          </div>
        </div>
      )}

      {/* Live VPN Connections */}
      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            {activeClients.length > 0 ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
            ) : (
              <div className="h-2 w-2 rounded-full bg-neutral-600 animate-pulse" />
            )}
            <h2 className="text-base font-semibold text-brand-primary m-0">
              Live VPN Connections
            </h2>
          </div>
          <span className={`badge ${activeClients.length > 0 ? 'badge-green' : 'badge-blue'}`}>
            {activeClients.length} Online
          </span>
        </div>

        {activeClients.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Real Address</th>
                  <th>Virtual IP</th>
                  <th>Real-time Speed (Up / Down)</th>
                  <th>Total Session Traffic</th>
                  <th>Connected Since</th>
                </tr>
              </thead>
              <tbody>
                {activeClients.map((client) => (
                  <tr key={client.username}>
                    <td className="font-semibold text-brand-primary">{client.username}</td>
                    <td className="text-brand-secondary text-xs">{client.realAddress}</td>
                    <td className="font-medium text-primary text-xs">{client.virtualAddress}</td>
                    <td>
                      <div className="flex gap-3 text-xs">
                        <span className="flex items-center gap-1 text-primary">
                          <Upload size={12} /> {formatBytes(client.uploadSpeed)}/s
                        </span>
                        <span className="flex items-center gap-1 text-info">
                          <Download size={12} /> {formatBytes(client.downloadSpeed)}/s
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs text-brand-secondary">
                        Up: {formatBytes(client.bytesReceived)} | Down: {formatBytes(client.bytesSent)}
                      </div>
                    </td>
                    <td className="text-brand-muted text-xs">{client.connectedSince}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 px-4 text-neutral-600">
            <Activity size={32} className="mx-auto mb-2 block opacity-30 animate-pulse" />
            <p className="m-0 text-sm">No active VPN connections right now.</p>
          </div>
        )}
      </div>

      {/* Month Selector */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-brand-secondary">View traffic for:</span>
          <select
            className="select-field"
            value={month || now.getMonth() + 1}
            onChange={(e) => setMonth(parseInt(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            className="select-field"
            value={year || now.getFullYear()}
            onChange={(e) => setYear(parseInt(e.target.value))}
          >
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {stats && (
          <div className="flex gap-8 mt-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-primary" />
              <span className="text-sm text-brand-secondary">Total Upload:</span>
              <span className="font-bold text-brand-primary">{formatBytes(stats.totalUpload)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Download size={16} className="text-info" />
              <span className="text-sm text-brand-secondary">Total Download:</span>
              <span className="font-bold text-brand-primary">{formatBytes(stats.totalDownload)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-success" />
              <span className="text-sm text-brand-secondary">Active Users:</span>
              <span className="font-bold text-brand-primary">{stats.users.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Per-User Traffic Table */}
      <div className="card">
        <h2 className="text-base font-semibold mb-4 text-brand-primary">
          User Traffic — {MONTHS[(month || now.getMonth() + 1) - 1]} {year || now.getFullYear()}
          {stats && (
            <span className="text-xs text-neutral-500 font-normal ml-2">
              ({getBillingDateRangeStr()})
            </span>
          )}
        </h2>
        {loading ? (
          <div className="text-center py-8 text-neutral-600">Loading...</div>
        ) : stats && stats.users.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Username</th>
                  <th>Upload</th>
                  <th>Download</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.users.map((u, i) => (
                  <tr key={u.username}>
                    <td className="text-brand-muted">{i + 1}</td>
                    <td className="font-medium">{u.username}</td>
                    <td>
                      <span className="flex items-center gap-1.5 text-primary">
                        <Upload size={13} /> {formatBytes(u.bytesUploaded)}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 text-info">
                        <Download size={13} /> {formatBytes(u.bytesDownloaded)}
                      </span>
                    </td>
                    <td className="font-semibold text-brand-primary">
                      {formatBytes(u.bytesUploaded + u.bytesDownloaded)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 px-4 text-neutral-600">
            <Activity size={40} className="mx-auto mb-3 block opacity-40 animate-pulse" />
            <p className="m-0 text-sm">No traffic data for {MONTHS[(month || now.getMonth() + 1) - 1]} {year || now.getFullYear()}</p>
            <p className="text-xs mt-1">Sync VPN logs to populate data</p>
          </div>
        )}
      </div>
    </div>
  );
}
