'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, Trash2, Download, FileKey, Search,
  ShieldCheck, User, ToggleLeft, ToggleRight, RefreshCw,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface UserProfile {
  name: string;
  cn: string;
  status: string;
  ovpnGenerated: boolean;
  expiresAt?: string;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  source?: 'openvpn' | 'mongodb' | 'openvpn+mongodb';
  vpnStatus?: string;
  profiles: UserProfile[];
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // Edit user modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editForm, setEditForm] = useState({ email: '', password: '' });
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Add profile modal states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileUser, setProfileUser] = useState<UserData | null>(null);
  const [profileForm, setProfileForm] = useState({ suffix: '' });
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // Active/deactive warning modal states
  const [showActiveModal, setShowActiveModal] = useState(false);
  const [activeTargetUser, setActiveTargetUser] = useState<UserData | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/users');
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreateUser = async () => {
    setFormError('');
    if (!form.username || !form.email || !form.password) {
      setFormError('All fields are required');
      return;
    }
    setFormLoading(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setFormLoading(false);
    if (!res.ok) { setFormError(data.message); return; }
    setShowModal(false);
    setForm({ username: '', email: '', password: '', role: 'user' });
    setActionMsg('User created successfully!');
    loadUsers();
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    setDeleteConfirm(null);
    if (res.ok) {
      setActionMsg('User deleted.');
      loadUsers();
      setTimeout(() => setActionMsg(''), 3000);
    } else {
      setActionMsg('Error: ' + data.message);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    setActionMsg(current ? 'Deactivating user...' : 'Activating user...');
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current }),
      });
      if (res.ok) {
        setActionMsg(current ? 'User deactivated successfully' : 'User activated successfully');
        loadUsers();
      } else {
        const data = await res.json();
        setActionMsg('Error: ' + data.message);
      }
    } catch {
      setActionMsg('Error: Failed to toggle user status');
    } finally {
      setTimeout(() => setActionMsg(''), 3000);
    }
  };

  const handleGenerateOvpn = async (id: string, profileName = '') => {
    if (profileName) {
      setProfileLoading(true);
      setProfileError('');
    } else {
      setGeneratingId(id);
    }

    try {
      const res = await fetch(`/api/ovpn/generate/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileName }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setActionMsg(data.message);
        setShowProfileModal(false);
        setProfileForm({ suffix: '' });
        loadUsers();
      } else {
        if (profileName) {
          setProfileError(data.message);
        } else {
          setActionMsg('Error: ' + data.message);
        }
      }
    } catch {
      if (profileName) {
        setProfileError('Failed to generate profile');
      } else {
        setActionMsg('Error: Connection failed');
      }
    } finally {
      setGeneratingId(null);
      setProfileLoading(false);
      setTimeout(() => setActionMsg(''), 4000);
    }
  };

  const handleDownloadOvpn = async (id: string, username: string, cn: string) => {
    const res = await fetch(`/api/ovpn/generate/${id}?cn=${cn}`);
    if (!res.ok) { setActionMsg('File not found. Generate first.'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cn}.ovpn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openEditModal = (user: UserData) => {
    setEditingUser(user);
    setEditForm({ email: user.email, password: '' });
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    setEditError('');
    setEditLoading(true);
 
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: editForm.email,
          password: editForm.password || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowEditModal(false);
        setActionMsg('User updated successfully!');
        loadUsers();
        setTimeout(() => setActionMsg(''), 3000);
      } else {
        setEditError(data.message);
      }
    } catch {
      setEditError('Failed to update user');
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggleClick = (user: UserData) => {
    setActiveTargetUser(user);
    setShowActiveModal(true);
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Create, manage, and provision VPN users</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadUsers} className="btn-ghost"><RefreshCw size={15} /></button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <UserPlus size={16} /> Add User
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="alert-success mb-4">{actionMsg}</div>
      )}

      {/* Search */}
      <div className="relative mb-5 w-full max-w-[380px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          className="input-field pl-9"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-neutral-600">Loading users...</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Source</th>
                <th>VPN Config Profiles</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div>
                      <div className="font-semibold">{user.username}</div>
                      <div className="text-xs text-brand-muted mt-0.5 block">
                        {user.email || 'No dashboard metadata'}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${user.role === 'admin' ? 'badge-orange' : 'badge-blue'}`}>
                      {user.role === 'admin' ? <ShieldCheck size={11} className="mr-1" /> : <User size={11} className="mr-1" />}
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => user.source !== 'openvpn' && handleToggleClick(user)}
                      disabled={user.source === 'openvpn'}
                      className={`flex items-center gap-1.5 focus:outline-none ${user.source === 'openvpn' ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {user.isActive ? (
                        <><ToggleRight size={20} className="text-success" /><span className="badge badge-green">Active</span></>
                      ) : (
                        <><ToggleLeft size={20} className="text-neutral-600" /><span className="badge badge-red">Disabled</span></>
                      )}
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${user.source?.includes('openvpn') ? 'badge-blue' : 'badge-orange'}`}>
                      {user.source === 'openvpn+mongodb'
                        ? 'VPN + DB'
                        : user.source === 'openvpn'
                          ? 'VPN'
                          : 'DB'}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1.5 items-start w-full max-w-[220px]">
                      {user.profiles && user.profiles.length > 0 ? (
                        user.profiles.map((profile) => (
                          <div key={profile.cn} className="flex items-center gap-1.5 bg-[#1C1C1C] px-2 py-1 rounded w-full justify-between border border-neutral-900">
                            <span className="text-xs text-brand-primary font-medium truncate flex-1 mr-1" title={profile.cn}>
                              {profile.name}
                            </span>
                            <button
                              className="btn-ghost py-0.5 px-1.5 text-[11px]"
                              onClick={() => handleDownloadOvpn(user.id, user.username, profile.cn)}
                              title={`Download ${profile.cn}.ovpn`}
                            >
                              <Download size={11} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-neutral-600">No profiles</span>
                      )}
                      
                      {user.source !== 'openvpn' && (
                        <button
                          className="btn-primary w-full justify-center gap-1 py-1.5 px-3 text-[11px] font-semibold"
                          onClick={() => {
                            setProfileUser(user);
                            setProfileForm({ suffix: '' });
                            setProfileError('');
                            setShowProfileModal(true);
                          }}
                        >
                          <FileKey size={11} /> + Add Profile
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="text-brand-muted text-xs">{formatDate(user.createdAt)}</td>
                  <td>
                    <div className="flex gap-1.5 items-center">
                      {user.source !== 'openvpn' && (
                        <button
                          className="btn-ghost p-1.5"
                          onClick={() => openEditModal(user)}
                          title="Edit email/password"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                      )}
                      {deleteConfirm === user.id ? (
                        <div className="flex gap-1 items-center">
                          <span className="text-[11px] text-brand-secondary">Confirm?</span>
                          <button className="btn-danger text-[11px] py-1 px-2" onClick={() => handleDelete(user.id)}>Yes</button>
                          <button className="btn-ghost text-[11px] py-1 px-2" onClick={() => setDeleteConfirm(null)}>No</button>
                        </div>
                      ) : (
                        <button
                          className="btn-danger p-1.5"
                          onClick={() => setDeleteConfirm(user.id)}
                          title="Delete user"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-neutral-600 py-12">
                    {search ? 'No users match your search.' : 'No users found. Create one!'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-5 text-brand-primary">
              Create New User
            </h2>

            {formError && <div className="alert-error mb-4">{formError}</div>}

            <div className="mb-4">
              <label className="label">Username</label>
              <input className="input-field" placeholder="john_doe" value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="mb-4">
              <label className="label">Email</label>
              <input className="input-field" type="email" placeholder="john@example.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="mb-4">
              <label className="label">Password</label>
              <input className="input-field" type="password" placeholder="Minimum 6 characters" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="mb-6">
              <label className="label">Role</label>
              <select className="select-field w-full" value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreateUser} disabled={formLoading}>
                {formLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-5 text-brand-primary">
              Edit User: <span className="text-primary">{editingUser.username}</span>
            </h2>

            {editError && <div className="alert-error mb-4">{editError}</div>}

            <div className="mb-4">
              <label className="label">Email</label>
              <input className="input-field" type="email" placeholder="john@example.com" value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="mb-6">
              <label className="label">New Password</label>
              <input className="input-field" type="password" placeholder="Leave blank to keep unchanged" value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
              <span className="text-xs text-brand-muted mt-1 block">
                Minimum 6 characters if changing
              </span>
            </div>

            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleEditUser} disabled={editLoading}>
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active/Deactive Warning Modal */}
      {showActiveModal && activeTargetUser && (
        <div className="modal-backdrop" onClick={() => setShowActiveModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-5 text-brand-primary">
              ⚠️ Warning: {activeTargetUser.isActive ? 'Deactivate' : 'Activate'} User
            </h2>
            <p className="text-sm text-brand-secondary leading-relaxed mb-6">
              Are you sure you want to {activeTargetUser.isActive ? 'deactivate' : 'activate'}{' '}
              <strong>{activeTargetUser.username}</strong>?
              <br />
              <br />
              {activeTargetUser.isActive ? (
                <span className="text-danger">
                  This will temporarily block/revoke all OpenVPN profiles for this user, causing their current VPN connections to be terminated instantly.
                </span>
              ) : (
                <span className="text-success">
                  This will restore and un-revoke all their profiles in OpenVPN, enabling them to connect to the VPN again.
                </span>
              )}
            </p>

            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => setShowActiveModal(false)}>Cancel</button>
              <button
                className={activeTargetUser.isActive ? 'btn-danger' : 'btn-primary'}
                onClick={() => {
                  toggleActive(activeTargetUser.id, activeTargetUser.isActive);
                  setShowActiveModal(false);
                }}
              >
                Yes, {activeTargetUser.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Profile Modal */}
      {showProfileModal && profileUser && (
        <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-5 text-brand-primary">
              Create OVPN Profile for <span className="text-primary">{profileUser.username}</span>
            </h2>

            {profileError && <div className="alert-error mb-4">{profileError}</div>}

            <div className="mb-6">
              <label className="label">Profile Suffix / Name</label>
              <input className="input-field" placeholder="e.g. phone, laptop, work" value={profileForm.suffix}
                onChange={(e) => setProfileForm({ suffix: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} />
              <span className="text-xs text-brand-muted mt-1.5 block leading-relaxed">
                Optional. Leave blank to generate the default config <code className="text-neutral-400 font-mono">{profileUser.username}.ovpn</code>.
                <br />
                Enter a suffix to generate <code className="text-neutral-400 font-mono">{profileUser.username}_&lt;suffix&gt;.ovpn</code>.
              </span>
            </div>

            <div className="flex gap-3 justify-end">
              <button className="btn-ghost" onClick={() => setShowProfileModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => handleGenerateOvpn(profileUser.id, profileForm.suffix)} disabled={profileLoading}>
                {profileLoading ? 'Generating...' : 'Generate Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
