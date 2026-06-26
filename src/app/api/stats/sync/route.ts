import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TrafficLog from '@/models/TrafficLog';
import User from '@/models/User';
import Setting from '@/models/Setting';
import { isAdmin } from '@/lib/auth';
import fs from 'fs';

// POST /api/stats/sync - Parse OpenVPN status log and update traffic DB
// This should be called by a cron job or manually from the dashboard
export async function POST(req: NextRequest) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const statusLogPath = process.env.OPENVPN_STATUS_LOG || '/var/log/openvpn/openvpn-status.log';

  if (!fs.existsSync(statusLogPath)) {
    return NextResponse.json(
      { message: 'OpenVPN status log not found at: ' + statusLogPath },
      { status: 404 }
    );
  }

  const content = fs.readFileSync(statusLogPath, 'utf-8');
  const lines = content.split('\n');

  await dbConnect();

  const settingsDoc = await Setting.findOne();
  const startDay = settingsDoc?.billingCycleStartDay || 1;

  const now = new Date();
  let month = now.getMonth() + 1;
  let year = now.getFullYear();
  if (now.getDate() < startDay) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  let commonNameIdx = 1;
  let bytesReceivedIdx = 4;
  let bytesSentIdx = 5;

  // Dynamically detect column indices from the HEADER,CLIENT_LIST line if available
  for (const line of lines) {
    if (line.startsWith('HEADER,CLIENT_LIST')) {
      const headerParts = line.split(',');
      const cn = headerParts.indexOf('Common Name');
      const br = headerParts.indexOf('Bytes Received');
      const bs = headerParts.indexOf('Bytes Sent');
      
      // Because data rows start with "CLIENT_LIST" (omitting the "HEADER" field),
      // the indices in the data rows are shifted by -1.
      if (cn !== -1) commonNameIdx = cn - 1;
      if (br !== -1) bytesReceivedIdx = br - 1;
      if (bs !== -1) bytesSentIdx = bs - 1;
      break;
    }
  }

  const dbUsers = await User.find({}).select('username');
  const dbUsernames = dbUsers.map((u) => u.username);

  const getBaseUsername = (cn: string) => {
    if (dbUsernames.includes(cn)) return cn;
    for (const username of dbUsernames) {
      if (cn.startsWith(username + '_') || cn.startsWith(username + '-')) {
        return username;
      }
    }
    const idx = cn.indexOf('_') !== -1 ? cn.indexOf('_') : cn.indexOf('-');
    return idx !== -1 ? cn.substring(0, idx) : cn;
  };

  let updated = 0;
  let skipped = 0;

  for (const line of lines) {
    if (!line.startsWith('CLIENT_LIST')) continue;

    const parts = line.split(',');
    const maxIdx = Math.max(commonNameIdx, bytesReceivedIdx, bytesSentIdx);
    if (parts.length <= maxIdx) continue;

    const commonName = parts[commonNameIdx].trim();
    const bytesReceived = parseInt(parts[bytesReceivedIdx]) || 0; // from server's perspective = user uploaded
    const bytesSent = parseInt(parts[bytesSentIdx]) || 0;     // from server's perspective = user downloaded

    const baseUsername = getBaseUsername(commonName);
    const user = await User.findOne({ username: baseUsername });
    if (!user) { skipped++; continue; }

    await TrafficLog.findOneAndUpdate(
      { userId: user._id, month, year },
      {
        $set: {
          username: baseUsername,
          lastUpdated: now,
        },
        $max: {
          bytesUploaded: bytesReceived,
          bytesDownloaded: bytesSent,
        },
      },
      { upsert: true }
    );

    updated++;
  }

  return NextResponse.json({
    message: `Sync complete. Updated: ${updated}, Skipped: ${skipped}`,
    updated,
    skipped,
    month,
    year,
  });
}
