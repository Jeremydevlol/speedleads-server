/**
 * Patch: Actualizar versión de instagram-private-api
 * Se ejecuta con: node patch-ig-version.js
 * O automáticamente como postinstall script
 */
import fs from 'fs';
import path from 'path';

const CONSTANTS_FILE = path.join(
  process.cwd(),
  'node_modules/instagram-private-api/dist/core/constants.js'
);

// Versiones actualizadas (Instagram Android 317.x — Feb 2026)
const PATCHES = {
  APP_VERSION: '317.0.0.34.109',
  APP_VERSION_CODE: '563123853',
  BLOKS_VERSION_ID: 'e2004666934296f275a5c6b524f90766b98ea4698376b4e1bb304abb0e7243a0',
};

try {
  let content = fs.readFileSync(CONSTANTS_FILE, 'utf8');
  
  content = content.replace(
    /exports\.APP_VERSION = '[^']+'/,
    `exports.APP_VERSION = '${PATCHES.APP_VERSION}'`
  );
  content = content.replace(
    /exports\.APP_VERSION_CODE = '[^']+'/,
    `exports.APP_VERSION_CODE = '${PATCHES.APP_VERSION_CODE}'`
  );
  content = content.replace(
    /exports\.BLOKS_VERSION_ID = '[^']+'/,
    `exports.BLOKS_VERSION_ID = '${PATCHES.BLOKS_VERSION_ID}'`
  );
  
  fs.writeFileSync(CONSTANTS_FILE, content);
  console.log(`✅ instagram-private-api parcheado a v${PATCHES.APP_VERSION}`);
} catch (e) {
  console.warn(`⚠️ No se pudo parchear instagram-private-api: ${e.message}`);
}
