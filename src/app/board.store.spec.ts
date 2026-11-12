import { BoardStore, reviveBoard } from './board.store';
import { MemoryBackend } from './board.backends';
import { BoardData } from './models';

describe('reviveBoard', () => {
  const empty = { members: [], items: [], leads: {}, nextId: 1, rev: 0, updatedAt: '', updatedBy: '' };

  it('returns an empty board for junk or nothing', () => {
    expect(reviveBoard(null)).toEqual(empty);
    expect(reviveBoard('x')).toEqual(empty);
  });

  it('fills gaps, drops rows without an id and bad dates, and keeps numbering ahead of existing items', () => {
    const d = reviveBoard({
      members: [{ id: 'a', name: 'Ann' }, { name: 'no id' }],
      items: [{ id: 'T07', title: 'One', ownerId: 'a', due: '2026-12-01' }, { id: 'T03', due: 'next week', ownerIds: ['a', 'b', 'a', '', 7] }, { title: 'no id' }],
      leads: { Reporting: 'a', Empty: '' },
      nextId: 2, rev: 5,
    });
    expect(d.members).toEqual([{ id: 'a', name: 'Ann', role: '' }]);
    expect(d.items.map(i => [i.id, i.title, i.status, i.due])).toEqual([['T07', 'One', 'Not started', '2026-12-01'], ['T03', 'Untitled', 'Not started', '']]);
    // a board saved before shared cards has one ownerId; the list form is de-duplicated and cleaned
    expect(d.items.map(i => i.ownerIds)).toEqual([['a'], ['a', 'b']]);
    expect(d.leads).toEqual({ Reporting: 'a' });
    expect([d.nextId, d.rev]).toEqual([8, 5]);
  });
});

describe('BoardStore', () => {
  let backend: MemoryBackend;
  let store: BoardStore;
  const saved = () => backend.doc as BoardData;
  const draft = (ownerId: string, area = 'Reporting') => ({ title: 'Do it', ownerIds: [ownerId], area, project: 'UoM', status: 'Not started', due: '', notes: '' });
  beforeEach(async () => { backend = new MemoryBackend(); store = new BoardStore(backend); await store.init(); });

  it('is not loaded until the shared board has been read', async () => {
    const fresh = new BoardStore(backend);
    expect(fresh.loaded()).toBeFalse();
    await fresh.init();
    expect(fresh.loaded()).toBeTrue();
  });

  it('shows a change at once and saves it to the shared board, stamped with who made it', async () => {
    store.user = 'ann@example.com';
    const a = store.addMember(' Ann ', 'Lead');
    store.addItem(draft(a)); store.addItem(draft(a));
    expect(store.data().items.map(i => i.id)).toEqual(['T01', 'T02']);
    expect(store.sync()).toBe('saving');
    await store.whenIdle();
    expect(store.sync()).toBe('idle');
    expect(saved().members).toEqual([{ id: a, name: 'Ann', role: 'Lead' }]);
    expect(saved().items.map(i => i.id)).toEqual(['T01', 'T02']);
    expect([saved().rev, saved().updatedBy]).toEqual([3, 'ann@example.com']);
  });

  it('keeps both changes when two people edit from the same starting point', async () => {
    const other = new BoardStore(backend); await other.init();
    const a = store.addMember('Ann'); await store.whenIdle();
    await other.refresh();
    store.addItem({ ...draft(a), title: 'Mine' }); await store.whenIdle();
    // `other` has not seen "Mine" yet, and adds its own
    other.addItem({ ...draft(a), title: 'Theirs' }); await other.whenIdle();
    expect(saved().items.map(i => [i.id, i.title])).toEqual([['T01', 'Mine'], ['T02', 'Theirs']]);
    expect(other.data().items.map(i => i.title)).toEqual(['Mine', 'Theirs']);
    await store.refresh();
    expect(store.data().items.map(i => i.title)).toEqual(['Mine', 'Theirs']);
  });

  it('does not leave an unsaved change on screen when the save fails', async () => {
    const a = store.addMember('Ann'); await store.whenIdle();
    backend.failSave = true;
    store.addItem(draft(a));
    expect(store.data().items.length).toBe(1);
    await store.whenIdle();
    expect(store.sync()).toBe('error');
    expect(store.data().items.length).toBe(0);
    backend.failSave = false;
    store.addItem(draft(a)); await store.whenIdle();
    expect([store.sync(), saved().items.length]).toEqual(['idle', 1]);
  });

  it('leaves a removed person’s tasks on the board and clears their leads', async () => {
    const a = store.addMember('Ann'); const b = store.addMember('Bob');
    store.addItem(draft(a)); store.addItem({ ...draft(a), ownerIds: [a, b] }); store.setLead('Reporting', a); store.setLead('SSO', b);
    store.removeMember(a);
    await store.whenIdle();
    expect(saved().members.map(m => m.name)).toEqual(['Bob']);
    expect(saved().items.map(i => i.ownerIds)).toEqual([[], [b]]);
    expect(saved().leads).toEqual({ SSO: b });
  });

  it('lists the areas and projects in use', () => {
    const a = store.addMember('Ann');
    store.addItem(draft(a, 'SSO')); store.addItem(draft(a, ' Reporting ')); store.addItem(draft(a, ''));
    expect(store.areaNames()).toEqual(['Reporting', 'SSO']);
    expect(store.projectNames()).toEqual(['UoM']);
  });

  it('imports an exported board over the shared one, and rejects text that is not JSON', async () => {
    const a = store.addMember('Ann'); store.addItem(draft(a)); await store.whenIdle();
    const text = store.exportJson();
    const elsewhere = new MemoryBackend(); const other = new BoardStore(elsewhere); await other.init();
    other.addMember('Someone else'); await other.whenIdle();
    other.importJson(text); await other.whenIdle();
    const got = elsewhere.doc as BoardData;
    expect([got.members, got.items, got.nextId]).toEqual([saved().members, saved().items, saved().nextId]);
    expect(() => other.importJson('not json')).toThrow();
  });

  it('reorders people', async () => {
    const a = store.addMember('Ann'); store.addMember('Bob');
    store.moveMember(a, 1); store.moveMember(a, 1);
    await store.whenIdle();
    expect(saved().members.map(m => m.name)).toEqual(['Bob', 'Ann']);
  });

  it('forgets the board on sign-out', async () => {
    store.addMember('Ann'); await store.whenIdle();
    store.reset();
    expect([store.loaded(), store.data().members.length]).toEqual([false, 0]);
  });
});
