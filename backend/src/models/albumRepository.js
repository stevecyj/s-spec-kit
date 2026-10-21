// @ts-check

/** @typedef {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} Queryable */

/**
 * @typedef {object} AlbumRow
 * @property {number} id
 * @property {string} title
 * @property {string} album_date
 * @property {number} is_collapsed
 * @property {number} sort_order
 */

/**
 * @param {Queryable} db
 * @param {string} sql
 * @param {unknown[]} [params]
 */
async function queryRows(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return /** @type {AlbumRow[]} */ (rows);
}

export function createAlbumRepository() {
  return {
    /** @param {Queryable} db */
    async listAlbums(db) {
      return queryRows(
        db,
        `SELECT id, title, album_date, is_collapsed, sort_order
         FROM albums
         ORDER BY album_date DESC, id DESC`,
      );
    },

    /**
     * @param {Queryable} db
     * @param {number} id
     */
    async findAlbumById(db, id) {
      const rows = await queryRows(
        db,
        `SELECT id, title, album_date, is_collapsed, sort_order
         FROM albums WHERE id = ?`,
        [id],
      );
      return rows[0] ?? null;
    },

    /**
     * @param {Queryable} db
     * @param {{ title: string, albumDate: string }} input
     */
    async insertAlbum(db, input) {
      const [result] = await db.query(
        `INSERT INTO albums (title, album_date, is_collapsed, sort_order) VALUES (?, ?, 0, 0)`,
        [input.title, input.albumDate],
      );
      return Number(/** @type {{ insertId: number }} */ (result).insertId);
    },

    /**
     * @param {Queryable} db
     * @param {number} id
     * @param {{ title?: string, albumDate?: string, isCollapsed?: boolean }} patch
     */
    async updateAlbum(db, id, patch) {
      /** @type {string[]} */
      const sets = [];
      /** @type {unknown[]} */
      const params = [];
      if (patch.title !== undefined) {
        sets.push('title = ?');
        params.push(patch.title);
      }
      if (patch.albumDate !== undefined) {
        sets.push('album_date = ?');
        params.push(patch.albumDate);
      }
      if (patch.isCollapsed !== undefined) {
        sets.push('is_collapsed = ?');
        params.push(patch.isCollapsed ? 1 : 0);
      }
      if (sets.length === 0) return;
      params.push(id);
      await db.query(`UPDATE albums SET ${sets.join(', ')} WHERE id = ?`, params);
    },

    /**
     * @param {Queryable} db
     * @param {number} id
     */
    async deleteAlbum(db, id) {
      await db.query('DELETE FROM albums WHERE id = ?', [id]);
    },
  };
}
