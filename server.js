const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/openvpn-dashboard';
const statusLogPath = process.env.OPENVPN_STATUS_LOG || '/run/openvpn-server/status-server.log';

let lastStats = new Map(); // Keep track of last bytes received/sent to calculate speed
let lastParsedTime = Date.now();
let isFirstRun = true;

function parseStatusLog(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let commonNameIdx = 1;
  let realAddrIdx = 2;
  let virtAddrIdx = 3;
  let bytesReceivedIdx = 4;
  let bytesSentIdx = 5;
  let connectedSinceIdx = 6;

  for (const line of lines) {
    if (line.startsWith('HEADER,CLIENT_LIST')) {
      const headerParts = line.split(',');
      const cn = headerParts.indexOf('Common Name');
      const ra = headerParts.indexOf('Real Address');
      const va = headerParts.indexOf('Virtual Address');
      const br = headerParts.indexOf('Bytes Received');
      const bs = headerParts.indexOf('Bytes Sent');
      const cs = headerParts.indexOf('Connected Since');
      if (cn !== -1) commonNameIdx = cn - 1;
      if (ra !== -1) realAddrIdx = ra - 1;
      if (va !== -1) virtAddrIdx = va - 1;
      if (br !== -1) bytesReceivedIdx = br - 1;
      if (bs !== -1) bytesSentIdx = bs - 1;
      if (cs !== -1) connectedSinceIdx = cs - 1;
      break;
    }
  }

  const activeClients = [];
  for (const line of lines) {
    if (!line.startsWith('CLIENT_LIST')) continue;
    const parts = line.split(',');
    const maxIdx = Math.max(commonNameIdx, realAddrIdx, virtAddrIdx, bytesReceivedIdx, bytesSentIdx, connectedSinceIdx);
    if (parts.length <= maxIdx) continue;

    const username = parts[commonNameIdx].trim();
    const realAddress = parts[realAddrIdx].trim();
    const virtualAddress = parts[virtAddrIdx].trim();
    const bytesReceived = parseInt(parts[bytesReceivedIdx]) || 0;
    const bytesSent = parseInt(parts[bytesSentIdx]) || 0;
    const connectedSince = parts[connectedSinceIdx].trim();

    activeClients.push({
      username,
      realAddress,
      virtualAddress,
      bytesReceived,
      bytesSent,
      connectedSince
    });
  }

  return activeClients;
}

const path = require('path');

