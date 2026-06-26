import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import TrafficLog from '@/models/TrafficLog';
import Setting from '@/models/Setting';
import { getTokenFromRequest } from '@/lib/auth';

// GET /api/stats/my - User's own traffic data
export async function GET(req: NextRequest) {
  const payload = getTokenFromRequest(req);
  if (!payload) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year') || String(now.getFullYear()));

  await dbConnect();

  // Retrieve billing cycle start day
  const settingsDoc = await Setting.findOne();
  const startDay = settingsDoc?.billingCycleStartDay || 1;

  // Calculate current active billing month/year
  let currentMonth = now.getMonth() + 1;
  let currentYear = now.getFullYear();
  if (now.getDate() < startDay) {
    currentMonth -= 1;
    if (currentMonth === 0) {
      currentMonth = 12;
      currentYear -= 1;
    }
  }

  // Retrieve current active billing cycle traffic
  const currentMonthLog = await TrafficLog.findOne({
    userId: payload.userId,
    month: currentMonth,
    year: currentYear,
  });

  const currentMonthUpload = currentMonthLog ? currentMonthLog.bytesUploaded : 0;
  const currentMonthDownload = currentMonthLog ? currentMonthLog.bytesDownloaded : 0;

  // Calculate date range string
  const startDate = new Date(currentYear, currentMonth - 1, startDay);
  const endDate = new Date(currentYear, currentMonth - 1 + 1, startDay - 1);
  const formatDate = (d: Date) => {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  const currentMonthRange = `${formatDate(startDate)} – ${formatDate(endDate)}`;

  const logs = await TrafficLog.find({ userId: payload.userId, year }).sort({ month: 1 });

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const chart = months.map((name, idx) => {
    const found = logs.find((l) => l.month === idx + 1);
    return {
      month: name,
      upload: found ? found.bytesUploaded : 0,
      download: found ? found.bytesDownloaded : 0,
    };
  });

  // Fetch current active year logs separately for the summary cards
  const currentYearLogs = await TrafficLog.find({ userId: payload.userId, year: now.getFullYear() });
  const totalUpload = currentYearLogs.reduce((s, l) => s + l.bytesUploaded, 0);
  const totalDownload = currentYearLogs.reduce((s, l) => s + l.bytesDownloaded, 0);

  return NextResponse.json({
    chart,
    totalUpload,
    totalDownload,
    year,
    currentYear: now.getFullYear(),
    billingCycleStartDay: startDay,
    currentMonthUpload,
    currentMonthDownload,
    currentMonthRange,
  });
}
