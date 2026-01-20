import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [, , bumpType = 'patch'] = process.argv;
const versionFile = resolve('src/lib/version.ts');
const contents = await readFile(versionFile, 'utf8');

const match = contents.match(/appVersion\s*=\s*'(?<version>\d+\.\d+\.\d+)'/);
if (!match?.groups?.version) {
  throw new Error(`Could not find appVersion in ${versionFile}.`);
}

const [majorStr, minorStr, patchStr] = match.groups.version.split('.');
let major = Number(majorStr);
let minor = Number(minorStr);
let patch = Number(patchStr);

if ([major, minor, patch].some((value) => Number.isNaN(value))) {
  throw new Error(`Invalid version found in ${versionFile}.`);
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
const nextContents = contents.replace(match.groups.version, nextVersion);
await writeFile(versionFile, nextContents);
console.log(`Updated appVersion to ${nextVersion}`);
