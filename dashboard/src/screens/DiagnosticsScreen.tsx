import React, { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { DiagFrame } from '@giulietta/protocol';
import { useTelemetry } from '../telemetry';
import { colors, mono } from '../theme';

const hexId = (id: number) => `0x${id.toString(16).toUpperCase().padStart(id > 0x7ff ? 8 : 3, '0')}`;

/**
 * Dijagnostika i pomoć za reverse engineering (Faza 3): svi ID-jevi na busu,
 * frekvencija, bajtovi — bajtovi koji su se upravo promijenili su istaknuti (kao cansniffer).
 */
export function DiagnosticsScreen({ width, height }: { width: number; height: number }) {
  const { diag, setDiagSubscribed, state, signals, conn, host } = useTelemetry();

  useEffect(() => {
    setDiagSubscribed(true);
    return () => setDiagSubscribed(false);
  }, [setDiagSubscribed]);

  const names = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const s of Object.values(signals)) m.set(s.canId, [...(m.get(s.canId) ?? []), s.name]);
    return m;
  }, [signals]);

  const sideW = Math.round(width * 0.3);
  const can = state?.can;
  // 8 bajtova mora stati u ostatak reda: širina - bočni panel - padding - kolone ID/Hz/Broj
  const dataW = width - sideW - 32 - COL_ID - COL_HZ - COL_CNT;
  const byteW = Math.max(22, Math.min(40, Math.floor((dataW - 7 * BYTE_GAP) / 8)));

  return (
    <View style={[styles.root, { height }]}>
      <View style={styles.tableWrap}>
        <View style={[styles.row, styles.header]}>
          <Text style={[styles.h, styles.colId]}>ID</Text>
          <Text style={[styles.h, styles.colHz]}>Hz</Text>
          <Text style={[styles.h, styles.colCnt]}>Broj</Text>
          <Text style={[styles.h, styles.colData]}>Bajtovi 0–7</Text>
        </View>
        <FlatList
          data={diag}
          keyExtractor={(f) => String(f.id)}
          renderItem={({ item }) => <FrameRow f={item} signalNames={names.get(item.id)} byteW={byteW} />}
          ListEmptyComponent={<Text style={styles.empty}>{conn === 'open' ? 'Čekam frameove…' : 'Nema veze sa Pi-jem'}</Text>}
          initialNumToRender={20}
        />
      </View>

      <View style={[styles.side, { width: sideW }]}>
        <Section title="Veza">
          <KV k="Pi" v={conn === 'open' ? `povezan (${host})` : conn === 'connecting' ? 'povezujem…' : 'nema veze'} />
          <KV k="CAN izvor" v={can ? `${can.source}${can.iface ? ` · ${can.iface}` : ''}` : '--'} />
          <KV k="CAN stanje" v={can?.state ?? '--'} tint={can?.state === 'up' ? colors.ok : colors.alfa} />
          <KV k="Frameova/s" v={can ? String(can.fps) : '--'} />
          <KV k="ID-jeva" v={String(diag.length)} />
          {can?.error ? <Text style={styles.err}>{can.error}</Text> : null}
        </Section>
        <Section title="Dekodirani signali">
          {Object.values(signals).map((s) => {
            const v = state?.values[s.name];
            return <KV key={s.name} k={s.label ?? s.name} v={v === null || v === undefined ? '--' : `${round(v)} ${s.unit ?? ''}`} />;
          })}
        </Section>
      </View>
    </View>
  );
}

function FrameRow({ f, signalNames, byteW }: { f: DiagFrame; signalNames?: string[]; byteW: number }) {
  const bytes = f.data ? f.data.split(' ') : [];
  return (
    <View style={styles.row}>
      <View style={styles.colId}>
        <Text style={[styles.cell, mono, { color: f.known ? colors.ok : colors.text }]}>{hexId(f.id)}</Text>
        {signalNames ? <Text style={styles.sub} numberOfLines={1}>{signalNames.join(', ')}</Text> : null}
      </View>
      <Text style={[styles.cell, mono, styles.colHz]}>{f.hz < 10 ? f.hz.toFixed(1) : Math.round(f.hz)}</Text>
      <Text style={[styles.cell, mono, styles.colCnt, { color: colors.muted }]}>{f.count}</Text>
      <View style={[styles.colData, styles.bytes]}>
        {bytes.map((b, i) => {
          const changed = Math.floor(f.changed / 2 ** i) % 2 === 1; // bit i maske = bajt i
          return (
            <View key={i} style={[styles.byte, { width: byteW }, changed ? styles.byteChanged : null]}>
              <Text style={[styles.byteText, mono, { fontSize: Math.min(17, byteW * 0.48) }, changed ? { color: colors.bg } : null]}>{b}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function KV({ k, v, tint }: { k: string; v: string; tint?: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{k}</Text>
      <Text style={[styles.v, mono, tint ? { color: tint } : null]}>{v}</Text>
    </View>
  );
}

const COL_ID = 130;
const COL_HZ = 60;
const COL_CNT = 84;
const BYTE_GAP = 4;

const round = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  tableWrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  header: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  h: { color: colors.muted, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  colId: { width: COL_ID },
  colHz: { width: COL_HZ, textAlign: 'right', paddingRight: 12 },
  colCnt: { width: COL_CNT, textAlign: 'right', paddingRight: 16 },
  colData: { flex: 1 },
  cell: { color: colors.text, fontSize: 18, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 12 },
  bytes: { flexDirection: 'row', gap: BYTE_GAP },
  byte: { height: 32, borderRadius: 6, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  byteChanged: { backgroundColor: colors.warning },
  byteText: { color: colors.text, fontWeight: '600' },
  empty: { color: colors.muted, fontSize: 18, padding: 24 },
  side: { borderLeftWidth: 1, borderLeftColor: colors.hairline, padding: 16, gap: 20 },
  section: { gap: 6 },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '800', letterSpacing: 1.4, marginBottom: 4 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  k: { color: colors.muted, fontSize: 16 },
  v: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  err: { color: colors.alfa, fontSize: 14 },
});
