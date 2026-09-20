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

console.log('>> Verificando y sincronizando cambios remotos con git fetch & pull...');
execSync('git fetch origin main', { stdio: 'inherit' });
execSync('git pull --rebase origin main', { stdio: 'inherit' });

execSync('git add frontend/package.json', { stdio: 'inherit' });
execSync(`git commit -m "chore: incrementar versión a ${pkg.version}"`, { stdio: 'inherit' });
execSync('git push origin main', { stdio: 'inherit' });
console.log('¡Despliegue completado con éxito!');
