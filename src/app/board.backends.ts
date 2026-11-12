import { InjectionToken } from '@angular/core';
import { BoardData } from './models';
import { BOARD_STORAGE } from './aws-config';

/** Where the board is kept. `load` returns null when no board has been saved yet. */
export interface BoardBackend {
  load(): Promise<unknown | null>;
  save(board: BoardData): Promise<void>;
}
export const BOARD_BACKEND = new InjectionToken<BoardBackend>('BOARD_BACKEND');

/** The shared board: one JSON object in the private bucket, reached with the signed-in user's credentials. */
export class CloudBackend implements BoardBackend {
  async load(): Promise<unknown | null> {
    // A presigned URL is unique per call, so neither the browser nor a proxy can hand back a stale copy.
    const { getUrl } = await import('aws-amplify/storage');
    const { url } = await getUrl({ path: BOARD_STORAGE.key, options: { validateObjectExistence: false, expiresIn: 60 } });
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Board: HTTP ' + res.status);
    return res.json();
  }
  async save(board: BoardData): Promise<void> {
    const { uploadData } = await import('aws-amplify/storage');
    await uploadData({ path: BOARD_STORAGE.key, data: new Blob([JSON.stringify(board)], { type: 'application/json' }) }).result;
  }
}

/** Keeps the board in memory only. Used by the tests. */
export class MemoryBackend implements BoardBackend {
  doc: unknown | null = null;
  failSave = false;
  async load() { return this.doc == null ? null : structuredClone(this.doc); }
  async save(board: BoardData) { if (this.failSave) throw new Error('save failed'); this.doc = structuredClone(board); }
}
