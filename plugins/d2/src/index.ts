/**
 * mediafuse-d2 data plugin
 *
 * Polls a local Destiny 2 companion API at http://localhost:7770 for
 * current activity and equipped loadout. Emits commands the overlay
 * sketch can consume to render an "activity area" and a rotating
 * "secondary information" panel.
 *
 * When the API is unreachable (server not running), no events fire so
 * the overlay shows nothing for D2.
 */

import type { DefinePluginFn, PluginContext, CreateContext } from "mediafuse";

const DEFAULT_BASE = "http://localhost:7770";
const DEFAULT_POLL_MS = 5000;
const ORBIT_GRACE_MS = 30000;

const BUCKET_KINETIC = 1498876634;
const BUCKET_ENERGY = 2465295065;
const BUCKET_POWER = 953998645;
const BUCKET_HELMET = 3448274439;
const BUCKET_GAUNTLETS = 3551918588;
const BUCKET_CHEST = 14239492;
const BUCKET_LEGS = 20886954;
const BUCKET_CLASS_ARMOR = 1585787867;
const BUCKET_SUBCLASS = 3284755031;

const ARMOR_BUCKETS = [
  BUCKET_HELMET,
  BUCKET_GAUNTLETS,
  BUCKET_CHEST,
  BUCKET_LEGS,
  BUCKET_CLASS_ARMOR,
];

interface LoadoutItem {
  bucket_hash: number;
  item_name: string;
  tier?: string;
}

interface LoadoutCharacter {
  character: { id: string; class: string };
  equipped: LoadoutItem[];
}

interface StateData {
  activity: {
    in_orbit: boolean;
    mode: { name: string };
    name: string;
  };
  character: { id: string; class: string; subclass?: string };
}

function findItem(equipped: LoadoutItem[], bucket: number): LoadoutItem | null {
  return equipped.find((e) => e.bucket_hash === bucket) ?? null;
}

function findExoticArmor(equipped: LoadoutItem[]): LoadoutItem | null {
  return (
    equipped.find(
      (e) => ARMOR_BUCKETS.includes(e.bucket_hash) && e.tier === "Exotic",
    ) ?? null
  );
}

function buildSecondaryItems(
  state: StateData,
  loadoutData: LoadoutCharacter[],
): { label: string; value: string }[] {
  const charLoadout = loadoutData.find(
    (c) => c.character.id === state.character.id,
  );
  if (!charLoadout) return [];

  const subclass =
    state.character.subclass ||
    findItem(charLoadout.equipped, BUCKET_SUBCLASS)?.item_name ||
    "";

  const items: { label: string; value: string }[] = [];
  if (subclass) items.push({ label: "", value: `Playing as ${subclass}` });

  const exotic = findExoticArmor(charLoadout.equipped);
  if (exotic) items.push({ label: "Exotic Armor", value: exotic.item_name });

  const kinetic = findItem(charLoadout.equipped, BUCKET_KINETIC);
  if (kinetic) items.push({ label: "Kinetic Slot Weapon", value: kinetic.item_name });

  const energy = findItem(charLoadout.equipped, BUCKET_ENERGY);
  if (energy) items.push({ label: "Energy Weapon", value: energy.item_name });

  const power = findItem(charLoadout.equipped, BUCKET_POWER);
  if (power) items.push({ label: "Power Weapon", value: power.item_name });

  return items;
}

function buildActivityText(state: StateData): string | null {
  if (state.activity.in_orbit) return null;
  const mode = state.activity.mode?.name ?? "";
  const name = state.activity.name ?? "";
  if (!mode && !name) return null;
  if (mode && name) return `${mode} - ${name}`;
  return mode || name;
}

function setup({ register: reg }: PluginContext): void {
  let stop: (() => void) | null = null;

  reg("data", {
    onCreate(ctx: CreateContext) {
      const base = (ctx.config.d2Base as string) || DEFAULT_BASE;
      const pollMs = (ctx.config.d2PollMs as number) || DEFAULT_POLL_MS;
      let orbitSince = 0;

      let lastActivity = "";
      let lastSecondaryKey = "";
      let polling = false;
      let stopped = false;

      function emitOffline(): void {
        if (lastActivity !== "" || lastSecondaryKey !== "[]") {
          lastActivity = "";
          lastSecondaryKey = "[]";
          ctx.emit?.("command", { name: "activity", data: null });
          ctx.emit?.("command", { name: "secondary_info", data: [] });
        }
      }

      async function pollOnce(): Promise<void> {
        let stateRes: Response;
        let loadoutRes: Response;
        try {
          [stateRes, loadoutRes] = await Promise.all([
            fetch(`${base}/api/state`, { cache: "no-store" }),
            fetch(`${base}/api/loadout`, { cache: "no-store" }),
          ]);
        } catch {
          emitOffline();
          return;
        }

        if (!stateRes.ok || !loadoutRes.ok) return;

        let stateBody: { data: StateData };
        let loadoutBody: { data: LoadoutCharacter[] };
        try {
          stateBody = (await stateRes.json()) as { data: StateData };
          loadoutBody = (await loadoutRes.json()) as { data: LoadoutCharacter[] };
        } catch (err) {
          console.error("[d2] failed to parse API response:", err);
          return;
        }

        const state = stateBody.data;
        const loadoutData = loadoutBody.data;

        let activity = buildActivityText(state);
        if (state.activity.in_orbit) {
          if (orbitSince === 0) orbitSince = Date.now();
          if (Date.now() - orbitSince < ORBIT_GRACE_MS && lastActivity) {
            activity = lastActivity;
          }
        } else {
          orbitSince = 0;
        }
        const activityKey = activity ?? "";
        if (activityKey !== lastActivity) {
          lastActivity = activityKey;
          ctx.emit?.("command", { name: "activity", data: activity });
        }

        const items = buildSecondaryItems(state, loadoutData);
        const itemsKey = JSON.stringify(items);
        if (itemsKey !== lastSecondaryKey) {
          lastSecondaryKey = itemsKey;
          ctx.emit?.("command", { name: "secondary_info", data: items });
        }
      }

      async function poll(): Promise<void> {
        if (polling || stopped) return;
        polling = true;
        try {
          await pollOnce();
        } catch (err) {
          console.error("[d2] poll error:", err);
        } finally {
          polling = false;
        }
      }

      poll();
      const intervalId = setInterval(poll, pollMs);
      stop = () => {
        stopped = true;
        clearInterval(intervalId);
      };
    },
    onDestroy() {
      stop?.();
      stop = null;
    },
  }, { environment: "overlay" });
}

export default (definePlugin: DefinePluginFn) => definePlugin("d2", setup);
