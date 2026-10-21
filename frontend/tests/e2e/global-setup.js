import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend');

export default function globalSetup() {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import mysql from 'mysql2/promise';
       const connection = await mysql.createConnection({
         host: process.env.DB_HOST || '127.0.0.1',
         port: Number(process.env.DB_PORT || 3306),
         user: process.env.DB_USER || 'root',
         password: process.env.DB_PASSWORD ?? '',
         database: process.env.DB_NAME || 'photo_album_organizer',
       });
       await connection.query('DELETE FROM photos');
       await connection.query('DELETE FROM albums');
       await connection.end();`,
    ],
    { cwd: backendRoot, stdio: 'inherit' },
  );
}
