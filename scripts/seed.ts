/**
 * Seed script: Creates the first admin user
 * Run with: npx ts-node --project tsconfig.json scripts/seed.ts
 * Or: node -e "require('./scripts/seed.js')"
 *
 * Usage:
 *   ADMIN_DEFAULT_EMAIL=admin@vpn.local ADMIN_DEFAULT_PASSWORD=Admin@1234 npx ts-node scripts/seed.ts
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/openvpn-dashboard';
const ADMIN_EMAIL = process.env.ADMIN_DEFAULT_EMAIL || 'admin@vpn.local';
const ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@1234';
const ADMIN_USERNAME = 'admin';

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection did not provide a database handle');
  }

  const usersCollection = db.collection('users');

  const existing = await usersCollection.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`Admin user already exists: ${ADMIN_EMAIL}`);
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await usersCollection.insertOne({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    password: hashedPassword,
    role: 'admin',
    isActive: true,
    ovpnGenerated: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`✅ Admin user created:`);
  console.log(`   Email: ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   ⚠️  Change the password after first login!`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
