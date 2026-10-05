import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RpmGauge } from '../components/RpmGauge';
import { SignalTile } from '../components/SignalTile';
import { estimateGear } from '../gear';
import { useSignal } from '../telemetry';

// Pločice desno od glavnog instrumenta. Imena signala moraju postojati u signals/giulietta.json;
// ako signal ne postoji (još nije dekodiran), pločica pokazuje "--".
const TILES: { signal: string; label: string; decimals?: number; warningIds?: string[] }[] = [
  { signal: 'coolant_temp', label: 'Rashladna', warningIds: ['coolant_hot'] },
  { signal: 'boost', label: 'Boost', decimals: 2 },
  { signal: 'egt', label: 'EGT', warningIds: ['egt_high'] },
  { signal: 'intake_temp', label: 'Usis' },
  { signal: 'fuel_level', label: 'Gorivo', warningIds: ['fuel_low'] },
  { signal: 'battery_voltage', label: 'Akumulator', decimals: 1, warningIds: ['battery_low'] },
];

export function ClusterScreen({ width, height }: { width: number; height: number }) {
  const rpm = useSignal('rpm');
  const speed = useSignal('speed');
  const gear = estimateGear(speed, rpm);

  const pad = Math.round(height * 0.04);
  const gaugeSize = Math.min(height - pad * 2, width * 0.52);
  const gridW = width - gaugeSize - pad * 3;
  const gap = Math.round(pad * 0.6);
  const tileW = (gridW - gap) / 2;
  const tileH = (height - pad * 2 - gap * 2) / 3;

  return (
    <View style={[styles.root, { padding: pad, gap: pad }]}>
      <RpmGauge size={gaugeSize} rpm={rpm} speed={speed} gear={gear} />
      <View style={[styles.grid, { width: gridW, gap }]}>
        {TILES.map((t) => (
          <SignalTile key={t.signal} {...t} width={tileW} height={tileH} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center' },
});
