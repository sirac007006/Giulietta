import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WarningLevel } from '@giulietta/protocol';
import { useSignal, useTelemetry } from '../telemetry';
import { colors, levelColor, mono } from '../theme';

interface Props {
  signal: string;
  /** Ako signal nije u definicijama (hello), koristi se ovaj label. */
  label?: string;
  decimals?: number;
  /** ID-jevi upozorenja (config/warnings.json) koja boje ovu pločicu. */
  warningIds?: string[];
  width: number;
  height: number;
}

/** Jedna vrijednost: label, veliki broj, jedinica i traka u opsegu min..max. */
export function SignalTile({ signal, label, decimals = 0, warningIds = [], width, height }: Props) {
  const { signals, state } = useTelemetry();
  const value = useSignal(signal);
  const meta = signals[signal];
  const min = meta?.min ?? 0;
  const max = meta?.max ?? 100;
  const frac = value === null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));

  let level: WarningLevel | null = null;
  for (const w of state?.warnings ?? []) {
    if (!warningIds.includes(w.id)) continue;
    if (level === null || w.level === 'critical' || (w.level === 'warning' && level === 'info')) level = w.level;
  }
  const tint = level ? levelColor[level] : colors.accent;

  return (
    <View style={[styles.tile, { width, height, borderColor: level ? tint : colors.hairline, padding: height * 0.11 }]}>
      <Text style={[styles.label, { fontSize: height * 0.11 }]} numberOfLines={1}>
        {(meta?.label ?? label ?? signal).toUpperCase()}
      </Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, mono, { fontSize: height * 0.3, color: value === null ? colors.dim : level ? tint : colors.text }]}>
          {value === null ? '--' : value.toFixed(decimals)}
        </Text>
        {meta?.unit ? <Text style={[styles.unit, { fontSize: height * 0.11 }]}>{meta.unit}</Text> : null}
      </View>
      <View style={[styles.track, { height: Math.max(4, height * 0.035) }]}>
        <View style={[styles.fill, { width: `${frac * 100}%`, backgroundColor: value === null ? colors.dim : tint }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, justifyContent: 'space-between' },
  label: { color: colors.muted, fontWeight: '700', letterSpacing: 1.2 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  value: { fontWeight: '700', includeFontPadding: false },
  unit: { color: colors.muted, fontWeight: '600', marginLeft: 6 },
  track: { backgroundColor: colors.track, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
