import { describe, expect, it } from 'vitest';
import {
  formatGroupLabel,
  groupAlbumsByMonth,
  toYearMonth,
} from '../../src/utils/dateGroupFormatter.js';

describe('DateGroup 年月分組', () => {
  it('產生 YYYY-MM 與繁體中文標題', () => {
    expect(toYearMonth('2026-10-18')).toBe('2026-10');
    expect(formatGroupLabel('2026-10')).toBe('2026 年 10 月');
    expect(formatGroupLabel('2026-08')).toBe('2026 年 8 月');
  });

  it('分組與相簿都由新到舊排列', () => {
    const groups = groupAlbumsByMonth([
      { id: 3, albumDate: '2026-10-01', title: '較早的十月' },
      { id: 8, albumDate: '2026-08-20', title: '八月' },
      { id: 5, albumDate: '2026-10-01', title: '同一天較新編號' },
      { id: 4, albumDate: '2026-10-20', title: '十月較晚' },
    ]);

    expect(groups.map((group) => group.yearMonth)).toEqual(['2026-10', '2026-08']);
    expect(groups[0].label).toBe('2026 年 10 月');
    expect(groups[0].albums.map((album) => album.id)).toEqual([4, 5, 3]);
    expect(groups[1].albums.map((album) => album.id)).toEqual([8]);
  });

  it('刪除最後一個相簿後，空的日期分組會消失', () => {
    const albums = [
      { id: 2, albumDate: '2026-10-02', title: '十月' },
      { id: 1, albumDate: '2026-08-01', title: '八月' },
    ];
    expect(groupAlbumsByMonth(albums).map((group) => group.label)).toEqual([
      '2026 年 10 月',
      '2026 年 8 月',
    ]);
    expect(groupAlbumsByMonth(albums.filter((album) => album.id !== 1))).toEqual([
      {
        yearMonth: '2026-10',
        label: '2026 年 10 月',
        albums: [{ id: 2, albumDate: '2026-10-02', title: '十月' }],
      },
    ]);
  });
});
