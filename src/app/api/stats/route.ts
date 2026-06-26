import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TrafficLog from '@/models/TrafficLog';
import User from '@/models/User';
import Setting from '@/models/Setting';
import { isAdmin } from '@/lib/auth';

// GET /api/stats?month=6&year=2025
export async function GET(req: NextRequest) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();

  const settingsDoc = await Setting.findOne();
  const startDay = settingsDoc?.billingCycleStartDay || 1;

  const { searchParams } = new URL(req.url);
  const now = new Date();

  let defaultMonth = now.getMonth() + 1;
  let defaultYear = now.getFullYear();
  if (now.getDate() < startDay) {
    defaultMonth -= 1;
    if (defaultMonth === 0) {
      defaultMonth = 12;
      defaultYear -= 1;
    }
  }

  const month = parseInt(searchParams.get('month') || String(defaultMonth));
  const year = parseInt(searchParams.get('year') || String(defaultYear));

  const dbUsers = await User.find({}).select('_id username role');
  const logs = await TrafficLog.find({ month, year });

  const logsMap = new Map(logs.map(l => [l.username, l]));
  const userMap = new Map(dbUsers.map(u => [u.username, u]));

  const usersList: Array<{
    userId: string;
    username: string;
    bytesUploaded: number;
    bytesDownloaded: number;
    lastUpdated: Date | null;
  }> = [];

  // Add DB users (all regular users, and admins only if they have traffic logs)
  for (const u of dbUsers) {
    const log = logsMap.get(u.username);
    if (u.role === 'admin') {
      if (log) {
        usersList.push({
          userId: u._id.toString(),
          username: u.username,
          bytesUploaded: log.bytesUploaded,
          bytesDownloaded: log.bytesDownloaded,
          lastUpdated: log.lastUpdated,
        });
      }
    } else {
      usersList.push({
        userId: u._id.toString(),
        username: u.username,
        bytesUploaded: log ? log.bytesUploaded : 0,
        bytesDownloaded: log ? log.bytesDownloaded : 0,
        lastUpdated: log ? log.lastUpdated : null,
      });
    }
  }

  // Include any traffic logs for users not present in the DB
  for (const log of logs) {
    if (!userMap.has(log.username)) {
      usersList.push({
        userId: log.userId.toString(),
        username: log.username,
        bytesUploaded: log.bytesUploaded,
        bytesDownloaded: log.bytesDownloaded,
        lastUpdated: log.lastUpdated,
      });
    }
  }

  const totalUpload = logs.reduce((sum, l) => sum + l.bytesUploaded, 0);
  const totalDownload = logs.reduce((sum, l) => sum + l.bytesDownloaded, 0);

  // Sort by total traffic descending
  usersList.sort(
    (a, b) =>
      b.bytesDownloaded + b.bytesUploaded - (a.bytesDownloaded + a.bytesUploaded)
  );

  return NextResponse.json({
    month,
    year,
    billingCycleStartDay: startDay,
    totalUpload,
    totalDownload,
    users: usersList,
  });
}
