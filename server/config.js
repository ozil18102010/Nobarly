const mariadb = require('mariadb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Dukung 2 gaya env:
// 1) DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME (lokal + Render manual)
// 2) MYSQLHOST/MYSQLPORT/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE (Railway)
// 3) DATABASE_URL=mysql://user:pass@host:port/db (beberapa host gratis)
function resolveDbConfig() {
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return {
        host: u.hostname,
        port: Number(u.port || 3306),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, '') || 'nobarly',
      };
    } catch (_) { /* fallback ke env biasa */ }
  }
  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || 'root',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'nobarly',
  };
}

const dbConf = resolveDbConfig();
// DB online gratis (Aiven/TiDB/PlanetScale) umumnya wajib SSL.
const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

const pool = mariadb.createPool({
  ...dbConf,
  connectionLimit: 10,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

module.exports = pool;
