import { Injectable, computed, signal } from '@angular/core';
import { BoardData, EMPTY_BOARD, Item, Member } from './models';

const LS_KEY = 'cams-team-board/v1';

/** Tolerant read of whatever was stored or imported, so an old or hand-edited file still loads. */
export function reviveBoard(raw: unknown): BoardData {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<BoardData>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const members: Member[] = (Array.isArray(o.members) ? o.members : [])
    .filter(m => m && str(m.id)).map(m => ({ id: str(m.id), name: str(m.name) || 'Unnamed', role: str(m.role) }));
  const items: Item[] = (Array.isArray(o.items) ? o.items : [])
    .filter(i => i && str(i.id)).map(i => ({
      id: str(i.id), title: str(i.title) || 'Untitled', ownerId: str(i.ownerId), area: str(i.area), project: str(i.project),
      status: str(i.status) || 'Not started', due: /^\d{4}-\d{2}-\d{2}$/.test(str(i.due)) ? str(i.due) : '', notes: str(i.notes),
    }));
  const leads: Record<string, string> = {};
  if (o.leads && typeof o.leads === 'object') for (const [k, v] of Object.entries(o.leads)) if (str(v)) leads[k] = str(v);
  const highest = Math.max(0, ...items.map(i => +(/(\d+)$/.exec(i.id)?.[1] ?? 0)));
  return { members, items, leads, nextId: Math.max(typeof o.nextId === 'number' ? o.nextId : 1, highest + 1) };
}

/**
 * The single store. Today it keeps the board in this browser's localStorage, so the board is
 * per-browser: use Export / Import to move it. `load` and `persist` are the only two places that
 * touch storage, so swapping in a shared backend later means changing those and nothing else.
 */
@Injectable({ providedIn: 'root' })
export class BoardStore {
  readonly data = signal<BoardData>(this.load());

  readonly areaNames = computed(() => [...new Set(this.data().items.map(i => i.area.trim()).filter(Boolean))].sort());
  readonly projectNames = computed(() => [...new Set(this.data().items.map(i => i.project.trim()).filter(Boolean))].sort());

  private load(): BoardData {
    try { const s = localStorage.getItem(LS_KEY); return s ? reviveBoard(JSON.parse(s)) : structuredClone(EMPTY_BOARD); }
    catch { return structuredClone(EMPTY_BOARD); }
  }
  private persist(d: BoardData) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* storage full or blocked */ } }

  private mutate(fn: (d: BoardData) => void) {
    const d = structuredClone(this.data());
    fn(d);
    this.data.set(d);
    this.persist(d);
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
  /** Their items stay on the board and fall into the Unassigned lane. */
  removeMember(id: string) {
    this.mutate(d => {
      d.members = d.members.filter(m => m.id !== id);
      d.items.forEach(i => { if (i.ownerId === id) i.ownerId = ''; });
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

  addItem(draft: Omit<Item, 'id'>): string {
    let id = '';
    this.mutate(d => { id = 'T' + String(d.nextId).padStart(2, '0'); d.nextId++; d.items.push({ ...draft, id }); });
    return id;
  }
  updateItem(id: string, patch: Partial<Omit<Item, 'id'>>) {
    this.mutate(d => { const i = d.items.find(x => x.id === id); if (i) Object.assign(i, patch); });
  }
  removeItem(id: string) { this.mutate(d => { d.items = d.items.filter(i => i.id !== id); }); }

  setLead(area: string, memberId: string) {
    this.mutate(d => { if (memberId) d.leads[area] = memberId; else delete d.leads[area]; });
  }

  exportJson(): string { return JSON.stringify(this.data(), null, 2); }
  /** Replaces the whole board. Throws if the text is not JSON. */
  importJson(text: string) { const d = reviveBoard(JSON.parse(text)); this.data.set(d); this.persist(d); }
}
