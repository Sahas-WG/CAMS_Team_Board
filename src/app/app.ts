import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { AmplifyAuthenticatorModule } from '@aws-amplify/ui-angular';
import { fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { FormsModule } from '@angular/forms';
import { BoardStore } from './board.store';
import { Icon } from './icon';
import { SelectValue } from './select-value';
import { Item, STATUSES } from './models';
import { BoardMode, SOON_DAYS, UNASSIGNED, boardTotals, buildBoard, initialsOf } from './team-board';
import { fmtDateShort, statusClass } from './util';

type ItemDraft = Omit<Item, 'id'> & { id: string | null };
type MemberDraft = { id: string | null; name: string; role: string };

/** The whole app is one page: the board, plus two small dialogs for editing a task and a person. */
@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, SelectValue, AmplifyAuthenticatorModule],
  host: { '(window:focus)': 'store.refresh()' },
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  readonly store = inject(BoardStore);

  /** Labels on the sign-in form. Accounts are created by invitation, so sign-up is hidden. */
  readonly formFields = {
    signIn: {
      username: { label: 'Work email', placeholder: 'name@organisation.com', isRequired: true },
      password: { label: 'Password', placeholder: 'Your password', isRequired: true },
    },
  };
  readonly syncText = computed(() => ({ idle: 'Saved', saving: 'Saving\u2026', error: 'Not saved' })[this.store.sync()]);

  private readonly stopHub: () => void;
  /** Other people's changes arrive on this timer, and whenever the window regains focus. */
  private readonly poll = setInterval(() => this.store.refresh(), 30_000);

  constructor() {
    // The board loads only once there is a Cognito session: the bucket needs its credentials.
    this.start();
    this.stopHub = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') this.start();
      if (payload.event === 'signedOut') this.store.reset();
    });
  }
  ngOnDestroy() { clearInterval(this.poll); this.stopHub(); }

  private async start() {
    try {
      const u = await getCurrentUser();
      let email = u.signInDetails?.loginId ?? '';
      try { email = (await fetchUserAttributes()).email ?? email; } catch { /* attributes are optional */ }
      this.store.user = email;
    } catch { return; /* not signed in yet */ }
    await this.store.init();
  }

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
  readonly totals = computed(() => boardTotals(this.store.data(), this.today, this.project()));

  /** One colour per person, by lane order, so a lane is recognisable at a glance. */
  private readonly palette = ['#2B5CE6', '#0E9F9A', '#7C5CE0', '#E0782B', '#D6457A', '#3A9B4B', '#B8860B'];
  personColour(i: number) { return this.palette[i % this.palette.length]; }
  /** The same colour by person, for the owner badges on a shared card. */
  colourOf(memberId: string) { return this.personColour(Math.max(0, this.store.data().members.findIndex(m => m.id === memberId))); }
  readonly initialsOf = initialsOf;
  ownerNames(ms: { name: string }[]) { return ms.map(m => m.name).join(', '); }

  readonly openAreas = signal<Set<string>>(new Set());
  isAreaOpen(k: string) { return this.openAreas().has(k); }
  toggleArea(k: string) { const s = new Set(this.openAreas()); s.has(k) ? s.delete(k) : s.add(k); this.openAreas.set(s); }
  setLead(area: string, e: Event) { this.store.setLead(area, (e.target as HTMLSelectElement).value); }

  emptyText() { return this.mode() === 'soon' ? 'Nothing due in the next ' + SOON_DAYS + ' days' : this.mode() === 'open' ? 'Nothing open' : 'Nothing here yet'; }

  // ---- task dialog
  readonly itemDraft = signal<ItemDraft | null>(null);
  newItem(laneKey: string) {
    this.itemDraft.set({ id: null, title: '', ownerIds: laneKey === UNASSIGNED ? [] : [laneKey], area: '', project: this.project(), status: 'Not started', due: '', notes: '' });
  }
  editItem(item: Item) { this.itemDraft.set({ ...item, ownerIds: [...item.ownerIds] }); }
  /** Tick or untick a person on the task being edited. */
  toggleOwner(id: string) {
    const d = this.itemDraft(); if (!d) return;
    this.itemDraft.set({ ...d, ownerIds: d.ownerIds.includes(id) ? d.ownerIds.filter(o => o !== id) : [...d.ownerIds, id] });
  }
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
    if (!confirm('Remove ' + d.name + ' from the board? Their tasks stay: shared ones with the other owners, the rest in Unassigned.')) return;
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
    if (!confirm('Replace the shared board for everyone with ' + file.name + '?')) return;
    try { this.store.importJson(await file.text()); } catch { alert('That file is not a Team Board export.'); }
  }
}
