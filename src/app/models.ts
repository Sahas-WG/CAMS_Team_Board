/** The data contract for the Team Board. Everything the app keeps is one BoardData object. */

export const STATUSES = ['Not started', 'In progress', 'Blocked', 'Complete'] as const;

export interface Member {
  id: string;
  name: string;
  /** Free text shown under the name, e.g. "Project Coordinator". */
  role: string;
}

export interface Item {
  /** Short display number, e.g. "T12". Unique within the board. */
  id: string;
  title: string;
  /** Member.id of everyone doing it. Several ids make it a shared card; empty means nobody owns it yet. */
  ownerIds: string[];
  /** The broad responsibility it belongs to, e.g. "Reporting". Free text. */
  area: string;
  /** The client or engagement it is for, e.g. "UoM". Free text, optional. */
  project: string;
  status: string;
  /** Due date as yyyy-mm-dd, or '' when open-ended. */
  due: string;
  notes: string;
}

export interface BoardData {
  members: Member[];
  items: Item[];
  /** Chosen lead per area: area name -> Member.id. Areas without an entry get an inferred lead. */
  leads: Record<string, string>;
  /** Next number to hand out for Item.id. */
  nextId: number;
  /** Counts saves of the shared board; with who and when the last one was. */
  rev: number;
  updatedAt?: string;
  updatedBy?: string;
}

export const EMPTY_BOARD: BoardData = { members: [], items: [], leads: {}, nextId: 1, rev: 0 };
