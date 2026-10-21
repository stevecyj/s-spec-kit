import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DB_HOST: '127.0.0.1',
      DB_PORT: '3306',
      DB_USER: 'root',
      DB_PASSWORD: '',
      DB_NAME: 'photo_album_organizer_test',
      UPLOAD_DIR: './uploads-test',
      MAX_FILE_SIZE_MB: '20',
    },
  },
});
