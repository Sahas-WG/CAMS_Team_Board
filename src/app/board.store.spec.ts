import { BoardStore, reviveBoard } from './board.store';

describe('reviveBoard', () => {
  it('returns an empty board for junk', () => {
    expect(reviveBoard(null)).toEqual({ members: [], items: [], leads: {}, nextId: 1 });
    expect(reviveBoard('x')).toEqual({ members: [], items: [], leads: {}, nextId: 1 });
  });

  it('fills gaps, drops rows without an id and bad dates, and keeps numbering ahead of existing items', () => {
    const d = reviveBoard({
      members: [{ id: 'a', name: 'Ann' }, { name: 'no id' }],
      items: [{ id: 'T07', title: 'One', ownerId: 'a', due: '2026-12-01' }, { id: 'T03', due: 'next week' }, { title: 'no id' }],
      leads: { Reporting: 'a', Empty: '' },
      nextId: 2,
    });
    expect(d.members).toEqual([{ id: 'a', name: 'Ann', role: '' }]);
    expect(d.items.map(i => [i.id, i.title, i.status, i.due])).toEqual([['T07', 'One', 'Not started', '2026-12-01'], ['T03', 'Untitled', 'Not started', '']]);
    expect(d.leads).toEqual({ Reporting: 'a' });
    expect(d.nextId).toBe(8);
  });
});

describe('BoardStore', () => {
  let store: BoardStore;
  beforeEach(() => { localStorage.clear(); store = new BoardStore(); });
  const draft = (ownerId: string, area = 'Reporting') => ({ title: 'Do it', ownerId, area, project: 'UoM', status: 'Not started', due: '', notes: '' });

  it('numbers items in order and remembers them across a reload', () => {
    const a = store.addMember(' Ann ', 'Lead');
    expect(store.addItem(draft(a))).toBe('T01');
    expect(store.addItem(draft(a))).toBe('T02');
    const again = new BoardStore();
    expect(again.data().members[0]).toEqual({ id: a, name: 'Ann', role: 'Lead' });
    expect(again.data().items.map(i => i.id)).toEqual(['T01', 'T02']);
  });

  it('leaves a removed person’s items on the board, unowned, and clears their leads', () => {
    const a = store.addMember('Ann'); const b = store.addMember('Bob');
    store.addItem(draft(a)); store.setLead('Reporting', a); store.setLead('SSO', b);
    store.removeMember(a);
    expect(store.data().members.map(m => m.name)).toEqual(['Bob']);
    expect(store.data().items[0].ownerId).toBe('');
    expect(store.data().leads).toEqual({ SSO: b });
  });

  it('lists the areas and projects in use', () => {
    const a = store.addMember('Ann');
    store.addItem(draft(a, 'SSO')); store.addItem(draft(a, ' Reporting ')); store.addItem(draft(a, ''));
    expect(store.areaNames()).toEqual(['Reporting', 'SSO']);
    expect(store.projectNames()).toEqual(['UoM']);
  });

  it('round-trips through export and import, and rejects text that is not JSON', () => {
    const a = store.addMember('Ann'); store.addItem(draft(a));
    const text = store.exportJson();
    localStorage.clear();
    const other = new BoardStore();
    other.importJson(text);
    expect(other.data()).toEqual(store.data());
    expect(() => other.importJson('not json')).toThrow();
  });

  it('reorders people', () => {
    const a = store.addMember('Ann'); store.addMember('Bob');
    store.moveMember(a, 1);
    expect(store.data().members.map(m => m.name)).toEqual(['Bob', 'Ann']);
    store.moveMember(a, 1);
    expect(store.data().members.map(m => m.name)).toEqual(['Bob', 'Ann']);
  });
});
