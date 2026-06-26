import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import TrafficLog from '@/models/TrafficLog';
import { isAdmin } from '@/lib/auth';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  assertSafeClientName,
  getEasyRsaPath,
  usernameFromVpnUserId,
  listOpenVpnClients,
  updateClientCertStatus,
  syncCrlFile,
} from '@/lib/openvpn';

const execFileAsync = promisify(execFile);

// GET /api/users/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const user = await User.findById(params.id).select('-password');
  if (!user) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    ovpnGenerated: user.ovpnGenerated,
    createdAt: user.createdAt,
  });
}

// PATCH /api/users/[id] - update isActive or role
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();

  const user = await User.findById(params.id);
  if (!user) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  if (typeof body.isActive === 'boolean') {
    user.isActive = body.isActive;

    // Find all profiles (certificates) for this user and activate/deactivate them!
    let vpnClients: any[] = [];
    try {
      vpnClients = listOpenVpnClients();
    } catch (err) {
      console.warn('Could not read OpenVPN client list:', err);
    }

    const matchingCNs = vpnClients
      .map((c) => c.username)
      .filter(
        (cn) =>
          cn === user.username ||
          cn.startsWith(user.username + '_') ||
          cn.startsWith(user.username + '-')
      );

    for (const cn of matchingCNs) {
      try {
        await updateClientCertStatus(cn, body.isActive);
      } catch (err) {
        console.error(`Failed to update cert status for ${cn}:`, err);
      }
    }
  }

  if (body.role && ['admin', 'user'].includes(body.role)) user.role = body.role;

  if (body.email && typeof body.email === 'string') {
    const emailLower = body.email.toLowerCase().trim();
    if (emailLower !== user.email) {
      const existing = await User.findOne({ email: emailLower });
      if (existing) {
        return NextResponse.json({ message: 'Email already in use' }, { status: 409 });
      }
      user.email = emailLower;
    }
  }

  if (body.password && typeof body.password === 'string') {
    if (body.password.length < 6) {
      return NextResponse.json(
        { message: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }
    user.password = body.password; // Triggers the pre-save bcrypt hashing hook
  }

  await user.save();

  return NextResponse.json({
    message: 'User updated successfully',
    user: {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    }
  });
}

// DELETE /api/users/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const vpnUsername = usernameFromVpnUserId(params.id);
  const user = vpnUsername
    ? await User.findOne({ username: vpnUsername })
    : await User.findById(params.id);

  if (!user) {
    if (!vpnUsername) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
  }

  // Revoke OpenVPN cert if it was generated
  const username = vpnUsername || user.username;
  if (vpnUsername || user.ovpnGenerated) {
    try {
      assertSafeClientName(username);
      const easyRsaPath = getEasyRsaPath();
      await execFileAsync('./easyrsa', ['--batch', 'revoke', username], {
        cwd: easyRsaPath,
      });
      await execFileAsync('./easyrsa', ['gen-crl'], { cwd: easyRsaPath });
      await syncCrlFile();
    } catch (err) {
      console.warn('Could not revoke cert (may not exist on server):', err);
    }
  }

  if (user) {
    await User.findByIdAndDelete(user._id);
    await TrafficLog.deleteMany({ userId: user._id });
  }

  return NextResponse.json({ message: 'User deleted successfully' });
}