function getEasyRsaPath() {
  const candidates = [
    process.env.EASY_RSA_PATH,
    '/etc/openvpn/server/easy-rsa',
    '/etc/openvpn/easy-rsa'
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || '/etc/openvpn/server/easy-rsa';
}

function parseEasyRsaDate(value) {
  if (!value || value.length < 12) return undefined;
  const yearPrefix = Number(value.slice(0, 2)) >= 50 ? '19' : '20';
  const date = new Date(
    Date.UTC(
      Number(`${yearPrefix}${value.slice(0, 2)}`),
      Number(value.slice(2, 4)) - 1,
      Number(value.slice(4, 6)),
      Number(value.slice(6, 8)),
      Number(value.slice(8, 10)),
      Number(value.slice(10, 12))
    )
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function commonNameFromSubject(subject) {
  if (!subject) return undefined;
  return subject
    .split('/')
    .find(part => part.startsWith('CN='))
    ?.slice(3);
}

function listOpenVpnClients() {
  const easyRsaPath = getEasyRsaPath();
  const indexPath = path.join(easyRsaPath, 'pki/index.txt');
  if (!fs.existsSync(indexPath)) return [];

  return fs
    .readFileSync(indexPath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const columns = line.split('\t');
      const username = commonNameFromSubject(columns[5]);
      if (!username || username === 'server') return null;

      const expiresAt = parseEasyRsaDate(columns[1]);
      const status =
        columns[0] === 'R'
          ? 'revoked'
          : expiresAt && expiresAt.getTime() < Date.now()
            ? 'expired'
            : 'valid';

      return { username, status, expiresAt };
    })
    .filter(client => client !== null);
}

app.prepare().then(async () => {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.');

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    path: '/api/socket',
    cors: {
      origin: '*',
    },
  });

  // Cached latest data to send immediately on client connection
  let latestData = {
    activeClients: [],
    summary: { totalUsers: 0, activeUsers: 0, totalOvpnGenerated: 0 },
    timestamp: Date.now()
  };

  async function updateStats() {
    try {
      const db = mongoose.connection.db;
      
      // 1. Fetch live client status from OpenVPN status log
      const rawClients = parseStatusLog(statusLogPath);
      const now = Date.now();
      const elapsedSeconds = Math.max((now - lastParsedTime) / 1000, 0.5);

      // Fetch counts from DB and EasyRSA
      const mongoUsers = await db.collection('users').find().toArray();
      const vpnClients = listOpenVpnClients();

      const mongoUsersByUsername = new Map(mongoUsers.map(u => [u.username, u]));
      const dbUsernames = mongoUsers.map(u => u.username);

      const getBaseUsername = (cn) => {
        if (dbUsernames.includes(cn)) return cn;
        for (const username of dbUsernames) {
          if (cn.startsWith(username + '_') || cn.startsWith(username + '-')) {
            return username;
          }
        }
        const idx = cn.indexOf('_') !== -1 ? cn.indexOf('_') : cn.indexOf('-');
        return idx !== -1 ? cn.substring(0, idx) : cn;
      };

      const settingsDoc = await db.collection('settings').findOne();
      const startDay = settingsDoc ? (settingsDoc.billingCycleStartDay || 1) : 1;

      // Current billing month/year
      const currentDate = new Date(now);
      let month = currentDate.getMonth() + 1;
      let year = currentDate.getFullYear();
      if (currentDate.getDate() < startDay) {
        month -= 1;
        if (month === 0) {
          month = 12;
          year -= 1;
        }
      }

      const currentStats = new Map();
      const activeClients = [];

      for (const client of rawClients) {
        const last = lastStats.get(client.username) || { bytesReceived: client.bytesReceived, bytesSent: client.bytesSent };
        
        // Speeds in bytes per second (upload is bytes received by server, download is bytes sent by server)
        const uploadSpeed = Math.max((client.bytesReceived - last.bytesReceived) / elapsedSeconds, 0);
        const downloadSpeed = Math.max((client.bytesSent - last.bytesSent) / elapsedSeconds, 0);

        let deltaReceived = 0;
        let deltaSent = 0;

        if (!isFirstRun) {
          if (client.bytesReceived >= last.bytesReceived) {
            deltaReceived = client.bytesReceived - last.bytesReceived;
          } else {
            deltaReceived = client.bytesReceived;
          }

          if (client.bytesSent >= last.bytesSent) {
            deltaSent = client.bytesSent - last.bytesSent;
          } else {
            deltaSent = client.bytesSent;
          }
        }

        currentStats.set(client.username, {
          bytesReceived: client.bytesReceived,
          bytesSent: client.bytesSent
        });

        activeClients.push({
          ...client,
          uploadSpeed,
          downloadSpeed
        });

        // Save to DB if there is new traffic
        if (deltaReceived > 0 || deltaSent > 0) {
          const baseUsername = getBaseUsername(client.username);
          const user = mongoUsersByUsername.get(baseUsername);
          if (user) {
            await db.collection('trafficlogs').updateOne(
              { userId: user._id, month, year },
              {
                $set: {
                  username: baseUsername,
                  lastUpdated: currentDate,
                },
                $inc: {
                  bytesUploaded: deltaReceived,
                  bytesDownloaded: deltaSent,
                },
              },
              { upsert: true }
            );
          }
        }
      }

      isFirstRun = false;
      lastStats = currentStats;
      lastParsedTime = now;

      const vpnUsernames = new Set(vpnClients.map(c => c.username));

      const vpnRows = vpnClients.map(client => {
        const metadata = mongoUsersByUsername.get(client.username);
        return {
          username: client.username,
          role: metadata ? metadata.role : 'user',
          isActive: client.status === 'valid' && (metadata ? metadata.isActive !== false : true),
          ovpnGenerated: client.status === 'valid'
        };
      });

      const metadataOnlyRows = mongoUsers
        .filter(u => !vpnUsernames.has(u.username))
        .map(u => ({
          username: u.username,
          role: u.role || 'user',
          isActive: u.isActive !== false,
          ovpnGenerated: u.ovpnGenerated === true
        }));

      const allMergedUsers = [...vpnRows, ...metadataOnlyRows];
      const regularUsers = allMergedUsers.filter(u => u.role !== 'admin');

      const totalUsers = regularUsers.length;
      const activeUsers = regularUsers.filter(u => u.isActive).length;
      const totalOvpnGenerated = allMergedUsers.filter(u => u.ovpnGenerated).length;

      latestData = {
        activeClients,
        summary: {
          totalUsers,
          activeUsers,
          totalOvpnGenerated
        },
        timestamp: now
      };

      // Broadcast to all sockets
      io.emit('dashboard-data', latestData);
    } catch (err) {
      console.error('Error in stats update loop:', err);
    }
  }

  // Run update loop every 2 seconds
  const interval = setInterval(updateStats, 2000);

  io.on('connection', (socket) => {
    // Send latest data immediately to the new client
    socket.emit('dashboard-data', latestData);
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
}).catch(console.error);
