const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, 'frontend', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const parts = pkg.version.split('.');
parts[2] = String(Number(parts[2]) + 1);
pkg.version = parts.join('.');

require('fs').writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Version bumped to ${pkg.version}`);

execSync('git add frontend/package.json', { stdio: 'inherit' });
execSync(`git commit -m "chore: bump version to ${pkg.version}"`, { stdio: 'inherit' });
execSync('git push', { stdio: 'inherit' });
console.log('Deployed!');
