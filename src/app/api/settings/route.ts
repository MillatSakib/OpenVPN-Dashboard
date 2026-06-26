import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Setting from '@/models/Setting';
import { isAdmin } from '@/lib/auth';

// GET /api/settings
export async function GET(req: NextRequest) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({ billingCycleStartDay: 1 });
  }

  return NextResponse.json(settings);
}

// PATCH /api/settings
export async function PATCH(req: NextRequest) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();

  if (typeof body.billingCycleStartDay !== 'number' || body.billingCycleStartDay < 1 || body.billingCycleStartDay > 31) {
    return NextResponse.json(
      { message: 'Billing cycle start day must be between 1 and 31' },
      { status: 400 }
    );
  }

  let settings = await Setting.findOne();
  if (!settings) {
    settings = new Setting();
  }

  settings.billingCycleStartDay = body.billingCycleStartDay;
  await settings.save();

  return NextResponse.json({
    message: 'Settings updated successfully',
    settings,
  });
}
