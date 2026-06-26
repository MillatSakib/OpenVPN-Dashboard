'use client';

import { useState, useEffect } from 'react';
import { Server, RefreshCw, Info, Calendar } from 'lucide-react';

export default function SettingsPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  
  const [billingCycleStartDay, setBillingCycleStartDay] = useState(1);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setBillingCycleStartDay(data.billingCycleStartDay || 1);
        setLoadingSettings(false);
      })
      .catch((err) => {
        console.error('Failed to load settings', err);
        setLoadingSettings(false);
      });
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult('');
    const res = await fetch('/api/stats/sync', { method: 'POST' });
    const data = await res.json();
    setSyncResult(data.message);
    setSyncing(false);
  };

  const handleSaveBillingCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');
    setSaveError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingCycleStartDay }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMessage('Billing cycle settings saved successfully!');
      } else {
        setSaveError(data.message || 'Failed to save billing cycle settings.');
      }
    } catch {
      setSaveError('An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Server configuration and maintenance</p>
      </div>

      {/* Billing Cycle Section */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={18} className="text-primary" />
          <h2 className="text-base font-semibold m-0">
            Billing Cycle Settings
          </h2>
        </div>
        <p className="text-sm text-brand-secondary mb-5">
          Configure the traffic billing cycle start day. The bandwidth and usage metrics on the dashboard will align with this billing cycle. By default, it starts on the 1st of every month.
        </p>
        <form onSubmit={handleSaveBillingCycle} className="flex flex-col gap-4 max-w-[400px]">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-brand-secondary font-medium">
              Start Day of Month
            </label>
            <select
              className="select-field w-full"
              value={billingCycleStartDay}
              onChange={(e) => setBillingCycleStartDay(parseInt(e.target.value))}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  Day {day} (Cycle: {day} to {day === 1 ? 'End of Month' : `Day ${day - 1} of next month`})
                </option>
              ))}
            </select>
          </div>
          
          {saveMessage && (
            <div className="alert-success py-2 px-3 text-xs">
              {saveMessage}
            </div>
          )}
          {saveError && (
            <div className="alert-error py-2 px-3 text-xs">
              {saveError}
            </div>
          )}
          
          <button type="submit" className="btn-primary flex gap-2 items-center w-fit" disabled={saving || loadingSettings}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>

      {/* Sync Section */}
      <div className="card mb-6">
        <h2 className="text-base font-semibold mb-2">
          VPN Log Sync
        </h2>
        <p className="text-sm text-brand-secondary mb-4">
          Parse the OpenVPN status log and update traffic statistics in MongoDB.
          Run this manually or configure a cron job to automate.
        </p>
        <div className="bg-[#0D0D0D] border border-dark-border rounded-lg p-4 mb-4 font-mono text-xs text-brand-secondary overflow-x-auto whitespace-pre-wrap">
          # Add to crontab for auto-sync every 5 minutes<br />
          */5 * * * * curl -X POST -H &quot;Cookie: token=YOUR_ADMIN_TOKEN&quot; http://localhost:3000/api/stats/sync
        </div>
        {syncResult && (
          <div className="alert-success mb-4">{syncResult}</div>
        )}
        <button onClick={handleSync} className="btn-primary" disabled={syncing}>
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* Environment Info */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Server size={18} className="text-primary" />
          <h2 className="text-base font-semibold m-0">Environment Variables Reference</h2>
        </div>
        <p className="text-xs text-brand-muted mb-4">
          Configure these in your <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-primary text-xs font-mono">.env</code> file:
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            { key: 'MONGODB_URI', desc: 'MongoDB connection string' },
            { key: 'JWT_SECRET', desc: 'Secret for signing JWT tokens' },
            { key: 'OVPN_OUTPUT_PATH', desc: 'Directory where .ovpn files are stored' },
            { key: 'EASY_RSA_PATH', desc: 'Path to EasyRSA installation' },
            { key: 'OVPN_BASE_CONFIG', desc: 'Base OpenVPN client config template' },
            { key: 'OPENVPN_STATUS_LOG', desc: 'Path to openvpn-status.log' },
          ].map((item) => (
            <div key={item.key} className="flex flex-col sm:flex-row gap-2 sm:gap-4 bg-[#0D0D0D] p-3 rounded-lg border border-neutral-900">
              <code className="text-primary font-mono text-xs sm:w-52 flex-shrink-0">{item.key}</code>
              <span className="text-xs text-brand-muted">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="flex gap-2 items-start text-xs text-brand-muted p-4 bg-[#161616] border border-neutral-800 rounded-lg">
        <Info size={15} className="mt-0.5 flex-shrink-0 text-info" />
        <p className="m-0 leading-relaxed">
          For automated traffic collection, consider setting up a cron job that reads{' '}
          <code className="text-brand-secondary font-mono">openvpn-status.log</code> and calls the sync endpoint.
          The dashboard reads from MongoDB — data is only as fresh as your last sync.
        </p>
      </div>
    </div>
  );
}
