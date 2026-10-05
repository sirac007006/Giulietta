import type { ActiveWarning, WarningCondition, WarningDef } from '@giulietta/protocol';

type Lookup = (signal: string) => number | null;

interface Tracker {
  def: WarningDef;
  active: boolean;
  since: number;
  /** Od kad uslov za promjenu stanja kontinuirano važi (debounce). */
  pendingSince: number | null;
}

export interface WarningChange {
  def: WarningDef;
  active: boolean;
}

/**
 * Pragovi sa histerezom i debounce-om. Bez toga sistem pišti neprekidno
 * kad se vrijednost klati oko granice.
 */
export class WarningEngine {
  private readonly trackers: Tracker[];

  constructor(defs: WarningDef[]) {
    for (const d of defs) validate(d);
    this.trackers = defs.map((def) => ({ def, active: false, since: 0, pendingSince: null }));
  }

  evaluate(lookup: Lookup, now = Date.now()): WarningChange[] {
    const changes: WarningChange[] = [];
    for (const tr of this.trackers) {
      const { def } = tr;
      const v = lookup(def.signal);
      // Nema podatka (stale) => upozorenje se gasi odmah; ne pištimo na osnovu starih vrijednosti.
      if (v === null) {
        tr.pendingSince = null;
        if (tr.active) {
          tr.active = false;
          changes.push({ def, active: false });
        }
        continue;
      }
      const wantChange = tr.active ? shouldRelease(def, v, lookup) : shouldTrigger(def, v, lookup);
      if (!wantChange) {
        tr.pendingSince = null;
        continue;
      }
      tr.pendingSince ??= now;
      if (now - tr.pendingSince >= (def.delayMs ?? 0)) {
        tr.active = !tr.active;
        tr.since = now;
        tr.pendingSince = null;
        changes.push({ def, active: tr.active });
      }
    }
    return changes;
  }

  active(): ActiveWarning[] {
    return this.trackers
      .filter((t) => t.active)
      .map((t) => ({ id: t.def.id, label: t.def.label, level: t.def.level, since: t.since }));
  }

  defs(): WarningDef[] {
    return this.trackers.map((t) => t.def);
  }

  /** Mijenja pragove postojećeg upozorenja; stanje (aktivno/neaktivno) se ponovo procjenjuje. */
  update(id: string, on: number, off: number): WarningDef {
    const tr = this.trackers.find((t) => t.def.id === id);
    if (!tr) throw new Error(`Nepoznato upozorenje: ${id}`);
    if (!Number.isFinite(on) || !Number.isFinite(off)) throw new Error('Pragovi moraju biti brojevi');
    const def = { ...tr.def, on, off };
    validate(def);
    tr.def = def;
    tr.pendingSince = null;
    return def;
  }
}

function cmp(op: '>' | '<', v: number, threshold: number) {
  return op === '>' ? v > threshold : v < threshold;
}

function condHolds(c: WarningCondition | undefined, lookup: Lookup) {
  if (!c) return true;
  const v = lookup(c.signal);
  return v !== null && cmp(c.op, v, c.value);
}

function shouldTrigger(def: WarningDef, v: number, lookup: Lookup) {
  return cmp(def.op, v, def.on) && condHolds(def.and, lookup);
}

function shouldRelease(def: WarningDef, v: number, lookup: Lookup) {
  // Pušta se kad vrijednost pređe "off" prag u suprotnom smjeru, ili kad dodatni uslov prestane.
  const pastOff = def.op === '>' ? v < def.off : v > def.off;
  return pastOff || !condHolds(def.and, lookup);
}

function validate(d: WarningDef) {
  if (d.op === '>' && d.off > d.on) throw new Error(`Upozorenje ${d.id}: za ">" mora off <= on`);
  if (d.op === '<' && d.off < d.on) throw new Error(`Upozorenje ${d.id}: za "<" mora off >= on`);
}
