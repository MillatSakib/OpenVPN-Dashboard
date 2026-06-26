import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getTokenFromRequest } from '@/lib/auth';
import { listOpenVpnClients } from '@/lib/openvpn';

export async function GET(req: NextRequest) {
  const payload = getTokenFromRequest(req);
  if (!payload) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  await dbConnect();
  const user = await User.findById(payload.userId).select('-password');
  if (!user) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  let vpnClients: any[] = [];
  try {
    vpnClients = listOpenVpnClients();
  } catch (err) {
    console.warn('Could not read OpenVPN client list in auth/me:', err);
  }

  const clientList = vpnClients.filter((client) => {
    return (
      client.username === user.username ||
      client.username.startsWith(user.username + '_') ||
      client.username.startsWith(user.username + '-')
    );
  });

  const profiles = clientList.map((c) => {
    let name = 'default';
    if (c.username.startsWith(user.username + '_')) {
      name = c.username.slice(user.username.length + 1);
    } else if (c.username.startsWith(user.username + '-')) {
      name = c.username.slice(user.username.length + 1);
    }
    return {
      name,
      cn: c.username,
      status: c.status,
      ovpnGenerated: c.status === 'valid',
      expiresAt: c.expiresAt,
    };
  });

  return NextResponse.json({
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    ovpnGenerated: user.ovpnGenerated || profiles.some((p) => p.ovpnGenerated),
    profiles,
    createdAt: user.createdAt,
  });
}
