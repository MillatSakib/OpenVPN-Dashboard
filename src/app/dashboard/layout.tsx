'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, LogOut, User } from 'lucide-react';

export default function UserDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [username, setUsername] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.username) router.push('/login');
        else if (data.role === 'admin') router.push('/admin');
        else setUsername(data.username);
      })
      .catch(() => router.push('/login'));
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-dark-bg text-brand-primary">
      {/* Top nav */}
      <header className="bg-[#161616] border-b border-dark-border px-4 md:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] bg-primary/15 rounded-md flex items-center justify-center">
            <Shield size={16} className="text-primary" />
          </div>
          <span className="text-sm font-bold text-brand-primary">OpenVPN</span>
          <span className="text-xs text-neutral-600 ml-1 hidden sm:inline">User Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-brand-secondary">
            <User size={14} />
            <span className="max-w-[120px] truncate" title={username}>{username}</span>
          </div>
          <button onClick={handleLogout} className="btn-ghost py-1.5 px-3 text-xs">
            <LogOut size={13} className="mr-1" /> Sign Out
          </button>
        </div>
      </header>
      <main className="py-6 px-4 md:py-8 md:px-6 max-w-3xl mx-auto">
        {children}
      </main>
    </div>
  );
}
