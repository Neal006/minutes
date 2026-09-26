// Downloads the Obscura headless browser (https://github.com/h4ckf0r0day/obscura) used by the e2e
// suite into tools/obscura. Idempotent: does nothing when the binary is already there.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const VERSION = 'v0.2.3';
const ASSETS = {
  'win32-x64': 'obscura-x86_64-windows.zip',
  'linux-x64': 'obscura-x86_64-linux.tar.gz',
  'linux-arm64': 'obscura-aarch64-linux.tar.gz',
  'darwin-x64': 'obscura-x86_64-macos.tar.gz',
  'darwin-arm64': 'obscura-aarch64-macos.tar.gz',
};

const dir = path.resolve(import.meta.dirname, '../tools/obscura');
const bin = path.join(dir, process.platform === 'win32' ? 'obscura.exe' : 'obscura');

if (existsSync(bin)) {
  console.log(`obscura: ${bin}`);
} else {
  const asset = ASSETS[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error(`No Obscura build for ${process.platform}-${process.arch}`);
  const url = `https://github.com/h4ckf0r0day/obscura/releases/download/${VERSION}/${asset}`;
  console.log(`obscura: downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  mkdirSync(dir, { recursive: true });
  const archive = path.join(dir, asset);
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  // Windows' own bsdtar extracts .zip; Git Bash's GNU tar would read "C:" as a remote host.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', archive, '-C', dir]);
  rmSync(archive);
  if (process.platform !== 'win32') chmodSync(bin, 0o755);
  if (!existsSync(bin)) throw new Error(`Archive did not contain ${path.basename(bin)}`);
  console.log(`obscura: installed ${bin}`);
}
