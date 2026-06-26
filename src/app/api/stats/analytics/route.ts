import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TrafficLog from '@/models/TrafficLog';
import User from '@/models/User';
import { isAdmin } from '@/lib/auth';
import { listOpenVpnClients } from '@/lib/openvpn';

// GET /api/stats/analytics?year=2025
export async function GET(req: NextRequest) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

  await dbConnect();

  // Monthly aggregated data for charts
  const monthlyData = await TrafficLog.aggregate([
    { $match: { year } },
    {
      $group: {
        _id: '$month',
        totalUpload: { $sum: '$bytesUploaded' },
        totalDownload: { $sum: '$bytesDownloaded' },
        activeUsers: { $addToSet: '$userId' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const chart = months.map((name, idx) => {
    const found = monthlyData.find((m) => m._id === idx + 1);
    return {
      month: name,
      upload: found ? Math.round(found.totalUpload / (1024 * 1024 * 1024) * 100) / 100 : 0,
      download: found ? Math.round(found.totalDownload / (1024 * 1024 * 1024) * 100) / 100 : 0,
      activeUsers: found ? found.activeUsers.length : 0,
    };
  });

  // Top users overall for the year
  const topUsers = await TrafficLog.aggregate([
    { $match: { year } },
    {
      $group: {
        _id: { userId: '$userId', username: '$username' },
        totalUpload: { $sum: '$bytesUploaded' },
        totalDownload: { $sum: '$bytesDownloaded' },
      },
    },
    { $sort: { totalDownload: -1 } },
    { $limit: 10 },
  ]);

  const mongoUsers = await User.find({});
  let vpnClients: any[] = [];
  try {
    vpnClients = listOpenVpnClients();
  } catch (err) {
    console.warn('Could not read OpenVPN client list:', err);
  }

  const mongoUsersByUsername = new Map(mongoUsers.map((u) => [u.username, u]));
  const vpnUsernames = new Set(vpnClients.map((c) => c.username));

  const vpnRows = vpnClients.map((client) => {
    const metadata = mongoUsersByUsername.get(client.username);
    return {
      username: client.username,
      role: metadata ? metadata.role : 'user',
      isActive: client.status === 'valid' && (metadata ? metadata.isActive !== false : true),
      ovpnGenerated: client.status === 'valid'
    };
  });

  const metadataOnlyRows = mongoUsers
    .filter((u) => !vpnUsernames.has(u.username))
    .map((u) => ({
      username: u.username,
      role: u.role || 'user',
      isActive: u.isActive !== false,
      ovpnGenerated: u.ovpnGenerated === true
    }));

  const allMergedUsers = [...vpnRows, ...metadataOnlyRows];
  const regularUsers = allMergedUsers.filter((u) => u.role !== 'admin');

  const totalUsers = regularUsers.length;
  const activeUsers = regularUsers.filter((u) => u.isActive).length;
  const totalOvpnGenerated = allMergedUsers.filter((u) => u.ovpnGenerated).length;

  return NextResponse.json({
    year,
    chart,
    topUsers: topUsers.map((u) => ({
      userId: u._id.userId.toString(),
      username: u._id.username,
      totalUpload: u.totalUpload,
      totalDownload: u.totalDownload,
    })),
    summary: {
      totalUsers,
      activeUsers,
      totalOvpnGenerated,
    },
  });
}
