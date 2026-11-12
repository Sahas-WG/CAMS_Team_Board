import { buildBoard, initialsOf, parseDue, UNASSIGNED } from './team-board';
import { BoardData, Item, Member } from './models';

const member = (id: string, name: string): Member => ({ id, name, role: '' });
const item = (id: string, ownerId: string, status: string, due = '', area = 'General', project = ''): Item =>
  ({ id, title: 'Item ' + id, ownerId, area, project, status, due, notes: '' });
const board = (items: Item[], leads: Record<string, string> = {}): BoardData =>
  ({ members: [member('a', 'Ann Lee'), member('b', 'Bob Ray'), member('c', 'Cy')], items, leads, nextId: 99 });

describe('buildBoard', () => {
  const today = new Date(2026, 10, 11, 9, 30);
  const items = [
    item('T1', 'a', 'In progress', '2026-11-20'),
    item('T2', 'a', 'Not started', '2026-11-10'),   // overdue
    item('T3', 'a', 'Complete', '2026-11-05'),
    item('T4', 'b', 'Not started', '2026-12-20'),
    item('T5', 'gone', 'Not started', '2026-11-12'),
    item('T6', '', 'Blocked'),
  ];

  it('puts each item under its owner, overdue first and finished last', () => {
    const cols = buildBoard(board(items), today, 'all');
    expect(cols.find(c => c.key === 'a')!.cards.map(c => c.item.id)).toEqual(['T2', 'T1', 'T3']);
    expect(cols.find(c => c.key === 'b')!.cards.map(c => c.item.id)).toEqual(['T4']);
  });

  it('keeps people with nothing assigned, so spare capacity shows', () => {
    expect(buildBoard(board(items), today, 'all').map(c => c.name)).toContain('Cy');
  });

  it('collects items with no valid owner in an Unassigned lane, only when there are some', () => {
    const un = buildBoard(board(items), today, 'all').find(c => c.unassigned)!;
    expect(un.key).toBe(UNASSIGNED);
    expect(un.cards.map(c => c.item.id).sort()).toEqual(['T5', 'T6']);
    expect(buildBoard(board(items.slice(0, 4)), today, 'all').some(c => c.unassigned)).toBeFalse();
  });

  it('counts over every item while the mode only filters the cards', () => {
    const ann = buildBoard(board(items), today, 'open').find(c => c.key === 'a')!;
    expect(ann.cards.map(c => c.item.id)).toEqual(['T2', 'T1']);
    expect([ann.total, ann.open, ann.overdue, ann.done]).toEqual([3, 2, 1, 1]);
  });

  it('shows only open work due within two weeks in the soon mode, overdue included', () => {
    const cols = buildBoard(board(items), today, 'soon');
    expect(cols.find(c => c.key === 'a')!.cards.map(c => c.item.id)).toEqual(['T2', 'T1']);
    expect(cols.find(c => c.key === 'b')!.cards.length).toBe(0);
  });

  it('does not call an item due today overdue', () => {
    const c = buildBoard(board([item('T9', 'a', 'Not started', '2026-11-11')]), today, 'all')[0].cards[0];
    expect([c.overdue, c.soon]).toEqual([false, true]);
  });

  it('narrows the whole board to one project', () => {
    const data = board([item('T1', 'a', 'Not started', '', 'General', 'UoM'), item('T2', 'a', 'Not started', '', 'General', 'RMIT')]);
    expect(buildBoard(data, today, 'all', 'UoM')[0].cards.map(c => c.item.id)).toEqual(['T1']);
  });

  it('sorts T10 after T9', () => {
    const data = board([item('T10', 'a', 'Not started'), item('T9', 'a', 'Not started')]);
    expect(buildBoard(data, today, 'all')[0].cards.map(c => c.item.id)).toEqual(['T9', 'T10']);
  });

  describe('areas', () => {
    const ws = [
      item('R1', 'a', 'Not started', '2026-12-01', 'Reporting'), item('R2', 'a', 'In progress', '2026-11-25', 'Reporting'),
      item('R3', 'b', 'Not started', '2026-12-05', 'Reporting'), item('S1', 'c', 'Complete', '', 'SSO'),
    ];
    const areasBy = (leads?: Record<string, string>, mode: 'all' | 'open' = 'all') =>
      Object.fromEntries(buildBoard(board(ws, leads), today, mode).map(c => [c.key, c.areas.map(a => a.name)]));

    it('shows each area once, under whoever owns most of its items', () => {
      expect(areasBy()).toEqual({ a: ['Reporting'], b: [], c: ['SSO'] });
    });

    it('summarises the area', () => {
      const rep = buildBoard(board(ws), today, 'all')[0].areas[0];
      expect([rep.total, rep.open, rep.inProgress, rep.done, rep.chosen, rep.helpers]).toEqual([3, 3, 1, 0, false, ['BR']]);
      expect(rep.nextDue).toEqual(new Date(2026, 10, 25));
    });

    it('moves the whole area to a chosen lead', () => {
      const cols = buildBoard(board(ws, { Reporting: 'b' }), today, 'all');
      const rep = cols.find(c => c.key === 'b')!.areas[0];
      expect(cols.find(c => c.key === 'a')!.areas).toEqual([]);
      expect([rep.total, rep.chosen, rep.helpers]).toEqual([3, true, ['AL']]);
    });

    it('falls back to the inferred lead when the chosen person has gone', () => {
      expect(areasBy({ Reporting: 'gone' })['a']).toEqual(['Reporting']);
    });

    it('drops an area with nothing open from the Open view', () => {
      expect(areasBy(undefined, 'open')['c']).toEqual([]);
    });

    it('puts an area nobody can lead in the Unassigned lane, and unnamed areas under Other', () => {
      const un = buildBoard(board([item('X1', '', 'Not started', '', '  ')]), today, 'all').find(c => c.unassigned)!;
      expect(un.areas.map(a => a.name)).toEqual(['Other']);
    });
  });
});

describe('helpers', () => {
  it('takes initials from the first two words', () => {
    expect([initialsOf('Sahas Gamage'), initialsOf('cy'), initialsOf('  '), initialsOf('Ann Mary Lee')]).toEqual(['SG', 'C', '?', 'AM']);
  });
  it('reads a due date as a local day', () => {
    expect(parseDue('2026-03-01')).toEqual(new Date(2026, 2, 1));
    expect(parseDue('')).toBeUndefined();
    expect(parseDue('1 March')).toBeUndefined();
  });
});
