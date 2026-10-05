import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { WarningInfo } from '@giulietta/protocol';
import { useSettings } from '../settings';
import { playSound } from '../sound';
import { useTelemetry } from '../telemetry';
import { colors, levelColor, mono } from '../theme';

/** Korak promjene praga po signalu (dugmad − / +). */
const STEP: Record<string, number> = { speed: 5, rpm: 100, egt: 10, battery_voltage: 0.1, boost: 0.05 };
const stepFor = (w: WarningInfo) => STEP[w.signal] ?? 1;
const fmt = (v: number, step: number) => (step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(v)));

export function SettingsScreen({ width, height, onEditHost }: { width: number; height: number; onEditHost(): void }) {
  const { warningDefs, setWarning, signals, conn, host, state } = useTelemetry();
  const { soundOn, update } = useSettings();
  const sideW = Math.round(width * 0.38);
  const log = state?.log;

  const change = (w: WarningInfo, dir: 1 | -1) => {
    const step = stepFor(w);
    const gap = w.on - w.off; // histereza ostaje ista
    const on = Math.round((w.on + dir * step) * 100) / 100;
    setWarning(w.id, on, Math.round((on - gap) * 100) / 100);
  };

  return (
    <View style={[styles.root, { height }]}>
      <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
        <Text style={styles.sectionTitle}>PRAGOVI UPOZORENJA</Text>
        {conn !== 'open' && <Text style={styles.muted}>Pragovi se čuvaju na Pi-ju — potrebna je veza.</Text>}
        {warningDefs.map((w) => {
          const step = stepFor(w);
          const unit = signals[w.signal]?.unit ?? '';
          return (
            <View key={w.id} style={styles.warnRow}>
              <View style={[styles.levelBar, { backgroundColor: levelColor[w.level] }]} />
              <View style={styles.warnText}>
                <Text style={styles.warnLabel} numberOfLines={1}>
                  {w.label}
                </Text>
                <Text style={styles.muted}>
                  {signals[w.signal]?.label ?? w.signal} {w.op} prag · gasi se na {fmt(w.off, step)} {unit}
                </Text>
              </View>
              <Stepper value={`${fmt(w.on, step)} ${unit}`} onMinus={() => change(w, -1)} onPlus={() => change(w, 1)} disabled={conn !== 'open'} />
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.side, { width: sideW }]}>
        <Text style={styles.sectionTitle}>VEZA</Text>
        <Row k="Pi adresa" v={host} />
        <Big label="Promijeni adresu" onPress={onEditHost} />

        <Text style={[styles.sectionTitle, styles.gapTop]}>ZVUK</Text>
        <View style={styles.row}>
          <Text style={styles.k}>Zvučna upozorenja</Text>
          <Switch value={soundOn} onValueChange={(v) => update({ soundOn: v })} trackColor={{ true: colors.ok, false: colors.track }} thumbColor={colors.text} />
        </View>
        <View style={styles.btnRow}>
          <Big label="Probaj" onPress={() => playSound('warning')} flex />
          <Big label="Kritično" onPress={() => playSound('critical')} flex />
        </View>

        <Text style={[styles.sectionTitle, styles.gapTop]}>LOG VOŽNJE</Text>
        {log ? (
          <>
            <Row k="Vožnja" v={log.tripId.slice(0, 8)} />
            <Row k="Za slanje" v={`${log.pending} uzoraka`} />
            <Row
              k="Postgres"
              v={!log.sync ? 'nije podešen' : log.sync.lastError ? 'offline' : log.sync.lastSyncAt ? `poslato ${ago(log.sync.lastSyncAt)}` : 'čekam'}
              tint={!log.sync ? colors.muted : log.sync.lastError ? colors.warning : colors.ok}
            />
          </>
        ) : (
          <Text style={styles.muted}>{conn === 'open' ? 'Logovanje je isključeno na Pi-ju.' : '--'}</Text>
        )}
      </View>
    </View>
  );
}

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? `prije ${s} s` : `prije ${Math.round(s / 60)} min`;
}

function Stepper({ value, onMinus, onPlus, disabled }: { value: string; onMinus(): void; onPlus(): void; disabled: boolean }) {
  return (
    <View style={[styles.stepper, disabled && styles.disabled]}>
      <Pressable onPress={onMinus} disabled={disabled} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="Smanji">
        <Text style={styles.stepTxt}>−</Text>
      </Pressable>
      <Text style={[styles.stepValue, mono]}>{value}</Text>
      <Pressable onPress={onPlus} disabled={disabled} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel="Povećaj">
        <Text style={styles.stepTxt}>+</Text>
      </Pressable>
    </View>
  );
}

function Big({ label, onPress, flex }: { label: string; onPress(): void; flex?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.big, flex && styles.flex1]} android_ripple={{ color: colors.hairline }} accessibilityRole="button">
      <Text style={styles.bigTxt}>{label}</Text>
    </Pressable>
  );
}

function Row({ k, v, tint }: { k: string; v: string; tint?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{k}</Text>
      <Text style={[styles.v, mono, tint ? { color: tint } : null]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
  mainContent: { padding: 16, gap: 10 },
  side: { borderLeftWidth: 1, borderLeftColor: colors.hairline, padding: 16, gap: 10 },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '800', letterSpacing: 1.4 },
  gapTop: { marginTop: 12 },
  muted: { color: colors.muted, fontSize: 14 },
  warnRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, paddingRight: 10, minHeight: 72, overflow: 'hidden' },
  levelBar: { width: 5, alignSelf: 'stretch', marginRight: 14 },
  warnText: { flex: 1, gap: 2, paddingVertical: 8 },
  warnLabel: { color: colors.text, fontSize: 18, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  disabled: { opacity: 0.4 },
  stepBtn: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: colors.text, fontSize: 30, fontWeight: '600', marginTop: -2 },
  stepValue: { color: colors.text, fontSize: 19, fontWeight: '700', minWidth: 110, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32, gap: 8 },
  k: { color: colors.muted, fontSize: 16 },
  v: { color: colors.text, fontSize: 16, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  btnRow: { flexDirection: 'row', gap: 10 },
  big: { height: 56, borderRadius: 12, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  flex1: { flex: 1 },
  bigTxt: { color: colors.text, fontSize: 17, fontWeight: '700' },
});
