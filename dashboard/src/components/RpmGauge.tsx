import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';
import { REDLINE_RPM, RPM_MAX } from '../config';
import { colors, mono } from '../theme';

const START = 135; // stepeni, 0 = desno, smjer kazaljke
const SWEEP = 270;

function polar(c: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: c + r * Math.cos(rad), y: c + r * Math.sin(rad) };
}

function arc(c: number, r: number, from: number, to: number) {
  const a = polar(c, r, from);
  const b = polar(c, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

const angleFor = (rpm: number) => START + (Math.min(Math.max(rpm, 0), RPM_MAX) / RPM_MAX) * SWEEP;

interface Props {
  size: number;
  rpm: number | null;
  speed: number | null;
  gear: number | 'N' | null;
}

/** Glavni instrument: luk obrtaja sa brzinom i stepenom prenosa u sredini. */
export function RpmGauge({ size, rpm, speed, gear }: Props) {
  const c = size / 2;
  const stroke = size * 0.045;
  const r = c - stroke;
  const tickR = r - stroke * 1.1;
  const over = rpm !== null && rpm >= REDLINE_RPM;

  const ticks = [];
  for (let v = 0; v <= RPM_MAX; v += 250) {
    const major = v % 1000 === 0;
    const a = angleFor(v);
    const p1 = polar(c, tickR, a);
    const p2 = polar(c, tickR - (major ? size * 0.045 : size * 0.022), a);
    ticks.push(
      <Line
        key={`t${v}`}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={v >= REDLINE_RPM ? colors.alfa : major ? colors.muted : colors.dim}
        strokeWidth={major ? 3 : 1.5}
        strokeLinecap="round"
      />,
    );
    if (major) {
      const lp = polar(c, tickR - size * 0.095, a);
      ticks.push(
        <SvgText
          key={`l${v}`}
          x={lp.x}
          y={lp.y + size * 0.016}
          fill={v >= REDLINE_RPM ? colors.alfa : colors.muted}
          fontSize={size * 0.048}
          fontWeight="600"
          textAnchor="middle">
          {v / 1000}
        </SvgText>,
      );
    }
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G>
          <Path d={arc(c, r, START, START + SWEEP)} stroke={colors.track} strokeWidth={stroke} fill="none" strokeLinecap="round" />
          <Path d={arc(c, r + stroke * 0.75, angleFor(REDLINE_RPM), START + SWEEP)} stroke={colors.alfa} strokeWidth={stroke * 0.22} fill="none" />
          {rpm !== null && rpm > 0 && (
            <Path d={arc(c, r, START, angleFor(rpm))} stroke={over ? colors.alfa : colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round" />
          )}
          {ticks}
        </G>
      </Svg>

      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={[styles.speed, mono, { fontSize: size * 0.27, color: speed === null ? colors.dim : colors.text }]}>
          {speed === null ? '--' : Math.round(speed)}
        </Text>
        <Text style={[styles.unit, { fontSize: size * 0.045 }]}>km/h</Text>
        <View style={[styles.gear, { width: size * 0.15, height: size * 0.15, borderRadius: size * 0.03, marginTop: size * 0.03 }]}>
          <Text style={[styles.gearText, { fontSize: size * 0.1 }]}>{gear === null ? '–' : gear}</Text>
        </View>
      </View>

      <View style={[styles.rpmBox, { bottom: size * 0.04 }]} pointerEvents="none">
        <Text style={[styles.rpm, mono, { fontSize: size * 0.05, color: over ? colors.alfa : colors.muted }]}>
          {rpm === null ? '-- ' : Math.round(rpm / 10) * 10}
          <Text style={{ fontSize: size * 0.034 }}> o/min</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  speed: { fontWeight: '700', letterSpacing: -2, includeFontPadding: false },
  unit: { color: colors.muted, fontWeight: '600', marginTop: -4, letterSpacing: 1 },
  gear: { borderWidth: 2, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  gearText: { color: colors.text, fontWeight: '700', includeFontPadding: false },
  rpmBox: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  rpm: { fontWeight: '600' },
});
