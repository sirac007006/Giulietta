import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Kratki zvučni signali preko Android ToneGenerator-a (miješaju se preko muzike). */
export interface Spec extends TurboModule {
  /** kind: "critical" | "warning" | "info" | "shift" | "connect" */
  play(kind: string): void;
}

export default TurboModuleRegistry.get<Spec>('NativeAlertSound');
