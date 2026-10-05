import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTelemetry } from '../telemetry';
import { colors, mono } from '../theme';
import { Dot } from './Icons';

/** Gornja traka: veza sa Pi-jem, stanje CAN-a, sat. Dugi pritisak otvara podešavanje adrese. */
export function StatusBar({ height, onLongPress }: { height: number; onLongPress(): void }) {
  const { conn, state, host } = useTelemetry();
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const can = state?.can;
  const piOk = conn === 'open';
  const canOk = piOk && can?.state === 'up';
  const fs = height * 0.36;

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={800} style={[styles.bar, { height, paddingHorizontal: height * 0.4 }]}>
      <View style={styles.group}>
        <Dot size={fs * 0.6} color={piOk ? colors.ok : conn === 'connecting' ? colors.warning : colors.alfa} />
        <Text style={[styles.text, { fontSize: fs }]}>{piOk ? 'Pi' : conn === 'connecting' ? `Tražim Pi (${host})` : 'Nema veze sa Pi-jem'}</Text>
        {piOk && (
          <>
            <View style={styles.sep} />
            <Dot size={fs * 0.6} color={canOk ? colors.ok : colors.alfa} />
            <Text style={[styles.text, { fontSize: fs }]}>
              CAN {can?.source === 'socketcan' ? can.iface : can?.source?.toUpperCase()}
              {canOk ? '' : ` — ${can?.state ?? '?'}`}
            </Text>
            {canOk && <Text style={[styles.muted, mono, { fontSize: fs }]}>{can?.fps} fr/s</Text>}
          </>
        )}
      </View>
      <Text style={[styles.clock, mono, { fontSize: fs * 1.15 }]}>
        {time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.hairline },
  group: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sep: { width: 1, height: '50%', backgroundColor: colors.hairline, marginHorizontal: 8 },
  text: { color: colors.text, fontWeight: '600' },
  muted: { color: colors.muted, marginLeft: 6 },
  clock: { color: colors.text, fontWeight: '700' },
});
