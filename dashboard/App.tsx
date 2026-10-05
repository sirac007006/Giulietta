import React, { useState } from 'react';
import { StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import { HostDialog } from './src/components/HostDialog';
import { NavRail, type Tab } from './src/components/NavRail';
import { StatusBar } from './src/components/StatusBar';
import { WarningBanner } from './src/components/WarningBanner';
import { ClusterScreen } from './src/screens/ClusterScreen';
import { DiagnosticsScreen } from './src/screens/DiagnosticsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SettingsProvider } from './src/settings';
import { useAlertSounds } from './src/sound';
import { TelemetryProvider } from './src/telemetry';
import { colors, useScale } from './src/theme';

function Shell() {
  const { width, height, px } = useScale();
  const [tab, setTab] = useState<Tab>('cluster');
  const [hostOpen, setHostOpen] = useState(false);
  useAlertSounds();

  const statusH = px(44);
  const railW = px(96);
  const mainW = width - railW;
  const mainH = height - statusH;

  return (
    <View style={styles.root}>
      <RNStatusBar hidden />
      <StatusBar height={statusH} onLongPress={() => setHostOpen(true)} />
      <View style={styles.body}>
        <NavRail width={railW} tab={tab} onTab={setTab} />
        <View style={{ width: mainW, height: mainH }}>
          {tab === 'cluster' && <ClusterScreen width={mainW} height={mainH} />}
          {tab === 'diag' && <DiagnosticsScreen width={mainW} height={mainH} />}
          {tab === 'settings' && <SettingsScreen width={mainW} height={mainH} onEditHost={() => setHostOpen(true)} />}
          <WarningBanner height={px(56)} />
        </View>
      </View>
      <HostDialog visible={hostOpen} onClose={() => setHostOpen(false)} />
    </View>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <TelemetryProvider>
        <Shell />
      </TelemetryProvider>
    </SettingsProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, flexDirection: 'row' },
});
