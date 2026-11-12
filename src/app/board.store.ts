import { Inject, Injectable, computed, signal } from '@angular/core';
import { BoardData, EMPTY_BOARD, Item, Member } from './models';
import { BOARD_BACKEND, BoardBackend } from './board.backends';

/** Owners of a stored task: the current list, or the single `ownerId` that boards saved before shared cards carry. */
function ownersOf(i: unknown): string[] {
  const o = i as { ownerIds?: unknown; ownerId?: unknown };
  const list = Array.isArray(o.ownerIds) ? o.ownerIds : typeof o.ownerId === 'string' ? [o.ownerId] : [];
  return [...new Set(list.filter((x): x is string => typeof x === 'string' && x !== ''))];
}

/** Tolerant read of whatever was stored or imported, so an old or hand-edited file still loads. */
export function reviveBoard(raw: unknown): BoardData {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<BoardData>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const members: Member[] = (Array.isArray(o.members) ? o.members : [])
    .filter(m => m && str(m.id)).map(m => ({ id: str(m.id), name: str(m.name) || 'Unnamed', role: str(m.role) }));
  const items: Item[] = (Array.isArray(o.items) ? o.items : [])
    .filter(i => i && str(i.id)).map(i => ({
      id: str(i.id), title: str(i.title) || 'Untitled', ownerIds: ownersOf(i), area: str(i.area), project: str(i.project),
      status: str(i.status) || 'Not started', due: /^\d{4}-\d{2}-\d{2}$/.test(str(i.due)) ? str(i.due) : '', notes: str(i.notes),
    }));
  const leads: Record<string, string> = {};
  if (o.leads && typeof o.leads === 'object') for (const [k, v] of Object.entries(o.leads)) if (str(v)) leads[k] = str(v);
  const highest = Math.max(0, ...items.map(i => +(/(\d+)$/.exec(i.id)?.[1] ?? 0)));
  return {
    members, items, leads,
    nextId: Math.max(typeof o.nextId === 'number' ? o.nextId : 1, highest + 1),
    rev: typeof o.rev === 'number' ? o.rev : 0,
    updatedAt: str(o.updatedAt), updatedBy: str(o.updatedBy),
  };
}

/**
 * The single store. The board is one shared document that everyone signed in reads and writes.
 *
 * A change shows on screen at once, then is saved by re-reading the shared board, applying the same
 * change to that fresh copy and writing it back. So two people editing different things at the same
 * time both keep their change; only the very same field edited within the same second or two can
 * still be overwritten by the later save.
 */
@Injectable({ providedIn: 'root' })
export class BoardStore {
  constructor(@Inject(BOARD_BACKEND) private readonly backend: BoardBackend) {}

  readonly data = signal<BoardData>(structuredClone(EMPTY_BOARD));
  /** False until the shared board has been read once. */
  readonly loaded = signal(false);
  readonly sync = signal<'idle' | 'saving' | 'error'>('idle');
  /** Who is signed in; stamped on each save. */
  user = '';

  readonly areaNames = computed(() => [...new Set(this.data().items.map(i => i.area.trim()).filter(Boolean))].sort());
  readonly projectNames = computed(() => [...new Set(this.data().items.map(i => i.project.trim()).filter(Boolean))].sort());

  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  /** Resolves once every change made so far has been saved (or has failed). */
  whenIdle(): Promise<void> { return this.queue; }

  /** First read after sign-in. */
  async init() { await this.refresh(); }
  /** Forget the board on sign-out. */
  reset() { this.data.set(structuredClone(EMPTY_BOARD)); this.loaded.set(false); this.sync.set('idle'); }

  /** Pick up other people's changes. Skipped while a save of our own is in flight. */
  async refresh() {
    if (this.pending) return;
    try {
      const raw = await this.backend.load();
      if (this.pending) return;
      this.data.set(reviveBoard(raw));
      this.loaded.set(true);
      if (this.sync() === 'error') this.sync.set('idle');
    } catch (e) {
      console.warn('Board unavailable', e);
      this.sync.set('error');
    }
  }

  private mutate(fn: (d: BoardData) => void) {
    const local = structuredClone(this.data());
    fn(local);
    this.data.set(local);
    this.pending++;
    this.sync.set('saving');
    this.queue = this.queue.then(async () => {
      try {
        const latest = reviveBoard(await this.backend.load());
        fn(latest);
        latest.rev++; latest.updatedAt = new Date().toISOString(); latest.updatedBy = this.user;
        await this.backend.save(latest);
        this.pending--;
        if (!this.pending) { this.data.set(latest); this.sync.set('idle'); }
      } catch (e) {
        console.warn('Board not saved', e);
        this.pending--;
        // show what is really stored, so an unsaved change does not look saved
        if (!this.pending) { await this.refresh(); this.sync.set('error'); }
      }
    });
  }
  private uid() { return Math.random().toString(36).slice(2, 10); }

  addMember(name: string, role = ''): string {
    const id = this.uid();
    this.mutate(d => d.members.push({ id, name: name.trim() || 'New person', role: role.trim() }));
    return id;
  }
  updateMember(id: string, patch: Partial<Omit<Member, 'id'>>) {
    this.mutate(d => { const m = d.members.find(x => x.id === id); if (m) Object.assign(m, patch); });
  }
  /** Their tasks stay on the board: shared ones with the other owners, the rest in the Unassigned lane. */
  removeMember(id: string) {
    this.mutate(d => {
      d.members = d.members.filter(m => m.id !== id);
      d.items.forEach(i => { i.ownerIds = i.ownerIds.filter(o => o !== id); });
      for (const [area, lead] of Object.entries(d.leads)) if (lead === id) delete d.leads[area];
    });
  }
  moveMember(id: string, by: -1 | 1) {
    this.mutate(d => {
      const i = d.members.findIndex(m => m.id === id); const j = i + by;
      if (i < 0 || j < 0 || j >= d.members.length) return;
      [d.members[i], d.members[j]] = [d.members[j], d.members[i]];
    });
  }

  /** The number is taken when the change is saved, so two people adding at once get different numbers. */
  addItem(draft: Omit<Item, 'id'>) {
    this.mutate(d => { const id = 'T' + String(d.nextId).padStart(2, '0'); d.nextId++; d.items.push({ ...draft, id }); });
  }
  updateItem(id: string, patch: Partial<Omit<Item, 'id'>>) {
    this.mutate(d => { const i = d.items.find(x => x.id === id); if (i) Object.assign(i, patch); });
  }
  removeItem(id: string) { this.mutate(d => { d.items = d.items.filter(i => i.id !== id); }); }

  setLead(area: string, memberId: string) {
    this.mutate(d => { if (memberId) d.leads[area] = memberId; else delete d.leads[area]; });
  }

  exportJson(): string { return JSON.stringify(this.data(), null, 2); }
  /** Replaces the whole shared board. Throws if the text is not JSON. */
  importJson(text: string) {
    const next = reviveBoard(JSON.parse(text));
    this.mutate(d => { d.members = next.members; d.items = next.items; d.leads = next.leads; d.nextId = next.nextId; });
  }
}
