// @ts-check

/**
 * @param {{ yearMonth: string, label: string }} group
 * @param {HTMLElement[]} albumNodes
 */
export function renderDateGroupSection(group, albumNodes) {
  const section = document.createElement('section');
  section.className = 'date-group';
  section.dataset.yearMonth = group.yearMonth;
  const heading = document.createElement('h2');
  heading.textContent = group.label;
  const list = document.createElement('div');
  list.className = 'date-group__albums';
  for (const node of albumNodes) list.append(node);
  section.append(heading, list);
  return section;
}

export function renderEmptyLibrary() {
  const wrap = document.createElement('section');
  wrap.className = 'empty-library';
  wrap.dataset.testid = 'empty-library';
  const heading = document.createElement('h2');
  heading.textContent = '還沒有任何相簿';
  const text = document.createElement('p');
  text.textContent = '點「新增相簿」建立單層相簿，或點「匯入照片」把回憶放進對應的年月。';
  wrap.append(heading, text);
  return wrap;
}
