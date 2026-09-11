import { Capacitor, registerPlugin } from "@capacitor/core";

type HealthConnectPlugin = {
  isAvailable(): Promise<{ available: boolean; status?: number }>;
  requestStepsPermission(): Promise<{ granted: boolean }>;
  readSteps(options: { start: string; end: string }): Promise<{ steps: number }>;
};

const HealthConnect = registerPlugin<HealthConnectPlugin>("HealthConnect");

export const isNativeAndroid = () => Capacitor.getPlatform() === "android";

export async function readTodaySteps(): Promise<number> {
  if (!isNativeAndroid()) throw new Error("Funcția este disponibilă numai în aplicația Android.");

  const avail = await HealthConnect.isAvailable();
  if (!avail.available) {
    throw new Error(`Health Connect nu este disponibil (status ${avail.status ?? "necunoscut"}).`);
  }

  const perm = await HealthConnect.requestStepsPermission();
  if (!perm.granted) throw new Error("Permisiunea pentru pași nu a fost acordată.");

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const res = await HealthConnect.readSteps({
    start: start.toISOString(),
    end: end.toISOString()
  });
  return Math.max(0, Math.round(res.steps));
}
