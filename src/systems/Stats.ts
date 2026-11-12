import { bus } from '../bus';
import { storage } from './StorageManager';

export interface Achievement {
  id: string;
  label: string;
  desc: string;
  score?: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', label: 'FIRST FLIGHT', desc: 'Flap your wings once' },
  { id: 's5', label: 'SCORE 5', desc: 'Pass 5 pipes in one run', score: 5 },
  { id: 's10', label: 'SCORE 10', desc: 'Pass 10 pipes in one run', score: 10 },
  { id: 's25', label: 'SCORE 25', desc: 'Pass 25 pipes in one run', score: 25 },
  { id: 's50', label: 'SCORE 50', desc: 'Pass 50 pipes in one run', score: 50 },
];

interface Data {
  best: number;
  games: number;
  crashes: number;
  pipes: number;
  unlocked: string[];
}

class Stats {
  d: Data = { best: 0, games: 0, crashes: 0, pipes: 0, unlocked: [], ...storage.getJSON<Partial<Data>>('stats', {}) };

  private save(): void {
    storage.setJSON('stats', this.d);
  }

  private unlock(id: string): Achievement | null {
    if (this.d.unlocked.includes(id)) return null;
    this.d.unlocked.push(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id) ?? null;
    if (a) bus.emit('achievement', a);
    return a;
  }

  startRun(): void {
    this.d.games++;
    this.save();
  }

  flap(): void {
    if (this.unlock('first')) this.save();
  }

  /** Called on every pipe passed. Returns achievements unlocked by this score. */
  pipe(score: number): Achievement[] {
    this.d.pipes++;
    const got = ACHIEVEMENTS.filter((a) => a.score !== undefined && score >= a.score)
      .map((a) => this.unlock(a.id))
      .filter((a): a is Achievement => a !== null);
    this.save();
    return got;
  }

  /** Called at run end (crash or quit). */
  endRun(score: number, crashed: boolean): { best: number; isNew: boolean } {
    const isNew = score > this.d.best;
    if (isNew) this.d.best = score;
    if (crashed) this.d.crashes++;
    this.save();
    return { best: this.d.best, isNew };
  }
}

export const stats = new Stats();
