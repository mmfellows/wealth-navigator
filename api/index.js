// Vercel serverless entrypoint. Project root has "type": "module" (Vite),
// so this file is ESM. backend/ has its own package.json with no type field,
// so backend/server.js is loaded as CommonJS via Node's ESM/CJS interop —
// `import app from ...` returns its module.exports.
import app from '../backend/server.js';
export default app;
