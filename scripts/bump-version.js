import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [, , bumpType = 'patch'] = process.argv;
const packageFile = resolve('package.json');
const lockFile = resolve('package-lock.json');
const versionFile = resolve('src/lib/version.ts');

const packageContents = await readFile(packageFile, 'utf8');
const packageJson = JSON.parse(packageContents);
const currentVersion = packageJson.version;

if (!currentVersion) {
  throw new Error(`Could not find version in ${packageFile}.`);
}

const [majorStr, minorStr, patchStr] = currentVersion.split('.');
let major = Number(majorStr);
let minor = Number(minorStr);
let patch = Number(patchStr);

if ([major, minor, patch].some((value) => Number.isNaN(value))) {
  throw new Error(`Invalid version found in ${packageFile}.`);
}

switch (bumpType) {
  case 'major':
    major += 1;
    minor = 0;
    patch = 0;
    break;
  case 'minor':
    minor += 1;
    patch = 0;
    break;
  case 'patch':
    patch += 1;
    break;
  default:
    throw new Error('Usage: node scripts/bump-version.js [major|minor|patch]');
}

const nextVersion = `${major}.${minor}.${patch}`;
packageJson.version = nextVersion;
await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockContents = await readFile(lockFile, 'utf8');
const lockJson = JSON.parse(lockContents);
lockJson.version = nextVersion;
if (lockJson.packages && lockJson.packages['']) {
  lockJson.packages[''].version = nextVersion;
}
await writeFile(lockFile, `${JSON.stringify(lockJson, null, 2)}\n`);

const versionContents = await readFile(versionFile, 'utf8');
const versionMatch = versionContents.match(/appVersion\s*=\s*'(?<version>\d+\.\d+\.\d+)'/);
if (!versionMatch?.groups?.version) {
  throw new Error(`Could not find appVersion in ${versionFile}.`);
}
const nextContents = versionContents.replace(versionMatch.groups.version, nextVersion);
await writeFile(versionFile, nextContents);

console.log(`Updated version to ${nextVersion}`);
