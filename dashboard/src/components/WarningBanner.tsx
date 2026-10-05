import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { ActiveWarning } from '@giulietta/protocol';
import { useTelemetry } from '../telemetry';
import { colors, levelColor } from '../theme';
import { AlertIcon } from './Icons';

const rank = { critical: 3, warning: 2, info: 1 } as const;

/** Najvažnije aktivno upozorenje preko vrha ekrana. Kritično pulsira. */
export function WarningBanner({ height }: { height: number }) {
  const { state, conn } = useTelemetry();
  const pulse = useRef(new Animated.Value(1)).current;

  const active: ActiveWarning[] = conn === 'open' ? [...(state?.warnings ?? [])].sort((a, b) => rank[b.level] - rank[a.level]) : [];
  const top = active[0];
  const critical = top?.level === 'critical';

  useEffect(() => {
    if (!critical) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [critical, pulse]);

  if (!top) return null;
  const tint = levelColor[top.level];
  // Bijelo na crvenoj (kontrast ~5:1), tamno na žutoj/plavoj.
  const fg = critical ? '#FFFFFF' : colors.bg;
  return (
    <Animated.View style={[styles.banner, { height, backgroundColor: tint, opacity: pulse }]} accessibilityRole="alert">
      <AlertIcon size={height * 0.5} color={fg} />
      <Text style={[styles.text, { fontSize: height * 0.4, color: fg }]} numberOfLines={1}>
        {top.label}
      </Text>
      {active.length > 1 && (
        <View style={styles.more}>
          <Text style={[styles.moreText, { fontSize: height * 0.3, color: fg }]}>+{active.length - 1}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 12, left: 12, right: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 14, zIndex: 50 },
  text: { color: colors.bg, fontWeight: '800', flex: 1 },
  more: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  moreText: { color: colors.bg, fontWeight: '800' },
});
