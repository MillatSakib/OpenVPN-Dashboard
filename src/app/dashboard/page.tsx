'use client';

import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Upload, Download, Wifi, FileDown, CheckCircle, XCircle, Shield } from 'lucide-react';
import { formatBytes, getYearRange } from '@/lib/utils';

interface UserProfile {
  name: string;
  cn: string;
  status: string;
  ovpnGenerated: boolean;
  expiresAt?: string;
}

interface UserInfo {
  id: string;
  username: string;
  email: string;
  isActive: boolean;
  ovpnGenerated: boolean;
  profiles?: UserProfile[];
  createdAt: string;
}

interface ChartPoint { month: string; upload: number; download: number; }

interface MyStats {
  chart: ChartPoint[];
  totalUpload: number;
  totalDownload: number;
  year: number;
  currentYear: number;
  billingCycleStartDay: number;
  currentMonthUpload: number;
  currentMonthDownload: number;
  currentMonthRange: string;
}

export default function UserDashboardPage() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const years = getYearRange();
  const [year, setYear] = useState(years[0]);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, statsRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch(`/api/stats/my?year=${year}`),
      ]);
      const me = await meRes.json();
      const st = await statsRes.json();
      setUserInfo(me);
      setStats(st);
    } catch (err) {
      console.error('Failed to load user stats:', err);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="animate-pulse">
        {/* Welcome Skeleton */}
        <div className="mb-7">
          <div className="bg-neutral-800 w-[220px] h-[1.8rem] rounded mb-2" />
          <div className="bg-neutral-800 w-[300px] h-4 rounded" />
        </div>

        {/* Account card Skeleton */}
        <div className="card mb-5">
          <div className="flex flex-col md:flex-row items-start justify-between gap-4">
            <div className="flex-1 w-full min-w-[250px]">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-neutral-800 w-[18px] h-[18px] rounded-full" />
                <div className="bg-neutral-800 w-[120px] h-[1.1rem] rounded" />
              </div>
              <div className="grid gap-3 mt-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <div className="bg-neutral-800 w-20 h-[0.95rem] rounded" />
                    <div className="bg-neutral-800 w-[150px] h-[0.95rem] rounded" />
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full md:w-auto md:min-w-[280px]">
              <div className="bg-neutral-800 w-[120px] h-[1.1rem] rounded mb-3" />
              <div className="flex flex-col gap-2">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-neutral-800 w-full h-10 rounded-md" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats summary Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="card bg-neutral-800 h-[74px]" />
          <div className="card bg-neutral-800 h-[74px]" />
        </div>

        {/* Chart Skeleton */}
        <div className="card h-[280px] flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div className="bg-neutral-800 w-[150px] h-4 rounded" />
            <div className="bg-neutral-800 w-20 h-8 rounded" />
          </div>
          <div className="bg-neutral-800 w-full flex-1 my-4 rounded-md" />
        </div>
      </div>
    );
  }

  const handleDownloadOvpn = async (cn?: string) => {
    if (!userInfo) return;
    setDownloading(true);
    const targetCN = cn || userInfo.username;
    const res = await fetch(`/api/ovpn/generate/${userInfo.id}?cn=${targetCN}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${targetCN}.ovpn`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setDownloading(false);
  };

  return (
    <div>
      {/* Welcome */}
      <div className="mb-7">
        <h1 className="text-xl font-bold text-brand-primary">
          Welcome back, <span className="text-primary">{userInfo?.username}</span>
        </h1>
        <p className="text-xs text-brand-muted mt-1">
          Your VPN account information and usage statistics
        </p>
      </div>

      {/* Account card */}
      <div className="card mb-5">
        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={18} className="text-primary" />
              <span className="font-semibold text-sm">Account Details</span>
            </div>
            <div className="grid gap-2">
              <div className="flex gap-2 text-sm">
                <span className="text-brand-muted w-24 flex-shrink-0">Username:</span>
                <span className="text-brand-primary font-medium">{userInfo?.username}</span>
              </div>
              <div className="flex gap-2 text-sm">
                <span className="text-brand-muted w-24 flex-shrink-0">Email:</span>
                <span className="text-brand-primary font-medium truncate">{userInfo?.email}</span>
              </div>
              <div className="flex gap-2 text-sm items-center">
                <span className="text-brand-muted w-24 flex-shrink-0">Status:</span>
                {userInfo?.isActive ? (
                  <span className="flex items-center gap-1 text-success font-medium">
                    <CheckCircle size={14} /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-danger font-medium">
                    <XCircle size={14} /> Disabled
                  </span>
                )}
              </div>
              <div className="flex gap-2 text-sm items-center">
                <span className="text-brand-muted w-24 flex-shrink-0">VPN Config:</span>
                {userInfo?.ovpnGenerated ? (
                  <span className="badge badge-green"><Wifi size={11} className="mr-1" /> Ready</span>
                ) : (
                  <span className="badge badge-red">Not Generated</span>
                )}
              </div>
            </div>
          </div>

          {/* Download OVPN Profiles */}
          <div className="w-full md:w-auto md:min-w-[280px] flex flex-col gap-3">
            <span className="text-xs text-brand-muted font-semibold uppercase tracking-wider">Your OVPN Profiles</span>
            {userInfo?.profiles && userInfo.profiles.length > 0 ? (
              <div className="flex flex-col gap-2">
                {userInfo.profiles.map((profile) => (
                  <div
                    key={profile.cn}
                    className="flex items-center justify-between bg-[#1A1A1A] border border-dark-border rounded-md p-3 gap-4"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-brand-primary truncate">
                        {profile.name}
                      </span>
                      <span className="text-xs text-brand-muted mt-0.5 truncate">
                        {profile.cn}.ovpn
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`badge ${profile.status === 'valid' ? 'badge-green' : 'badge-red'} text-xs px-2 py-0.5`}>
                        {profile.status}
                      </span>
                      
                      {profile.status === 'valid' && (
                        <button
                          onClick={() => handleDownloadOvpn(profile.cn)}
                          className="btn-ghost p-1.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 hover:text-primary-light"
                          title={`Download ${profile.cn}.ovpn`}
                          disabled={downloading}
                        >
                          <FileDown size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-600 leading-relaxed">
                No VPN profiles have been generated for you yet. Please contact your system administrator.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="flex flex-col gap-6 mb-6">
          {/* Current Billing Month Section */}
          <div>
            <h3 className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">
              Current Month ({stats.currentMonthRange})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="stat-card">
                <div className="stat-icon bg-primary/15 text-primary"><Upload size={18} /></div>
                <div className="stat-value text-xl">{formatBytes(stats.currentMonthUpload)}</div>
                <div className="stat-label">Uploaded this month</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon bg-info/15 text-info"><Download size={18} /></div>
                <div className="stat-value text-xl">{formatBytes(stats.currentMonthDownload)}</div>
                <div className="stat-label">Downloaded this month</div>
              </div>
            </div>
          </div>

          {/* Current Year Section */}
          <div>
            <h3 className="text-xs font-semibold text-info mb-3 uppercase tracking-wider">
              Current Year ({stats.currentYear})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="stat-card">
                <div className="stat-icon"><Upload size={18} /></div>
                <div className="stat-value text-xl">{formatBytes(stats.totalUpload)}</div>
                <div className="stat-label">Total uploaded this year</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon bg-info/10 text-info"><Download size={18} /></div>
                <div className="stat-value text-xl">{formatBytes(stats.totalDownload)}</div>
                <div className="stat-label">Total downloaded this year</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Usage chart */}
      <div className="card">
        <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold m-0 text-brand-primary">My Bandwidth Usage</h2>
            {stats && (
              <p className="text-xs text-brand-muted mt-1 m-0">
                Monthly usage resets on day {stats.billingCycleStartDay} of each month
              </p>
            )}
          </div>
          <select className="select-field" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={stats?.chart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="uGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EA6800" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#EA6800" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="dGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E1E1E" />
            <XAxis dataKey="month" tick={{ fill: '#555', fontSize: 12 }} />
            <YAxis tick={{ fill: '#555', fontSize: 11 }} tickFormatter={(v) => formatBytes(v, 0)} />
            <Tooltip
              formatter={(val: number, name: string) => [formatBytes(val), name === 'upload' ? 'Upload' : 'Download']}
              contentStyle={{ background: '#1C1C1C', border: '1px solid #333', borderRadius: 8 }}
              labelStyle={{ color: '#F5F5F5' }}
            />
            <Area type="monotone" dataKey="upload" stroke="#EA6800" strokeWidth={2} fill="url(#uGrad)" />
            <Area type="monotone" dataKey="download" stroke="#3B82F6" strokeWidth={2} fill="url(#dGrad)" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-6 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-xs text-brand-secondary">
            <div className="w-2.5 h-1 bg-primary rounded-sm" /> Upload
          </div>
          <div className="flex items-center gap-1.5 text-xs text-brand-secondary">
            <div className="w-2.5 h-1 bg-info rounded-sm" /> Download
          </div>
        </div>
      </div>
    </div>
  );
}
