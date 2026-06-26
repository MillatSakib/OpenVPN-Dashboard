import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { isAdmin } from '@/lib/auth';
import { listOpenVpnClients, vpnUserId } from '@/lib/openvpn';

// GET /api/users - List all users (admin only)
export async function GET(req: NextRequest) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const users = await User.find({}).select('-password').sort({ createdAt: -1 });

  let vpnClients: ReturnType<typeof listOpenVpnClients> = [];
  try {
    vpnClients = listOpenVpnClients();
  } catch (err) {
    console.warn('Could not read OpenVPN client list:', err);
  }

  const clientsByUser = new Map<string, typeof vpnClients>();
  const mongoUsernames = new Set(users.map((u) => u.username));
  const groupedClientCNs = new Set<string>();

  // Group clients under MongoDB users
  for (const user of users) {
    const userClients = vpnClients.filter((client) => {
      const isMatch =
        client.username === user.username ||
        client.username.startsWith(user.username + '_') ||
        client.username.startsWith(user.username + '-');
      if (isMatch) {
        groupedClientCNs.add(client.username);
      }
      return isMatch;
    });
    clientsByUser.set(user.username, userClients);
  }

  // Group remaining clients under virtual users
  const unassignedClients = vpnClients.filter((c) => !groupedClientCNs.has(c.username));
  const virtualUsers = new Map<string, typeof vpnClients>();

  for (const client of unassignedClients) {
    const idx =
      client.username.indexOf('_') !== -1
        ? client.username.indexOf('_')
        : client.username.indexOf('-');
    const base = idx !== -1 ? client.username.substring(0, idx) : client.username;
    if (!virtualUsers.has(base)) {
      virtualUsers.set(base, []);
    }
    virtualUsers.get(base)!.push(client);
  }

  const mongoRows = users.map((user) => {
    const clientList = clientsByUser.get(user.username) || [];
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

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      source: clientList.length > 0 ? 'openvpn+mongodb' : 'mongodb',
      createdAt: user.createdAt,
      profiles,
    };
  });

  const virtualRows = Array.from(virtualUsers.entries()).map(([username, clientList]) => {
    const profiles = clientList.map((c) => {
      let name = 'default';
      if (c.username.startsWith(username + '_')) {
        name = c.username.slice(username.length + 1);
      } else if (c.username.startsWith(username + '-')) {
        name = c.username.slice(username.length + 1);
      }
      return {
        name,
        cn: c.username,
        status: c.status,
        ovpnGenerated: c.status === 'valid',
        expiresAt: c.expiresAt,
      };
    });

    return {
      id: vpnUserId(username),
      username,
      email: '',
      role: 'user',
      isActive: clientList.some((c) => c.status === 'valid'),
      source: 'openvpn',
      createdAt: clientList[0]?.expiresAt || new Date(),
      profiles,
    };
  });

  return NextResponse.json([...mongoRows, ...virtualRows]);
}

// POST /api/users - Create new user (admin only)
export async function POST(req: NextRequest) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const { username, email, password, role } = await req.json();

  if (!username || !email || !password) {
    return NextResponse.json(
      { message: 'Username, email and password are required' },
      { status: 400 }
    );
  }

  // Check duplicates
  const existing = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
  });
  if (existing) {
    return NextResponse.json(
      { message: 'Username or email already exists' },
      { status: 409 }
    );
  }

  const user = await User.create({
    username,
    email: email.toLowerCase(),
    password,
    role: role || 'user',
  });

  return NextResponse.json(
    {
      message: 'User created successfully',
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        ovpnGenerated: user.ovpnGenerated,
        createdAt: user.createdAt,
      },
    },
    { status: 201 }
  );
}
