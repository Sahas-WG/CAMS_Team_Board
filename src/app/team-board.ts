import { BoardData, Item, Member } from './models';

/** Which cards the board shows: work still open, open work due within two weeks, or everything. */
export type BoardMode = 'open' | 'soon' | 'all';

export interface BoardCard { item: Item; done: boolean; overdue: boolean; soon: boolean; dueDate?: Date; }

/** One broad responsibility: a whole area, shown once, under the one person who leads it.
 *  It covers every item in the area, whoever owns the individual items. */
export interface BoardArea {
  name: string; cards: BoardCard[];
  total: number; open: number; inProgress: number; overdue: number; done: number;
  /** Earliest due date among the open items. */
  nextDue?: Date;
  /** Member.id of the lead, and whether it was chosen (true) or inferred from who owns most of the items. */
  leadId?: string; chosen: boolean;
  /** Initials of the other people who own items in the area. */
  helpers: string[];
}

export interface BoardColumn {
  /** Member.id, or 'unassigned' for the catch-all lane. */
  key: string; name: string; initials: string; role: string;
  unassigned: boolean;
  cards: BoardCard[];
  areas: BoardArea[];
  /** Counts over all of the person's items, whatever the mode shows. */
  total: number; open: number; overdue: number; done: number;
}

const DAY = 864e5;
export const SOON_DAYS = 14;
export const UNASSIGNED = 'unassigned';

export const isDone = (i: Item) => /^complete/i.test(i.status || '');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** yyyy-mm-dd as a local date (not UTC, which would shift the day west of Greenwich). */
export const parseDue = (s: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : undefined;
};
export const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';

export function buildBoard(data: BoardData, today: Date, mode: BoardMode, project = ''): BoardColumn[] {
  const t0 = startOfDay(today);
  const byId = new Map(data.members.map(m => [m.id, m]));
  const items = project ? data.items.filter(i => i.project === project) : data.items;

  const card = (item: Item): BoardCard => {
    const done = isDone(item);
    const dueDate = parseDue(item.due);
    const end = dueDate ? dueDate.getTime() : null;
    return { item, done, dueDate, overdue: !done && end != null && end < t0, soon: !done && end != null && end <= t0 + SOON_DAYS * DAY };
  };
  const rank = (c: BoardCard) => c.done ? 4 : c.overdue ? 0 : /^in progress/i.test(c.item.status) ? 1 : /^blocked/i.test(c.item.status) ? 2 : 3;
  const order = (a: BoardCard, b: BoardCard) =>
    rank(a) - rank(b) || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) || a.item.id.localeCompare(b.item.id, undefined, { numeric: true });
  const shown = (c: BoardCard) => mode === 'all' ? true : mode === 'soon' ? c.soon : !c.done;

  // Areas are worked out across the whole board first, so each appears exactly once.
  const areaShown = (ar: BoardArea) => mode === 'all' ? true : mode === 'soon' ? ar.cards.some(c => c.soon) : ar.open > 0;
  const allAreas = areasOf(items.map(card).sort(order)).map(ar => {
    const owners = new Map<Member, number>();
    for (const c of ar.cards) { const m = byId.get(c.item.ownerId); if (m) owners.set(m, (owners.get(m) ?? 0) + 1); }
    const picked = byId.get(data.leads[ar.name] ?? '');
    // no lead chosen: whoever owns most of its items (the earlier person on the board on a tie)
    const inferred = data.members.filter(m => owners.has(m)).sort((a, b) => owners.get(b)! - owners.get(a)!)[0];
    const lead = picked ?? inferred;
    return { ...ar, leadId: lead?.id, chosen: !!picked, helpers: [...owners.keys()].filter(m => m !== lead).map(m => initialsOf(m.name)) };
  }).filter(areaShown);

  const column = (key: string, name: string, role: string, unassigned: boolean, mine: Item[]): BoardColumn => {
    const all = mine.map(card);
    return {
      key, name, role, unassigned, initials: unassigned ? '?' : initialsOf(name),
      cards: all.filter(shown).sort(order),
      areas: allAreas.filter(ar => unassigned ? !ar.leadId : ar.leadId === key),
      total: all.length,
      open: all.filter(c => !c.done).length,
      overdue: all.filter(c => c.overdue).length,
      done: all.filter(c => c.done).length,
    };
  };

  const cols = data.members.map(m => column(m.id, m.name, m.role, false, items.filter(i => i.ownerId === m.id)));
  const orphans = items.filter(i => !byId.has(i.ownerId));
  if (orphans.length || allAreas.some(ar => !ar.leadId)) cols.push(column(UNASSIGNED, 'Unassigned', 'Nobody owns these yet', true, orphans));
  return cols;
}

/** Roll cards up by area. Busiest area first; an area with nothing open sinks to the bottom. */
export function areasOf(cards: BoardCard[]): Omit<BoardArea, 'leadId' | 'chosen' | 'helpers'>[] {
  const by = new Map<string, BoardCard[]>();
  for (const c of cards) {
    const k = c.item.area.trim() || 'Other';
    by.set(k, [...(by.get(k) ?? []), c]);
  }
  return [...by.entries()].map(([name, cs]) => {
    const openCards = cs.filter(c => !c.done);
    const due = openCards.map(c => c.dueDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    return {
      name, cards: cs, total: cs.length, open: openCards.length,
      inProgress: cs.filter(c => /^in progress/i.test(c.item.status)).length,
      overdue: cs.filter(c => c.overdue).length,
      done: cs.length - openCards.length,
      nextDue: due[0],
    };
  }).sort((a, b) => b.open - a.open || b.total - a.total || a.name.localeCompare(b.name));
}
