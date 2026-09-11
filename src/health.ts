import { Capacitor, registerPlugin } from "@capacitor/core";

type HealthConnectPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  requestStepsPermission(): Promise<{ granted: boolean }>;
  readSteps(options: { start: string; end: string }): Promise<{ steps: number }>;
};

const HealthConnect = registerPlugin<HealthConnectPlugin>("HealthConnect");

export const isNativeAndroid = () => Capacitor.getPlatform() === "android";

export async function readTodaySteps(): Promise<number | null> {
  if (!isNativeAndroid()) return null;

  const avail = await HealthConnect.isAvailable().catch(() => ({ available: false }));
  if (!avail.available) return null;

  const perm = await HealthConnect.requestStepsPermission().catch(() => ({ granted: false }));
  if (!perm.granted) return null;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const res = await HealthConnect.readSteps({
    start: start.toISOString(),
    end: end.toISOString()
  }).catch(() => null);

  return res ? Math.max(0, Math.round(res.steps)) : null;
}
