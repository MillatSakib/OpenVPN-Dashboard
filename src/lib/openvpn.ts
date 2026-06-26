import fs from 'fs';
import path from 'path';

export interface OpenVpnClient {
  username: string;
  status: 'valid' | 'revoked' | 'expired';
  expiresAt?: Date;
}

const EASY_RSA_PATHS = [
  process.env.EASY_RSA_PATH,
  '/etc/openvpn/server/easy-rsa',
  '/etc/openvpn/easy-rsa',
].filter(Boolean) as string[];

const BASE_CONFIG_PATHS = [
  process.env.OVPN_BASE_CONFIG,
  '/etc/openvpn/server/client-common.txt',
  '/etc/openvpn/client-common.txt',
].filter(Boolean) as string[];

const TLS_CRYPT_PATHS = [
  process.env.OVPN_TLS_CRYPT_KEY,
  '/etc/openvpn/server/ta.key',
  '/etc/openvpn/ta.key',
].filter(Boolean) as string[];

export function assertSafeClientName(name: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Client username may only contain letters, numbers, underscores, and hyphens');
  }
}

export function vpnUserId(username: string) {
  return `vpn:${encodeURIComponent(username)}`;
}

export function usernameFromVpnUserId(id: string) {
  if (!id.startsWith('vpn:')) return null;
  return decodeURIComponent(id.slice(4));
}

export function firstExistingPath(paths: string[], label: string) {
  const existing = paths.find((candidate) => fs.existsSync(candidate));
  if (!existing) {
    throw new Error(`${label} not found. Checked: ${paths.join(', ')}`);
  }
  return existing;
}

export function getEasyRsaPath() {
  return firstExistingPath(EASY_RSA_PATHS, 'EasyRSA directory');
}

export function getOpenVpnPaths(username: string) {
  assertSafeClientName(username);

  const easyRsaPath = getEasyRsaPath();
  const baseConfig = firstExistingPath(BASE_CONFIG_PATHS, 'OpenVPN client base config');
  const outputPath =
    process.env.OVPN_OUTPUT_PATH ||
    (process.env.SUDO_USER ? `/home/${process.env.SUDO_USER}` : '/root');
  const tlsCryptPath = TLS_CRYPT_PATHS.find((candidate) => fs.existsSync(candidate));

  return {
    easyRsaPath,
    baseConfig,
    outputPath,
    ovpnFilePath: path.join(outputPath, `${username}.ovpn`),
    caPath: path.join(easyRsaPath, 'pki/ca.crt'),
    certPath: path.join(easyRsaPath, `pki/issued/${username}.crt`),
    keyPath: path.join(easyRsaPath, `pki/private/${username}.key`),
    indexPath: path.join(easyRsaPath, 'pki/index.txt'),
    tlsCryptPath,
  };
}

function parseEasyRsaDate(value: string) {
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

function commonNameFromSubject(subject: string) {
  return subject
    .split('/')
    .find((part) => part.startsWith('CN='))
    ?.slice(3);
}

export function listOpenVpnClients(): OpenVpnClient[] {
  const indexPath = path.join(getEasyRsaPath(), 'pki/index.txt');
  if (!fs.existsSync(indexPath)) return [];

  const clients = fs
    .readFileSync(indexPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.split('\t');
      const username = commonNameFromSubject(columns[5] || '');
      if (!username || username === 'server') return null;

      const expiresAt = parseEasyRsaDate(columns[1]);
      const status =
        columns[0] === 'R'
          ? 'revoked'
          : expiresAt && expiresAt.getTime() < Date.now()
            ? 'expired'
            : 'valid';

      return { username, status, expiresAt } as OpenVpnClient;
    })
    .filter((client): client is OpenVpnClient => client !== null);

  return clients.sort((a, b) => a.username.localeCompare(b.username));
}

export function readInlineFile(filePath: string) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export async function syncCrlFile() {
  const easyRsaPath = getEasyRsaPath();
  const srcCrl = path.join(easyRsaPath, 'pki/crl.pem');
  const destCrl = '/etc/openvpn/server/crl.pem';

  if (fs.existsSync(srcCrl)) {
    fs.copyFileSync(srcCrl, destCrl);
    try {
      await execAsync('chown nobody:nogroup /etc/openvpn/server/crl.pem');
      await execAsync('chmod 644 /etc/openvpn/server/crl.pem');
    } catch (err) {
      console.warn('Could not set permissions on crl.pem:', err);
    }
  }
}

export async function updateClientCertStatus(cn: string, active: boolean) {
  assertSafeClientName(cn);
  const easyRsaPath = getEasyRsaPath();
  const indexPath = path.join(easyRsaPath, 'pki/index.txt');
  if (!fs.existsSync(indexPath)) return;

  const content = fs.readFileSync(indexPath, 'utf8');
  const lines = content.split('\n');
  let modified = false;

  const updatedLines = lines.map((line) => {
    const columns = line.split('\t');
    if (columns.length < 6) return line;

    const currentCN = commonNameFromSubject(columns[5]);
    if (currentCN === cn) {
      if (active && columns[0] === 'R') {
        // Un-revoke (Activate): change status to V and clear revocation date
        columns[0] = 'V';
        columns[2] = '';
        modified = true;
        return columns.join('\t');
      } else if (!active && columns[0] === 'V') {
        // Revoke (Deactivate): change status to R and set revocation date
        const d = new Date();
        const yy = String(d.getUTCFullYear()).slice(-2);
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const min = String(d.getUTCMinutes()).padStart(2, '0');
        const ss = String(d.getUTCSeconds()).padStart(2, '0');
        const dateStr = `${yy}${mm}${dd}${hh}${min}${ss}Z`;

        columns[0] = 'R';
        columns[2] = dateStr;
        modified = true;
        return columns.join('\t');
      }
    }
    return line;
  });

  if (modified) {
    fs.writeFileSync(indexPath, updatedLines.join('\n'), 'utf8');
    await execAsync('./easyrsa gen-crl', { cwd: easyRsaPath });
    await syncCrlFile();
  }
}
