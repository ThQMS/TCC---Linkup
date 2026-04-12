/**
 * Gera docs/api.json a partir do spec do Swagger definido em src/config/swagger.js.
 * Uso: node scripts/export-swagger.js
 */
const fs   = require('fs');
const path = require('path');

const spec = require('../src/config/swagger');
const out  = path.join(__dirname, '..', 'docs', 'api.json');

fs.writeFileSync(out, JSON.stringify(spec, null, 2), 'utf-8');
console.log(`Spec exportado → ${out}`);
