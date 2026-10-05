import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSettings } from '../settings';
import { colors } from '../theme';

/** Podešavanje adrese Pi-ja (za razvoj ili ako se promijeni mreža). */
export function HostDialog({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const { host, update } = useSettings();
  const [draft, setDraft] = useState(host);
  useEffect(() => setDraft(host), [host, visible]);

  const save = () => {
    const h = draft.trim();
    if (h) update({ host: h });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Adresa Pi-ja</Text>
          <Text style={styles.hint}>U autu: 10.42.0.1 · emulator: 10.0.2.2</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={save}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            placeholderTextColor={colors.dim}
            accessibilityLabel="Adresa Pi-ja"
          />
          <View style={styles.row}>
            <Pressable onPress={onClose} style={[styles.btn, styles.secondary]} accessibilityRole="button">
              <Text style={styles.btnText}>Otkaži</Text>
            </Pressable>
            <Pressable onPress={save} style={[styles.btn, styles.primary]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.bg }]}>Sačuvaj</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  card: { width: 440, backgroundColor: colors.surface, borderRadius: 18, padding: 24, gap: 12, borderWidth: 1, borderColor: colors.hairline },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 15 },
  input: { color: colors.text, fontSize: 22, borderWidth: 1, borderColor: colors.hairline, borderRadius: 12, paddingHorizontal: 14, height: 56, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceHi },
  btnText: { color: colors.text, fontSize: 18, fontWeight: '700' },
});
