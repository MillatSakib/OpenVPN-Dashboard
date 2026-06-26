import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { isAdmin, getTokenFromRequest } from '@/lib/auth';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  assertSafeClientName,
  getOpenVpnPaths,
  readInlineFile,
  usernameFromVpnUserId,
} from '@/lib/openvpn';

const execFileAsync = promisify(execFile);

async function resolveUsername(id: string) {
  const vpnUsername = usernameFromVpnUserId(id);
  if (vpnUsername) return { username: vpnUsername, mongoId: null };

  const user = await User.findById(id);
  if (!user) return null;

  return { username: user.username, mongoId: user._id };
}

// POST /api/ovpn/generate/[id] - Generate .ovpn file for a user
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminPayload = isAdmin(req);
  if (!adminPayload) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const resolved = await resolveUsername(params.id);
  if (!resolved) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  let profileName = '';
  try {
    const body = await req.json();
    profileName = body.profileName || '';
  } catch (err) {
    // Ignore body parsing errors
  }

  const targetCN = profileName ? `${resolved.username}_${profileName}` : resolved.username;

  try {
    assertSafeClientName(targetCN);
    const paths = getOpenVpnPaths(targetCN);
    fs.mkdirSync(paths.outputPath, { recursive: true });

    const inlinePath = path.join(paths.easyRsaPath, `pki/inline/private/${targetCN}.inline`);
    const certExists = fs.existsSync(paths.certPath) && fs.existsSync(inlinePath);

    if (certExists) {
      // The cert already exists, so we just build the .ovpn file directly
      const baseConfigContent = fs.readFileSync(paths.baseConfig, 'utf8');
      const inlineContent = fs.readFileSync(inlinePath, 'utf8');
      const combined = (baseConfigContent + '\n' + inlineContent)
        .split('\n')
        .filter(line => !line.trim().startsWith('#'))
        .join('\n');
      
      fs.writeFileSync(paths.ovpnFilePath, combined, { mode: 0o600 });
    } else {
      // Execute the installer script non-interactively using spawn
      const scriptPath = '/root/openvpn-install.sh';
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`OpenVPN installer script not found at ${scriptPath}`);
      }

      await new Promise<void>((resolve, reject) => {
        const child = spawn('bash', [scriptPath]);
        let output = '';
        let errorOutput = '';

        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('Timeout executing openvpn-install.sh (user may already exist or prompt is blocked)'));
        }, 15000);

        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        child.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`openvpn-install.sh exited with code ${code}. Output: ${output}. Error: ${errorOutput}`));
          }
        });

        // Write option 1 to add user
        setTimeout(() => {
          child.stdin.write('1\n');
          // Write the target client CN
          setTimeout(() => {
            child.stdin.write(`${targetCN}\n`);
            child.stdin.end();
          }, 500);
        }, 500);
      });
    }

    // Verify file exists
    if (!fs.existsSync(paths.ovpnFilePath)) {
      throw new Error(`Generated .ovpn file not found at ${paths.ovpnFilePath}`);
    }

    // Mark as generated in DB
    if (resolved.mongoId) {
      await User.findByIdAndUpdate(resolved.mongoId, { ovpnGenerated: true });
    }

    return NextResponse.json({
      message: `OpenVPN config generated for ${targetCN}`,
      filename: `${targetCN}.ovpn`,
    });
  } catch (err: any) {
    console.error('OVPN generation error:', err);
    return NextResponse.json(
      { message: err.message || 'Failed to generate OVPN config. Check server configuration.' },
      { status: 500 }
    );
  }
}

// GET /api/ovpn/generate/[id] - Download .ovpn file
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = getTokenFromRequest(req);
  if (!payload) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  await dbConnect();
  const resolved = await resolveUsername(params.id);
  if (!resolved) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 });
  }

  const isOwnProfile = resolved.mongoId && resolved.mongoId.toString() === payload.userId;
  if (payload.role !== 'admin' && !isOwnProfile) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const cn = searchParams.get('cn') || resolved.username;

  // Security check: Ensure the CN belongs to this user
  if (
    cn !== resolved.username &&
    !cn.startsWith(resolved.username + '_') &&
    !cn.startsWith(resolved.username + '-')
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  let ovpnFilePath: string;
  try {
    assertSafeClientName(cn);
    ovpnFilePath = getOpenVpnPaths(cn).ovpnFilePath;
  } catch (err) {
    console.error('OVPN path error:', err);
    return NextResponse.json(
      { message: 'OpenVPN server paths are not configured correctly' },
      { status: 500 }
    );
  }

  if (!fs.existsSync(ovpnFilePath)) {
    return NextResponse.json(
      { message: 'OVPN file not found on server' },
      { status: 404 }
    );
  }

  const fileContent = fs.readFileSync(ovpnFilePath);

  return new NextResponse(fileContent, {
    headers: {
      'Content-Type': 'application/x-openvpn-profile',
      'Content-Disposition': `attachment; filename="${cn}.ovpn"`,
    },
  });
}
