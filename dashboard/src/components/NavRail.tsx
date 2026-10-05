import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { ActivityIcon, GaugeIcon, SlidersIcon } from './Icons';

export type Tab = 'cluster' | 'diag' | 'settings';

const TABS: { id: Tab; label: string; Icon: typeof GaugeIcon }[] = [
  { id: 'cluster', label: 'Instrumenti', Icon: GaugeIcon },
  { id: 'diag', label: 'Dijagnostika', Icon: ActivityIcon },
  { id: 'settings', label: 'Podešavanja', Icon: SlidersIcon },
];

/** Lijeva navigacija sa velikim touch targetima (vozač ne gleda dugo u ekran). */
export function NavRail({ width, tab, onTab }: { width: number; tab: Tab; onTab(t: Tab): void }) {
  return (
    <View style={[styles.rail, { width }]}>
      {TABS.map(({ id, label, Icon }) => {
        const active = id === tab;
        return (
          <Pressable
            key={id}
            onPress={() => onTab(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            android_ripple={{ color: colors.surfaceHi }}
            style={[styles.item, { height: width * 1.05 }, active && styles.active]}>
            <Icon size={width * 0.38} color={active ? colors.text : colors.muted} />
            <Text style={[styles.label, { fontSize: width * 0.125, color: active ? colors.text : colors.muted }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { borderRightWidth: 1, borderRightColor: colors.hairline, paddingVertical: 8, gap: 8, alignItems: 'stretch' },
  item: { alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 8, borderRadius: 14 },
  active: { backgroundColor: colors.surfaceHi },
  label: { fontWeight: '600' },
});
