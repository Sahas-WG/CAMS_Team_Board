import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BoardStore } from './board.store';
import { Icon } from './icon';
import { SelectValue } from './select-value';
import { Item, STATUSES } from './models';
import { BoardMode, SOON_DAYS, UNASSIGNED, buildBoard } from './team-board';
import { fmtDateShort, statusClass } from './util';

type ItemDraft = Omit<Item, 'id'> & { id: string | null };
type MemberDraft = { id: string | null; name: string; role: string };

/** The whole app is one page: the board, plus two small dialogs for editing a task and a person. */
@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, SelectValue],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly store = inject(BoardStore);
  readonly statuses = STATUSES;
  readonly statusClass = statusClass; readonly fmtDateShort = fmtDateShort;
  readonly today = new Date();

  /** Individual task cards, or one card per broad responsibility (area). */
  readonly view = signal<'tasks' | 'areas'>('tasks');
  readonly mode = signal<BoardMode>('open');
  readonly modes: { key: BoardMode; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'soon', label: 'Due in ' + SOON_DAYS + ' days' },
    { key: 'all', label: 'All' },
  ];
  /** '' shows every project. */
  readonly project = signal('');

  readonly columns = computed(() => buildBoard(this.store.data(), this.today, this.mode(), this.project()));
  readonly totals = computed(() => {
    const cs = this.columns();
    return {
      open: cs.reduce((s, c) => s + c.open, 0),
      overdue: cs.reduce((s, c) => s + c.overdue, 0),
      unassigned: cs.find(c => c.unassigned)?.open ?? 0,
    };
  });

  /** One colour per person, by lane order, so a lane is recognisable at a glance. */
  private readonly palette = ['#2B5CE6', '#0E9F9A', '#7C5CE0', '#E0782B', '#D6457A', '#3A9B4B', '#B8860B'];
  personColour(i: number) { return this.palette[i % this.palette.length]; }

  readonly openAreas = signal<Set<string>>(new Set());
  isAreaOpen(k: string) { return this.openAreas().has(k); }
  toggleArea(k: string) { const s = new Set(this.openAreas()); s.has(k) ? s.delete(k) : s.add(k); this.openAreas.set(s); }
  setLead(area: string, e: Event) { this.store.setLead(area, (e.target as HTMLSelectElement).value); }

  emptyText() { return this.mode() === 'soon' ? 'Nothing due in the next ' + SOON_DAYS + ' days' : this.mode() === 'open' ? 'Nothing open' : 'Nothing here yet'; }

  // ---- task dialog
  readonly itemDraft = signal<ItemDraft | null>(null);
  newItem(laneKey: string) {
    this.itemDraft.set({ id: null, title: '', ownerId: laneKey === UNASSIGNED ? '' : laneKey, area: '', project: this.project(), status: 'Not started', due: '', notes: '' });
  }
  editItem(item: Item) { this.itemDraft.set({ ...item }); }
  saveItem() {
    const d = this.itemDraft(); if (!d) return;
    const { id, ...rest } = d;
    const clean = { ...rest, title: rest.title.trim() || 'Untitled', area: rest.area.trim(), project: rest.project.trim() };
    if (id) this.store.updateItem(id, clean); else this.store.addItem(clean);
    this.itemDraft.set(null);
  }
  deleteItem() {
    const d = this.itemDraft(); if (!d?.id) return;
    if (!confirm('Delete ' + d.id + ' "' + d.title + '"? This cannot be undone.')) return;
    this.store.removeItem(d.id); this.itemDraft.set(null);
  }

  // ---- person dialog
  readonly memberDraft = signal<MemberDraft | null>(null);
  newMember() { this.memberDraft.set({ id: null, name: '', role: '' }); }
  editMember(id: string) {
    const m = this.store.data().members.find(x => x.id === id);
    if (m) this.memberDraft.set({ ...m });
  }
  saveMember() {
    const d = this.memberDraft(); if (!d) return;
    if (!d.name.trim()) return;
    if (d.id) this.store.updateMember(d.id, { name: d.name.trim(), role: d.role.trim() }); else this.store.addMember(d.name, d.role);
    this.memberDraft.set(null);
  }
  deleteMember() {
    const d = this.memberDraft(); if (!d?.id) return;
    if (!confirm('Remove ' + d.name + ' from the board? Their tasks stay and move to Unassigned.')) return;
    this.store.removeMember(d.id); this.memberDraft.set(null);
  }
  moveMember(by: -1 | 1) { const d = this.memberDraft(); if (d?.id) this.store.moveMember(d.id, by); }

  // ---- backup
  exportBoard() {
    const url = URL.createObjectURL(new Blob([this.store.exportJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'team-board-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    URL.revokeObjectURL(url);
  }
  async importBoard(e: Event) {
    const input = e.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (this.store.data().items.length && !confirm('Replace the board in this browser with ' + file.name + '?')) return;
    try { this.store.importJson(await file.text()); } catch { alert('That file is not a Team Board export.'); }
  }
}
