// The lamp wall (owner request 2026-11-12; supabase/migrations/20261112400000_lamp_wall.sql): a lamp lit with Light for
// someone who passed away, on one wall every player sees. The Light is spent on this device as a purchase (`lw:{id}`),
// so it syncs like every purchase and counts towards the lamp of Light by the player's name.
import { supabase } from '../cloud/supabase';
import { localMsg } from '../i18n';
import { shopAdd, wallet } from '../data/garden';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = await supabase();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(localMsg(error.message));
  return data as T;
}

export const LAMP_SIZES = [50, 100, 250] as const;
export interface Lamp { id: string; for: string; he: boolean; dua: number; light: number; at: string; me: boolean; by: string | null; ameen: number; said: boolean }
export interface Wall { total: number; week: number; mine: number; lamps: Lamp[] }

const KEY = 'lampWall';
/** The wall as last seen on this device (shown at once, then refreshed). */
export function keptWall(): Wall | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && Array.isArray(v.lamps) ? v as Wall : null; } catch { return null; }
}
export async function lampWall(): Promise<Wall> {
  const w = await rpc<Wall>('rank_lamp_wall', { lim: 80 });
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* ignore */ }
  return w;
}
/** Lights a lamp; throws 'need' without enough Light. */
export async function lightLamp(name: string, he: boolean, dua: number, light: number, showName: boolean): Promise<string> {
  if (wallet() < light) throw new Error('need');
  const id = await rpc<string>('rank_lamp_light', { for_name: name, he, dua, amount: light, show_name: showName });
  shopAdd(`lw:${id}`, light);
  return id;
}
export const sayAmeen = (id: string) => rpc<number>('rank_lamp_ameen', { lamp: id });
export const reportLamp = (id: string) => rpc<void>('rank_lamp_report', { lamp: id });
export const removeLamp = (id: string) => rpc<void>('rank_lamp_remove', { lamp: id });
