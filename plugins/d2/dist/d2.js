// src/index.ts
var DEFAULT_BASE = "http://localhost:7770";
var DEFAULT_POLL_MS = 5e3;
var BUCKET_KINETIC = 1498876634;
var BUCKET_ENERGY = 2465295065;
var BUCKET_POWER = 953998645;
var BUCKET_HELMET = 3448274439;
var BUCKET_GAUNTLETS = 3551918588;
var BUCKET_CHEST = 14239492;
var BUCKET_LEGS = 20886954;
var BUCKET_CLASS_ARMOR = 1585787867;
var BUCKET_SUBCLASS = 3284755031;
var ARMOR_BUCKETS = [
  BUCKET_HELMET,
  BUCKET_GAUNTLETS,
  BUCKET_CHEST,
  BUCKET_LEGS,
  BUCKET_CLASS_ARMOR
];
var SUBCLASS_ELEMENT = {
  // Hunter
  Gunslinger: "Solar",
  Nightstalker: "Void",
  Arcstrider: "Arc",
  Revenant: "Stasis",
  Threadrunner: "Strand",
  // Warlock
  Dawnblade: "Solar",
  Voidwalker: "Void",
  Stormcaller: "Arc",
  Shadebinder: "Stasis",
  Broodweaver: "Strand",
  // Titan
  Sunbreaker: "Solar",
  Sentinel: "Void",
  Striker: "Arc",
  Behemoth: "Stasis",
  Berserker: "Strand",
  Prismatic: "Prismatic"
};
function findItem(equipped, bucket) {
  return equipped.find((e) => e.bucket_hash === bucket) ?? null;
}
function findExoticArmor(equipped) {
  return equipped.find(
    (e) => ARMOR_BUCKETS.includes(e.bucket_hash) && e.tier === "Exotic"
  ) ?? null;
}
function buildClassDisplay(state, equipped) {
  const subclass = findItem(equipped, BUCKET_SUBCLASS);
  const element = subclass ? SUBCLASS_ELEMENT[subclass.item_name] ?? "" : "";
  const className = state.character.class;
  return element ? `${element} ${className}` : className;
}
function buildSecondaryItems(state, loadoutData) {
  const charLoadout = loadoutData.find(
    (c) => c.character.id === state.character.id
  );
  if (!charLoadout) return [];
  const items = [
    { label: "Current Class", value: buildClassDisplay(state, charLoadout.equipped) }
  ];
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
function buildActivityText(state) {
  if (state.activity.in_orbit) return null;
  const mode = state.activity.mode?.name ?? "";
  const name = state.activity.name ?? "";
  if (!mode && !name) return null;
  if (mode && name) return `${mode} - ${name}`;
  return mode || name;
}
function setup({ register: reg }) {
  let stop = null;
  reg("data", {
    onCreate(ctx) {
      const base = ctx.config.d2Base || DEFAULT_BASE;
      const pollMs = ctx.config.d2PollMs || DEFAULT_POLL_MS;
      let lastActivity = "\0";
      let lastSecondaryKey = "\0";
      async function poll() {
        let stateRes;
        let loadoutRes;
        try {
          [stateRes, loadoutRes] = await Promise.all([
            fetch(`${base}/api/state`, { cache: "no-store" }),
            fetch(`${base}/api/loadout`, { cache: "no-store" })
          ]);
        } catch {
          if (lastActivity !== "" || lastSecondaryKey !== "[]") {
            lastActivity = "";
            lastSecondaryKey = "[]";
            ctx.emit?.("command", { name: "d2_activity", data: null });
            ctx.emit?.("command", { name: "d2_loadout", data: [] });
          }
          return;
        }
        if (!stateRes.ok || !loadoutRes.ok) return;
        const stateBody = await stateRes.json();
        const loadoutBody = await loadoutRes.json();
        const state = stateBody.data;
        const loadoutData = loadoutBody.data;
        const activity = buildActivityText(state);
        const activityKey = activity ?? "";
        if (activityKey !== lastActivity) {
          lastActivity = activityKey;
          ctx.emit?.("command", { name: "d2_activity", data: activity });
        }
        const items = buildSecondaryItems(state, loadoutData);
        const itemsKey = JSON.stringify(items);
        if (itemsKey !== lastSecondaryKey) {
          lastSecondaryKey = itemsKey;
          ctx.emit?.("command", { name: "d2_loadout", data: items });
        }
      }
      poll();
      const intervalId = setInterval(poll, pollMs);
      stop = () => clearInterval(intervalId);
    },
    onDestroy() {
      stop?.();
      stop = null;
    }
  }, { environment: "overlay" });
}
var index_default = (definePlugin) => definePlugin("d2", setup);
export {
  index_default as default
};
