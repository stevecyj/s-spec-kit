// @ts-check

/**
 * @typedef {object} GroupableAlbum
 * @property {number} id
 * @property {string} albumDate
 */

/**
 * @typedef {object} DateGroup
 * @property {string} yearMonth
 * @property {string} label
 * @property {GroupableAlbum[]} albums
 */

/**
 * @param {string | Date} albumDate
 * @returns {string}
 */
export function toYearMonth(albumDate) {
  const iso =
    albumDate instanceof Date
      ? albumDate.toISOString().slice(0, 10)
      : String(albumDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`無效的相簿日期：${String(albumDate)}`);
  }
  return iso.slice(0, 7);
}

/**
 * @param {string} yearMonth `YYYY-MM`
 * @returns {string}
 */
export function formatGroupLabel(yearMonth) {
  const matched = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!matched) {
    throw new Error(`無效的年月：${yearMonth}`);
  }
  return `${matched[1]} 年 ${Number(matched[2])} 月`;
}

/**
 * 將平鋪相簿依 albumDate 聚合成「年＋月」分組。
 * 分組按 yearMonth 降序；組內相簿按 albumDate DESC、id DESC。
 * 沒有相簿的月份不會出現。
 * @template {GroupableAlbum} T
 * @param {T[]} albums
 * @returns {Array<DateGroup & { albums: T[] }>}
 */
export function groupAlbumsByMonth(albums) {
  const sorted = albums.slice().sort((left, right) => {
    if (left.albumDate !== right.albumDate) {
      return left.albumDate < right.albumDate ? 1 : -1;
    }
    return right.id - left.id;
  });

  /** @type {Map<string, T[]>} */
  const grouped = new Map();
  for (const album of sorted) {
    const yearMonth = toYearMonth(album.albumDate);
    const bucket = grouped.get(yearMonth);
    if (bucket) {
      bucket.push(album);
    } else {
      grouped.set(yearMonth, [album]);
    }
  }

  return [...grouped.keys()]
    .sort((left, right) => (left < right ? 1 : -1))
    .map((yearMonth) => ({
      yearMonth,
      label: formatGroupLabel(yearMonth),
      albums: grouped.get(yearMonth) ?? [],
    }));
}
