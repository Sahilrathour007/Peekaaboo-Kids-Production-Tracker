const STORAGE_KEY = "peekaaboo-production-tracker-v2";
const SUPABASE_STATE_TABLE = "production_tracker_state";
const SUPABASE_STATE_ID = "main";
// Populated by supabase-config.js (gitignored; never commit real keys).
// See supabase-config.example.js.
const SUPABASE_CONFIG = window.PEEKAABOO_SUPABASE || {};
if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
  console.error(
    "Missing supabase-config.js - copy supabase-config.example.js to supabase-config.js and fill in your Supabase URL + anon/publishable key."
  );
}
const supabaseClient = window.supabase && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey
  ? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  : null;
let remoteLoadComplete = false;
let suppressRemoteSave = false;
let pendingRemoteSave = null;
const SIZES = [
  ["size_1_2", "1-2 Yr"],
  ["size_2_3", "2-3 Yr"],
  ["size_3_4", "3-4 Yr"],
  ["size_4_5", "4-5 Yr"],
  ["size_5_6", "5-6 Yr"],
  ["size_6_8", "6-8 Yr"],
  ["size_8_10", "8-10 Yr"]
];
const GENDERS = [
  ["boys", "Boys"],
  ["girls", "Girls"]
];
const BACKEND_DATA = window.PEEKAABOO_BACKEND || {
  skuDatabase: [],
  fabricDatabase: [],
  lists: { fabricNames: [], printTypes: [], colours: [] }
};
const ACCESSORY_RULES = window.PEEKAABOO_ACCESSORY_RULES || {
  kurta: { label: "Kurta", elastic: 0, button: 5, tag: 1 },
  pant: { label: "Pant", elastic: 1, button: 0, tag: 1 },
  shirt: { label: "Shirt / top", elastic: 0, button: 5, tag: 1 },
  dress: { label: "Dress", elastic: 0, button: 3, tag: 1 },
  custom: { label: "Custom", elastic: 0, button: 0, tag: 1 }
};
// Options shown in every "Garments produced" row select. Kept separate from
// ACCESSORY_RULES so the dropdown order/labels are stable even if a site
// customizes accessory-rules.js with extra or reordered keys.
const GARMENT_TYPE_OPTIONS = [
  ["kurta", "Kurta"],
  ["pant", "Pant"],
  ["shirt", "Shirt / top"],
  ["dress", "Dress"],
  ["custom", "Custom"]
];

// Accessory stock types recognized for auto requirement matching. "other" is
// a free-text bucket (zippers, lace, dori...) that has no per-piece rule in
// ACCESSORY_RULES, so its "required" is always shown as unknown, not zero.
const ACCESSORY_TYPES = [
  ["elastic", "Elastic"],
  ["button", "Button"],
  ["tag", "Tag"],
  ["other", "Other"]
];
const STAGES = [
  "Cutting complete",
  "In-house stitching",
  "Outsource stitching",
  "Kaaj/Button",
  "Handwork",
  "Dhaga Cutting",
  "Finished Goods"
];

// Buckets every STAGES value into the three broad states the Overview tab
// filters by. "Cutting complete" (freshly cut, nothing started yet) counts
// as still being in the cutting schedule; "Finished Goods" is done; every
// stage in between — stitching, Kaaj/Button, Handwork, Dhaga Cutting — is
// WIP, and the Overview table shows the exact one alongside this bucket.
function getOverviewCategory(cutting) {
  if (cutting.stage === "Cutting complete") return "cutting-schedule";
  if (cutting.stage === "Finished Goods") return "finished-goods";
  return "wip";
}

const OVERVIEW_STATUS_LABELS = {
  "cutting-schedule": "Cutting complete",
  wip: "WIP",
  "finished-goods": "Finished goods"
};

// Maps each stage to the nav tab / panel it now lives on, since every stage
// got its own primary navigation button instead of sharing one combined board.
const STAGE_TAB_SLUGS = {
  "Cutting complete": "cutting-complete",
  "In-house stitching": "inhouse-stitching",
  "Outsource stitching": "outsource-stitching",
  "Kaaj/Button": "kaaj-button",
  "Handwork": "handwork",
  "Dhaga Cutting": "dhaga-cutting",
  "Finished Goods": "finished-goods"
};

const defaultState = {
  fabrics: [
    {
      id: crypto.randomUUID(),
      code: "FO-FL-PI-001",
      name: "Foil Holland",
      printType: "Floral",
      colour: "Pink",
      qty: 150,
      rolls: 4,
      totalLength: 600,
      consumed: 0
    }
  ],
  cuttings: [],
  outsourcing: [],
  accessoryStock: []
};

let state = loadState();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

// --- Required-field highlighting -------------------------------------
// Generic helpers used by every form's submit handler so a person can never
// save an entry with a required number left blank/zero: the offending
// field (and its row, if it's inside a dynamic fabric/garment row) gets a
// red highlight, and the highlight clears itself as soon as the person
// edits that field. This is on top of native `required` attributes, which
// only catch empty fields — these helpers also catch "filled with 0",
// which native HTML validation lets through.
function markFieldInvalid(el) {
  if (!el) return;
  el.classList.add("field-invalid");
  const row = el.closest(".fabric-component-row, .garment-component-row");
  if (row) row.classList.add("row-invalid");
}

function clearFieldInvalid(el) {
  if (!el) return;
  el.classList.remove("field-invalid");
  const row = el.closest(".fabric-component-row, .garment-component-row");
  if (row && !row.querySelector(".field-invalid")) row.classList.remove("row-invalid");
}

function clearAllInvalid(scope = document) {
  scope.querySelectorAll(".field-invalid").forEach((el) => el.classList.remove("field-invalid"));
  scope.querySelectorAll(".row-invalid").forEach((el) => el.classList.remove("row-invalid"));
}

// Delegated so it works for inputs created after page load (fabric rows,
// garment rows, the move-qty size grid, etc.) without wiring each one up
// individually.
document.addEventListener("input", (event) => {
  if (event.target.classList?.contains("field-invalid")) clearFieldInvalid(event.target);
});
document.addEventListener("change", (event) => {
  if (event.target.classList?.contains("field-invalid")) clearFieldInvalid(event.target);
});

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : structuredClone(defaultState);
    return normalizeState(parsed);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(value) {
  const normalized = {
    ...structuredClone(defaultState),
    ...value,
    fabrics: value?.fabrics || [],
    cuttings: value?.cuttings || [],
    outsourcing: value?.outsourcing || [],
    accessoryStock: value?.accessoryStock || []
  };
  normalized.cuttings = normalized.cuttings.map((cutting) => ({
    ...cutting,
    sizesRemaining: cutting.sizesRemaining || { ...cutting.sizes },
    stageHistory: cutting.stageHistory || [],
    // cutGroupId links sibling batches that came from one multi-garment cut
    // event (e.g. Kurta + Pant cut together as a set). Older entries and
    // single-garment cuts never had one, so they simply show no set badge.
    cutGroupId: cutting.cutGroupId || null,
    garmentLabel: cutting.garmentLabel || "",
    // rootCode anchors a batch's split lineage (e.g. CUT-0006-A / CUT-0006-B
    // both trace back to rootCode "CUT-0006"). Batches never split keep
    // batchCode === rootCode, so no suffix ever shows for the common case.
    rootCode: cutting.rootCode || cutting.batchCode,
    // Older entries were saved with a single fabricCode/avgFabricUsed pair
    // (before multi-fabric cutting support). Wrap them in the same
    // fabricComponents shape new entries use so every downstream function
    // (rendering, delete guard, stats) only has to handle one format.
    fabricComponents: cutting.fabricComponents || (cutting.fabricCode
      ? [{
          fabricCode: cutting.fabricCode,
          avgFabricUsed: toNumber(cutting.avgFabricUsed),
          used: toNumber(cutting.fabricUsed),
          correction: toNumber(cutting.correction)
        }]
      : [])
  }));
  // receipts tracks incoming material logged back against this outsourcing
  // entry (see "Incoming material" tab) — partial or full, one entry per
  // log. pendingDeliveryDate is the vendor's revised promise for whatever's
  // still outstanding; it starts out equal to the original deliveryDate and
  // gets nudged forward each time a partial receipt is logged.
  normalized.outsourcing = normalized.outsourcing.map((entry) => ({
    ...entry,
    receipts: entry.receipts || [],
    pendingDeliveryDate: entry.pendingDeliveryDate || entry.deliveryDate
  }));
  return normalized;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueRemoteSave();
}

function setSyncStatus(message, type = "neutral") {
  const el = $("#syncStatus");
  if (!el) return;
  el.textContent = message;
  el.dataset.sync = type;
}

function queueRemoteSave() {
  if (!supabaseClient || !remoteLoadComplete || suppressRemoteSave) return;
  clearTimeout(pendingRemoteSave);
  pendingRemoteSave = setTimeout(() => {
    persistRemoteState();
  }, 350);
}

async function persistRemoteState() {
  if (!supabaseClient) return;
  setSyncStatus("Syncing...", "pending");
  const { error: stateError } = await supabaseClient
    .from(SUPABASE_STATE_TABLE)
    .upsert({
      id: SUPABASE_STATE_ID,
      data: state,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });
  const fabricsOk = await persistRemoteFabrics();
  const relationalOk = fabricsOk ? await persistRemoteRelationalData() : false;

  if (stateError && !relationalOk) {
    console.error("Supabase save failed", stateError);
    setSyncStatus("Supabase save failed", "error");
    return;
  }
  if (stateError) console.warn("Supabase state snapshot save failed", stateError);
  setSyncStatus(relationalOk ? "Synced" : "Supabase partial sync", relationalOk ? "ok" : "error");
}

function mapFabricToSupabaseRow(fabric) {
  return {
    code: fabric.code,
    fabric_name: fabric.name,
    print_type: fabric.printType,
    colour: fabric.colour,
    qty_per_roll: toNumber(fabric.qty),
    rolls: toNumber(fabric.rolls),
    consumed: toNumber(fabric.consumed)
  };
}

function mapSupabaseRowToFabric(row) {
  return {
    id: row.code,
    code: row.code,
    name: row.fabric_name,
    printType: row.print_type,
    colour: row.colour,
    qty: toNumber(row.qty_per_roll),
    rolls: toNumber(row.rolls),
    totalLength: toNumber(row.qty_per_roll) * toNumber(row.rolls),
    consumed: toNumber(row.consumed)
  };
}

async function persistRemoteFabrics() {
  if (!supabaseClient) return false;
  const rows = state.fabrics.map(mapFabricToSupabaseRow);
  if (rows.length) {
    const { error } = await supabaseClient
      .from("fabrics")
      .upsert(rows, { onConflict: "code" });
    if (error) {
      console.error("Supabase fabrics save failed", error);
      return false;
    }
  }

  return true;
}

async function cleanupRemoteFabrics() {
  const codes = state.fabrics.map((fabric) => fabric.code);
  const { data: existing, error: readError } = await supabaseClient
    .from("fabrics")
    .select("code");
  if (readError) {
    console.warn("Supabase fabrics cleanup skipped", readError);
    return true;
  }

  const staleCodes = (existing || [])
    .map((row) => row.code)
    .filter((code) => !codes.includes(code));
  if (staleCodes.length) {
    const { error: deleteError } = await supabaseClient
      .from("fabrics")
      .delete()
      .in("code", staleCodes);
    if (deleteError) console.warn("Supabase fabrics cleanup failed", deleteError);
  }
  return true;
}

async function clearRemoteTable(table, idColumn = "id") {
  const { error } = await supabaseClient
    .from(table)
    .delete()
    .not(idColumn, "is", null);
  if (error) {
    console.error(`Supabase ${table} cleanup failed`, error);
    return false;
  }
  return true;
}

async function insertRemoteRows(table, rows) {
  if (!rows.length) return true;
  const { error } = await supabaseClient
    .from(table)
    .insert(rows);
  if (error) {
    console.error(`Supabase ${table} insert failed`, error);
    return false;
  }
  return true;
}

function cuttingStageSequence(cutting) {
  const history = (cutting.stageHistory || []).filter(Boolean);
  const currentStage = cutting.stage || "Cutting complete";
  const sequence = [...history, currentStage];
  return sequence.length ? sequence : ["Cutting complete"];
}

function mapCuttingToSupabaseRow(cutting) {
  return {
    id: cutting.id,
    batch_code: cutting.batchCode,
    root_code: cutting.rootCode || cutting.batchCode,
    cut_group_id: cutting.cutGroupId || null,
    parent_cutting_id: null,
    sku: cutting.sku,
    common_name: cutting.commonName,
    garment_type: cutting.garmentType || "custom",
    garment_label: cutting.garmentLabel || null,
    gender: cutting.gender || null,
    entry_date: cutting.entryDate || todayDate(),
    current_stage: cutting.stage || "Cutting complete",
    finished_goods_date: cutting.finishedGoodsDate || null,
    created_at: cutting.createdAt || new Date().toISOString()
  };
}

function mapCuttingFabricComponents(cutting) {
  return (cutting.fabricComponents || [])
    .map((component) => ({
      cutting_id: cutting.id,
      fabric_code: component.fabricCode,
      avg_fabric_used: toNumber(component.avgFabricUsed),
      qty_used: toNumber(component.used),
      correction: toNumber(component.correction)
    }))
    // DB requires avg_fabric_used > 0 (CHECK cutting_fabric_components_avg_used_positive).
    // A row with 0/blank avg usage is incomplete data, not valid data — drop it here
    // AND flag it via validateStateBeforeSave() so the user sees why it's missing.
    .filter((row) => row.cutting_id && row.fabric_code && row.avg_fabric_used > 0);
}

function mapCuttingStageMovements(cutting) {
  const rows = [];
  const sequence = cuttingStageSequence(cutting);
  const movedAt = cutting.createdAt || new Date().toISOString();
  SIZES.forEach(([sizeCode]) => {
    const qty = toNumber(cutting.sizes?.[sizeCode]);
    if (qty <= 0) return;
    rows.push({
      cutting_id: cutting.id,
      size_code: sizeCode,
      stage: sequence[0],
      direction: "in",
      qty,
      movement_type: "cut_in",
      moved_at: movedAt
    });
    for (let index = 1; index < sequence.length; index++) {
      rows.push({
        cutting_id: cutting.id,
        size_code: sizeCode,
        stage: sequence[index - 1],
        direction: "out",
        qty,
        movement_type: "advance",
        moved_at: movedAt
      });
      rows.push({
        cutting_id: cutting.id,
        size_code: sizeCode,
        stage: sequence[index],
        direction: "in",
        qty,
        movement_type: "advance",
        moved_at: movedAt
      });
    }
  });
  return rows;
}

function mapOutsourcingToSupabaseRow(entry) {
  return {
    id: entry.id,
    cutting_id: entry.sourceCuttingId || null,
    work_type: entry.workType,
    vendor_name: entry.vendorName,
    sku: entry.sku,
    common_name: entry.commonName,
    rate: toNumber(entry.rate),
    delivery_date: entry.deliveryDate || todayDate(),
    pending_delivery_date: entry.pendingDeliveryDate || null,
    created_at: entry.createdAt || new Date().toISOString()
  };
}

function mapOutsourcingSizes(entry) {
  return SIZES.map(([sizeCode]) => ({
    outsourcing_id: entry.id,
    size_code: sizeCode,
    qty: toNumber(entry.sizes?.[sizeCode])
  }));
}

function mapOutsourcingAccessories(entry) {
  return {
    outsourcing_id: entry.id,
    elastic: toNumber(entry.accessories?.elastic),
    button: toNumber(entry.accessories?.button),
    tag: toNumber(entry.accessories?.tag),
    other_accessory: entry.accessories?.otherAccessory || null
  };
}

function mapOutsourcingReceipts(entry) {
  return (entry.receipts || [])
    .map((receipt) => ({
      id: receipt.id,
      outsourcing_id: entry.id,
      qty: toNumber(receipt.qty),
      received_date: receipt.date || todayDate(),
      amount_paid: toNumber(receipt.amountPaid)
    }))
    .filter((row) => row.id && row.qty > 0);
}

function mapAccessoryStockToSupabaseRow(entry) {
  return {
    id: entry.id,
    accessory_type: entry.accessoryType,
    label: entry.label || null,
    sku: entry.sku || null,
    common_name: entry.commonName || null,
    qty: toNumber(entry.qty),
    entry_date: entry.date || todayDate()
  };
}

// accessory_stock has CHECK (qty > 0) too — same silent-zero failure mode
// as cutting_fabric_components. Filter it out here as a safety net; the
// real catch should happen in validateStateBeforeSave() before this runs.
function isValidAccessoryStockRow(row) {
  return row.id && row.accessory_type && row.qty > 0;
}

// Client-side pre-flight check. Run this BEFORE persistRemoteState/RPC.
// Returns a list of human-readable problems instead of silently dropping
// rows and letting Postgres discover it after your data is mid-wipe.
function validateStateBeforeSave() {
  const issues = [];

  state.cuttings.forEach((cutting) => {
    (cutting.fabricComponents || []).forEach((component) => {
      const avgUsed = toNumber(component.avgFabricUsed);
      if (component.fabricCode && avgUsed <= 0) {
        issues.push(
          `Cutting "${cutting.sku || cutting.id}": fabric component "${component.fabricCode}" ` +
          `has no average fabric used entered (must be > 0). This row will NOT be saved until fixed.`
        );
      }
    });
  });

  state.accessoryStock.forEach((entry) => {
    if (toNumber(entry.qty) <= 0) {
      issues.push(
        `Accessory stock entry "${entry.label || entry.sku || entry.id}": qty must be > 0. ` +
        `This row will NOT be saved until fixed.`
      );
    }
  });

  return issues;
}

async function persistRemoteRelationalData() {
  // Report-only: log/flag known-incomplete rows, but NEVER let a stale
  // historical entry block today's save. Bad rows are excluded by the
  // mapCuttingFabricComponents()/isValidAccessoryStockRow() filters below;
  // this just makes the exclusion visible instead of silent.
  const issues = validateStateBeforeSave();
  if (issues.length) {
    console.warn(`Supabase save proceeding, but ${issues.length} row(s) will be skipped:`, issues);
    setSyncStatus(`Synced (${issues.length} incomplete row(s) skipped — see console)`, "warning");
  }

  const payload = {
    cuttings: state.cuttings.map(mapCuttingToSupabaseRow),
    cutting_fabric_components: state.cuttings.flatMap(mapCuttingFabricComponents),
    cutting_stage_movements: state.cuttings.flatMap(mapCuttingStageMovements),
    outsourcing: state.outsourcing.map(mapOutsourcingToSupabaseRow),
    outsourcing_sizes: state.outsourcing.flatMap(mapOutsourcingSizes),
    outsourcing_accessories: state.outsourcing
      .map(mapOutsourcingAccessories)
      .filter((row) => row.outsourcing_id),
    outsourcing_receipts: state.outsourcing.flatMap(mapOutsourcingReceipts),
    accessory_stock: state.accessoryStock
      .map(mapAccessoryStockToSupabaseRow)
      .filter(isValidAccessoryStockRow)
  };

  // Single atomic RPC — see atomic_replace_migration.sql.
  // Postgres wraps this whole function body in one transaction:
  // if ANY insert fails, EVERYTHING rolls back, including the deletes.
  // You can no longer end up with tables wiped-but-not-refilled.
  const { error } = await supabaseClient.rpc("replace_relational_data", { payload });
  if (error) {
    console.error("Supabase replace_relational_data failed", error);
    setSyncStatus("Supabase save failed (rolled back, no data lost)", "error");
    return false;
  }

  return cleanupRemoteFabrics();
}

async function loadRemoteFabrics() {
  if (!supabaseClient) return false;
  const { data, error } = await supabaseClient
    .from("fabrics")
    .select("code,fabric_name,print_type,colour,qty_per_roll,rolls,consumed")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Supabase fabrics load failed", error);
    return false;
  }
  if (!data?.length) return false;
  state.fabrics = data.map(mapSupabaseRowToFabric);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return true;
}

async function loadRemoteState() {
  if (!supabaseClient) {
    remoteLoadComplete = true;
    setSyncStatus("Local mode", "neutral");
    return;
  }

  setSyncStatus("Loading Supabase...", "pending");
  const { data, error } = await supabaseClient
    .from(SUPABASE_STATE_TABLE)
    .select("data")
    .eq("id", SUPABASE_STATE_ID)
    .maybeSingle();

  remoteLoadComplete = true;

  if (error) {
    console.error("Supabase load failed", error);
    const fabricsLoaded = await loadRemoteFabrics();
    setSyncStatus(fabricsLoaded ? "Synced" : "Supabase unavailable", fabricsLoaded ? "ok" : "error");
    return;
  }

  if (data?.data) {
    suppressRemoteSave = true;
    state = normalizeState(data.data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    suppressRemoteSave = false;
    const fabricsOk = await persistRemoteFabrics();
    const relationalOk = fabricsOk ? await persistRemoteRelationalData() : false;
    setSyncStatus(relationalOk ? "Synced" : "Supabase partial sync", relationalOk ? "ok" : "error");
    return;
  }

  await persistRemoteState();
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "\u2014";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function formatMeters(value) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} m`;
}

function formatQty(value) {
  return Number(value || 0).toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initials(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 2).toUpperCase())
    .join("");
}

// --- Fuzzy search + autocomplete -------------------------------------
// Native <input list="..."> datalists only do prefix/substring matching
// and dump the whole list open on click. Names get misremembered and
// misspelled a lot here, so this replaces that with a type-to-search
// widget: nothing shows until the user types, and matches are ranked by
// closeness (exact > prefix > substring > typo-tolerant edit distance)
// so a near-miss spelling still finds the right item.

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = temp;
    }
  }
  return row[n];
}

// Higher is a closer match. Returns -Infinity when the target isn't
// close enough to be worth suggesting.
function fuzzyMatchScore(query, target) {
  const q = String(query || "").trim().toLowerCase();
  const t = String(target || "").trim().toLowerCase();
  if (!q || !t) return -Infinity;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - (t.length - q.length);
  const idx = t.indexOf(q);
  if (idx !== -1) return 800 - idx * 2 - (t.length - q.length) * 0.2;

  // Typo-tolerant fallback: check edit distance against the full target
  // and against each individual word, so "mehndi" still finds "Mehandi
  // wali" and "shrt" still finds "Shirt / top".
  const candidates = [t, ...t.split(/\s+/)].filter(Boolean);
  let bestSimilarity = -Infinity;
  candidates.forEach((candidate) => {
    const dist = levenshteinDistance(q, candidate);
    const maxLen = Math.max(q.length, candidate.length);
    const similarity = 1 - dist / maxLen;
    if (similarity > bestSimilarity) bestSimilarity = similarity;
  });
  const threshold = q.length <= 3 ? 0.5 : 0.45;
  if (bestSimilarity < threshold) return -Infinity;
  return 700 * bestSimilarity;
}

// Wraps `input` in a small dropdown that only appears once the user
// types, showing the closest-matching options from getOptions() (called
// fresh on every keystroke so newly-added SKUs/fabrics show up). Each
// option is { value, label, sublabel? }. Selecting one sets the input's
// value and fires real "input" + "change" events on it, so all of the
// existing form logic (applySkuToForm, preview updates, source linking)
// keeps working unchanged.
function attachAutocomplete(input, getOptions, config = {}) {
  const maxResults = config.maxResults || 8;
  input.setAttribute("autocomplete", "off");
  input.removeAttribute("list");

  const wrapper = document.createElement("div");
  wrapper.className = "autocomplete";
  input.replaceWith(wrapper);
  wrapper.appendChild(input);

  const menu = document.createElement("div");
  menu.className = "autocomplete-menu";
  menu.hidden = true;
  wrapper.appendChild(menu);

  let matches = [];
  let activeIndex = -1;
  let suppressNextOpen = false;

  function open(query) {
    const q = query.trim();
    if (!q) {
      close();
      return;
    }
    const scored = getOptions()
      .map((option) => ({
        option,
        score: Math.max(
          fuzzyMatchScore(q, option.label),
          option.sublabel ? fuzzyMatchScore(q, option.sublabel) - 100 : -Infinity
        )
      }))
      .filter((entry) => entry.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
    matches = scored.map((entry) => entry.option);
    activeIndex = -1;
    menu.innerHTML = matches.length
      ? matches.map((option, index) => `
        <div class="autocomplete-option" data-index="${index}">
          <span>${escapeHtml(option.label)}</span>
          ${option.sublabel ? `<small>${escapeHtml(option.sublabel)}</small>` : ""}
        </div>
      `).join("")
      : `<div class="autocomplete-empty">No close match &mdash; check the spelling</div>`;
    menu.hidden = false;
  }

  function close() {
    menu.hidden = true;
    menu.innerHTML = "";
    matches = [];
    activeIndex = -1;
  }

  function highlight() {
    Array.from(menu.children).forEach((child, index) => child.classList.toggle("active", index === activeIndex));
    if (activeIndex >= 0) menu.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  function commit(index) {
    const option = matches[index];
    if (!option) return;
    input.value = option.value;
    close();
    suppressNextOpen = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  input.addEventListener("input", () => {
    if (suppressNextOpen) {
      suppressNextOpen = false;
      return;
    }
    open(input.value);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim()) open(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (menu.hidden || !matches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, matches.length - 1);
      highlight();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlight();
    } else if (event.key === "Enter") {
      if (activeIndex >= 0) {
        event.preventDefault();
        commit(activeIndex);
      }
    } else if (event.key === "Escape") {
      close();
    }
  });
  // mousedown (not click) fires before the input blurs, so the value is
  // still there for commit() to read from `matches`.
  menu.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const optionEl = event.target.closest(".autocomplete-option");
    if (optionEl) commit(Number(optionEl.dataset.index));
  });
  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) close();
  });
}

function fabricNameOptions() {
  return BACKEND_DATA.lists.fabricNames.map((value) => ({ value, label: value }));
}

function printTypeOptions() {
  return BACKEND_DATA.lists.printTypes.map((value) => ({ value, label: value }));
}

function colourOptions() {
  return BACKEND_DATA.lists.colours.map((value) => ({ value, label: value }));
}

function commonNameOptions() {
  return allSkuRecords().map((record) => ({ value: record.commonName, label: record.commonName, sublabel: record.sku }));
}

// Powers the fabric form's style/nickname search. A style that uses two
// different fabrics (coord sets, contrast panels — anything with a
// fabric2 on the master record) gets TWO suggestions, one per slot, so
// receiving either roll is searchable by the same nickname. The value
// carries "<sku>::<slot>" so committing a specific slot fills the right
// one — see resolveFabricStyleSelection. Sublabel shows the actual
// fabric/print/colour combo so that when one nickname covers many variants
// (e.g. "Boys Set" has 29 colour combos), the dropdown itself is enough to
// tell them apart without a second screen or filter step.
function fabricStyleOptions() {
  const options = [];
  BACKEND_DATA.fabricDatabase.forEach((record) => {
    if (record.fabric) {
      options.push({
        value: `${record.sku}::1`,
        label: record.commonName,
        sublabel: [record.fabric, record.printType, record.colour].filter(Boolean).join(" / ")
      });
    }
    if (record.fabric2) {
      options.push({
        value: `${record.sku}::2`,
        label: `${record.commonName} \u2014 2nd fabric`,
        sublabel: [record.fabric2, record.printType2, record.colour2].filter(Boolean).join(" / ")
      });
    }
  });
  return options;
}

function skuOptions() {
  return allSkuRecords().map((record) => ({ value: record.sku, label: record.sku, sublabel: record.commonName }));
}

function bindAutocompletes() {
  attachAutocomplete($("#fabricForm").styleSearch, fabricStyleOptions, { maxResults: 12 });
  attachAutocomplete($("#fabricForm").name, fabricNameOptions);
  attachAutocomplete($("#fabricForm").printType, printTypeOptions);
  attachAutocomplete($("#fabricForm").colour, colourOptions);
  attachAutocomplete($("#cuttingForm").commonName, commonNameOptions);
  attachAutocomplete($("#cuttingForm").sku, skuOptions);
  attachAutocomplete($("#outsourcingForm").commonName, commonNameOptions);
  attachAutocomplete($("#outsourcingForm").sku, skuOptions);
  attachAutocomplete($("#accessoryStockForm").sku, skuOptions);
}

function makeFabricCode(fabric) {
  const parts = [initials(fabric.name), initials(fabric.printType), initials(fabric.colour)].filter(Boolean);
  const base = parts.length ? parts.join("-") : "FAB";
  const existing = state.fabrics.filter((item) => item.code.startsWith(base)).length + 1;
  return `${base}-${String(existing).padStart(3, "0")}`;
}

function makeBatchCode() {
  return `CUT-${String(state.cuttings.length + 1).padStart(4, "0")}`;
}

// Excel-column style: 1 -> A, 2 -> B ... 26 -> Z, 27 -> AA, etc. Used for
// split-batch suffixes so a batch can be split more than 26 times without
// collisions.
function letterForIndex(n) {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Peels `splitSizes` (a { size_key: qty } map) off of `cutting`'s
// still-available pieces (sizesRemaining) and turns it into a brand new,
// fully independent cutting record at the same stage. Both records keep
// rootCode pointing at the original batch code so the UI can show lineage
// ("Split from CUT-0006"), and both can then be moved to in-house /
// outsourced / later stages completely independently of each other.
//
// Only sizesRemaining is eligible to split off — pieces already committed
// to an outsourcing entry aren't part of this batch's "available" pool
// anymore, so they can't be peeled off a second time.
function splitBatch(cutting, splitSizes) {
  const remaining = cutting.sizesRemaining || cutting.sizes;
  const overage = SIZES.find(([name]) => toNumber(splitSizes[name]) > toNumber(remaining[name]));
  if (overage) {
    alert(`Only ${formatQty(remaining[overage[0]])} pieces of ${overage[1]} are available to split off.`);
    return null;
  }
  const splitPieces = getPieces(splitSizes);
  if (splitPieces <= 0) {
    alert("Enter at least one piece to split off.");
    return null;
  }
  const originalPieces = getPieces(cutting.sizes) || 1;
  const rootCode = cutting.rootCode || cutting.batchCode;
  const familySize = state.cuttings.filter((item) => (item.rootCode || item.batchCode) === rootCode).length;

  // First time this family gets split: the original record itself becomes
  // "-A" so both halves read as siblings instead of one looking like the
  // untouched original.
  if (cutting.batchCode === rootCode) {
    cutting.batchCode = `${rootCode}-${letterForIndex(1)}`;
  }
  cutting.rootCode = rootCode;

  SIZES.forEach(([name]) => {
    const take = toNumber(splitSizes[name]);
    cutting.sizes[name] = toNumber(cutting.sizes[name]) - take;
    cutting.sizesRemaining[name] = toNumber(cutting.sizesRemaining[name]) - take;
  });

  const child = {
    ...structuredClone(cutting),
    id: crypto.randomUUID(),
    batchCode: `${rootCode}-${letterForIndex(familySize + 1)}`,
    rootCode,
    sizes: { ...splitSizes },
    sizesRemaining: { ...splitSizes },
    fabricComponents: (cutting.fabricComponents || []).map((component) => ({
      ...component,
      // Cosmetic only: fabric was already consumed in full at cutting time
      // against the parent's original meterage, so this prorates the
      // *displayed* used/correction split between siblings without
      // double-counting against fabric.consumed anywhere.
      used: (toNumber(component.used) * splitPieces) / originalPieces,
      correction: (toNumber(component.correction) * splitPieces) / originalPieces
    })),
    fabricUsed: (toNumber(cutting.fabricUsed) * splitPieces) / originalPieces,
    correction: (toNumber(cutting.correction) * splitPieces) / originalPieces
  };
  state.cuttings.push(child);
  return child;
}

function getFabricRemainingAtCode(code) {
  const fabric = state.fabrics.find((item) => item.code === code);
  return fabric ? getAvailableFabric(fabric) : 0;
}

function getAvailableFabric(fabric) {
  return Math.max(0, toNumber(fabric.totalLength) - toNumber(fabric.consumed));
}

function getPieces(sizes) {
  return Object.values(sizes || {}).reduce((sum, value) => sum + toNumber(value), 0);
}

function formatSizeBreakdown(sizes) {
  return SIZES
    .filter(([name]) => toNumber(sizes?.[name]) > 0)
    .map(([name, label]) => `${label.replace(" Yr", "")}:${formatQty(sizes[name])}`)
    .join(", ");
}

function getRemainingPieces(cutting) {
  return getPieces(cutting.sizesRemaining || cutting.sizes);
}

function getAccessoryUse(cutting) {
  const rule = ACCESSORY_RULES[cutting.garmentType] || ACCESSORY_RULES.custom;
  const pieces = getPieces(cutting.sizes);
  return {
    elastic: pieces * toNumber(rule.elastic),
    button: pieces * toNumber(rule.button),
    tag: pieces * toNumber(rule.tag)
  };
}

function getOutsourcingTotal(entry) {
  return getPieces(entry.sizes) * toNumber(entry.rate);
}

// --- Incoming material (receipts logged back against an outsourcing entry) ---

function getOutsourcingReceivedQty(entry) {
  return (entry.receipts || []).reduce((sum, receipt) => sum + toNumber(receipt.qty), 0);
}

function getOutsourcingPendingQty(entry) {
  return Math.max(0, getPieces(entry.sizes) - getOutsourcingReceivedQty(entry));
}

function getOutsourcingAmountPaid(entry) {
  return (entry.receipts || []).reduce((sum, receipt) => sum + toNumber(receipt.amountPaid), 0);
}

function getOutsourcingAmountLeft(entry) {
  return getOutsourcingTotal(entry) - getOutsourcingAmountPaid(entry);
}

function isOutsourcingFullyReceived(entry) {
  return getOutsourcingPendingQty(entry) <= 0;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function findSkuByCommonName(commonName) {
  const needle = String(commonName || "").trim().toLowerCase();
  if (!needle) return null;
  return BACKEND_DATA.skuDatabase.find((item) => item.commonName.toLowerCase() === needle) ||
    BACKEND_DATA.skuDatabase.find((item) => item.commonName.toLowerCase().includes(needle));
}

function findSkuByCode(sku) {
  const needle = String(sku || "").trim().toLowerCase();
  if (!needle) return null;
  return BACKEND_DATA.skuDatabase.find((item) => item.sku.toLowerCase() === needle);
}

function findFabricBySku(sku) {
  const needle = String(sku || "").trim().toLowerCase();
  if (!needle) return null;
  return BACKEND_DATA.fabricDatabase.find((item) => item.sku.toLowerCase() === needle);
}

// Resolves the fabric form's style-search field to a specific fabric slot.
// Autocomplete commits write "<sku>::<slot>" (slot 1 or 2) so a two-fabric
// style's second fabric can be selected distinctly from its first. Typing
// a name and tabbing away instead (no "::" marker, e.g. a native browser
// change with no dropdown commit) falls back to matching by common name —
// same exact-then-substring pattern as findSkuByCommonName — and always
// resolves to slot 1 in that case, since free typing can't specify a slot.
function resolveFabricStyleSelection(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  const sepIndex = raw.lastIndexOf("::");
  if (sepIndex !== -1) {
    const sku = raw.slice(0, sepIndex);
    const slot = Number(raw.slice(sepIndex + 2)) === 2 ? 2 : 1;
    const record = BACKEND_DATA.fabricDatabase.find((item) => item.sku === sku);
    if (record) return { record, slot };
  }
  const needle = raw.toLowerCase();
  const record = BACKEND_DATA.fabricDatabase.find((item) => item.commonName.toLowerCase() === needle) ||
    BACKEND_DATA.fabricDatabase.find((item) => item.commonName.toLowerCase().includes(needle));
  return record ? { record, slot: 1 } : null;
}

// slot 1 = fabric/printType/colour, slot 2 = fabric2/printType2/colour2.
// Most SKUs only use slot 1; coord sets and multi-fabric garments have a
// slot 2 filled in the master fabricDatabase (from the Excel's Fabric 2 /
// Print Type 2 / Color 2 columns). Returns null if that slot is empty on
// the SKU record, or if no matching roll has been received into inventory
// yet (e.g. a new style whose fabric hasn't been logged in Fabric Inventory).
function matchFabricForSku(skuRecord, slot = 1) {
  const fabricRecord = findFabricBySku(skuRecord?.sku);
  if (!fabricRecord) return null;
  const nameKey = slot === 2 ? "fabric2" : "fabric";
  const printKey = slot === 2 ? "printType2" : "printType";
  const colourKey = slot === 2 ? "colour2" : "colour";
  const name = fabricRecord[nameKey];
  if (!name) return null;
  return state.fabrics.find((fabric) =>
    fabric.name.toLowerCase() === name.toLowerCase() &&
    fabric.printType.toLowerCase() === (fabricRecord[printKey] || "").toLowerCase() &&
    fabric.colour.toLowerCase() === (fabricRecord[colourKey] || "").toLowerCase()
  );
}

// Finds every master-database style/nickname that maps to a given
// fabric+printType+colour combo, checking both fabric slots (slot 2 covers
// coord sets/multi-fabric styles). Lets the cutting form's fabric search
// recognize a nickname like "Pathan" even though received rolls in
// state.fabrics only ever store the raw fabric/print/colour, not the name
// workers actually think in.
function fabricNicknamesFor(fabric) {
  const names = new Set();
  BACKEND_DATA.fabricDatabase.forEach((record) => {
    const slot1 = record.fabric &&
      record.fabric.toLowerCase() === (fabric.name || "").toLowerCase() &&
      (record.printType || "").toLowerCase() === (fabric.printType || "").toLowerCase() &&
      (record.colour || "").toLowerCase() === (fabric.colour || "").toLowerCase();
    const slot2 = record.fabric2 &&
      record.fabric2.toLowerCase() === (fabric.name || "").toLowerCase() &&
      (record.printType2 || "").toLowerCase() === (fabric.printType || "").toLowerCase() &&
      (record.colour2 || "").toLowerCase() === (fabric.colour || "").toLowerCase();
    if ((slot1 || slot2) && record.commonName) names.add(record.commonName);
  });
  return Array.from(names);
}

// Options for the per-row fabric search on the cutting form: searches
// actual received inventory (not the master style database), since cutting
// has to consume a specific roll, not just a fabric/print/colour concept.
// Nicknames/style names that resolve to this roll are folded into the
// sublabel (both for display and so the existing sublabel fuzzy-match picks
// them up), so typing a common name works the same way it does on the
// Fabric inventory tab, alongside matching by exact fabric name or code.
function fabricInventoryOptions() {
  return state.fabrics.map((fabric) => {
    const nicknames = fabricNicknamesFor(fabric);
    const nicknameText = nicknames.length
      ? `${nicknames.slice(0, 3).join(", ")}${nicknames.length > 3 ? ` +${nicknames.length - 3} more` : ""} \u00b7 `
      : "";
    return {
      value: fabric.code,
      label: [fabric.name, fabric.printType, fabric.colour].filter(Boolean).join(" / "),
      sublabel: `${nicknameText}${fabric.code} \u2014 ${formatMeters(getAvailableFabric(fabric))} available`
    };
  });
}

// Reads the live DOM rows in #fabricComponentsContainer (not state — these
// are unsaved form inputs) and resolves each against inventory.
function readFabricComponentRows() {
  return $$(".fabric-component-row").map((row) => {
    const code = row.dataset.fabricCode || "";
    const fabric = state.fabrics.find((item) => item.code === code) || null;
    const avgFabricUsed = toNumber(row.querySelector('[data-role="avgUsed"]').value);
    return { row, fabric, fabricCode: code, avgFabricUsed };
  });
}

function getCuttingCalculation() {
  const form = $("#cuttingForm");
  // Fabric consumption is driven by the set count, not the sum of every
  // garment's pieces — see getSetPieces for why summing would double-count
  // a shared roll across a Kurta+Pant set.
  const pieces = getSetPieces(readGarmentComponentRows());
  const correctionPercent = toNumber(form.correctionPercent.value);
  const components = readFabricComponentRows().map((entry) => {
    const used = entry.avgFabricUsed * pieces;
    const correction = (toNumber(entry.fabric?.totalLength) * correctionPercent) / 100;
    const remaining = toNumber(entry.fabric?.totalLength) - toNumber(entry.fabric?.consumed) - used - correction;
    return { ...entry, used, correction, remaining };
  });
  const totalUsed = components.reduce((sum, c) => sum + c.used, 0);
  const totalCorrection = components.reduce((sum, c) => sum + c.correction, 0);
  return { pieces, components, totalUsed, totalCorrection };
}

function renderAll() {
  renderOverviewRows();
  renderFabricRows();
  renderCuttingRows();
  renderStagePanels();
  renderOutsourcingRows();
  renderIncomingMaterialRows();
  renderAccessoryRows();
  renderAccessoryStockRows();
  renderAccessoryStockBalance();
  renderStats();
  updateCuttingPreview();
  updateFabricTotal();
  updateOutsourcingPreview();
  if (window.lucide) window.lucide.createIcons();
}

function emptyRow(colspan) {
  return `<tr><td class="empty" colspan="${colspan}">No entries yet.</td></tr>`;
}

function renderStats() {
  const stock = state.fabrics.reduce((sum, fabric) => sum + getAvailableFabric(fabric), 0);
  const pieces = state.cuttings.reduce((sum, cutting) => sum + getPieces(cutting.sizes), 0);
  const open = state.cuttings.filter((cutting) => cutting.stage !== "Finished Goods").length;
  const accessories = state.cuttings
    .filter((cutting) => cutting.stage !== "Finished Goods")
    .reduce((sum, cutting) => {
      const use = getAccessoryUse(cutting);
      return sum + use.elastic + use.button + use.tag;
    }, 0);
  const outsourcingAmount = state.outsourcing.reduce((sum, entry) => sum + getOutsourcingTotal(entry), 0);
  const finishedGoodsPieces = state.cuttings
    .filter((cutting) => cutting.stage === "Finished Goods")
    .reduce((sum, cutting) => sum + getPieces(cutting.sizes), 0);

  $("#stockMeters").textContent = formatMeters(stock);
  $("#cutPieces").textContent = formatQty(pieces);
  $("#openBatches").textContent = formatQty(open);
  $("#accessoryDue").textContent = formatQty(accessories);
  $("#outsourcingAmount").textContent = formatMoney(outsourcingAmount);
  $("#finishedGoodsPieces").textContent = formatQty(finishedGoodsPieces);
}

function renderFabricRows() {
  $("#fabricRows").innerHTML = state.fabrics.length
    ? state.fabrics.map((fabric) => `
      <tr>
        <td><span class="code-pill">${fabric.code}</span></td>
        <td>${fabric.name}</td>
        <td>${fabric.printType}</td>
        <td>${fabric.colour}</td>
        <td>${formatDate(fabric.date)}</td>
        <td class="num">${formatQty(fabric.rolls)}</td>
        <td class="num">${formatMeters(fabric.totalLength)}</td>
        <td class="num">${formatMeters(getAvailableFabric(fabric))}</td>
        <td class="num">
          <button class="icon-button danger" type="button" data-delete-fabric="${fabric.id}" aria-label="Delete fabric ${fabric.code}" data-tooltip="Delete">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </td>
      </tr>
    `).join("")
    : emptyRow(9);
}

// Merges the master SKU database with SKUs created via cutting entries
// (state.cuttings can introduce SKUs the master list doesn't have yet),
// deduped by SKU. Used to power the fuzzy autocomplete on every
// common-name / SKU field so newly-added batches are searchable too.
function allSkuRecords() {
  const map = new Map();
  BACKEND_DATA.skuDatabase.forEach((item) => map.set(item.sku, item.commonName));
  state.cuttings.forEach((cutting) => map.set(cutting.sku, cutting.commonName));
  return Array.from(map.entries()).map(([sku, commonName]) => ({ sku, commonName }));
}

function joinPair(first, second) {
  return [first, second].filter(Boolean).join(" / ");
}

function renderCuttingRows() {
  $("#cuttingRows").innerHTML = state.cuttings.length
    ? state.cuttings.map((cutting) => `
      <tr>
        <td><span class="code-pill">${cutting.batchCode}</span></td>
        <td>${cutting.sku}</td>
        <td>${cutting.commonName}</td>
        <td>
          <div>${escapeHtml(garmentDisplayLabel(cutting))}</div>
          ${cutting.cutGroupId ? `<small class="set-badge">Set with ${escapeHtml(getSetSiblings(cutting).map(garmentDisplayLabel).join(", ") || "\u2014")}</small>` : ""}
        </td>
        <td>${formatDate(cutting.entryDate)}</td>
        <td>${labelGender(cutting.gender)}</td>
        <td>${(cutting.fabricComponents || []).map((c) => `<span class="code-pill">${escapeHtml(c.fabricCode)}</span>`).join(" ") || "&mdash;"}</td>
        <td class="num">
          <div>${formatQty(getPieces(cutting.sizes))}</div>
          <small class="size-breakdown">${formatSizeBreakdown(cutting.sizes) || "&mdash;"}</small>
        </td>
        <td class="num">
          <div>${formatMeters(cutting.fabricUsed)}</div>
          ${(cutting.fabricComponents || []).length > 1 ? `<small class="size-breakdown">${cutting.fabricComponents.map((c) => `${escapeHtml(c.fabricCode)}: ${formatMeters(c.used)}`).join(", ")}</small>` : ""}
        </td>
        <td class="num">${(cutting.fabricComponents || []).map((c) => `<div>${escapeHtml(c.fabricCode)}: ${formatMeters(getFabricRemainingAtCode(c.fabricCode))}</div>`).join("") || "&mdash;"}</td>
        <td><span class="stage-pill">${cutting.stage}</span></td>
        <td class="num">
          <button class="icon-button danger" type="button" data-delete-cutting="${cutting.id}" aria-label="Delete cutting entry ${cutting.batchCode}" data-tooltip="Delete">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </td>
      </tr>
    `).join("")
    : emptyRow(12);
}

// Which Overview status bucket is currently selected ("all" by default).
// Set by the filter-tab click handler in bindEvents.
let overviewFilter = "all";

function renderOverviewRows() {
  const rows = state.cuttings.filter((cutting) =>
    overviewFilter === "all" || getOverviewCategory(cutting) === overviewFilter
  );
  $("#overviewRows").innerHTML = rows.length
    ? rows.slice().reverse().map((cutting) => {
        const category = getOverviewCategory(cutting);
        return `
      <tr>
        <td>${cutting.sku}</td>
        <td>${cutting.commonName}</td>
        <td>
          <div>${escapeHtml(garmentDisplayLabel(cutting))}</div>
          ${cutting.cutGroupId ? `<small class="set-badge">Set with ${escapeHtml(getSetSiblings(cutting).map(garmentDisplayLabel).join(", ") || "\u2014")}</small>` : ""}
        </td>
        <td class="num">
          <div>${formatQty(getPieces(cutting.sizes))}</div>
          <small class="size-breakdown">${formatSizeBreakdown(cutting.sizes) || "&mdash;"}</small>
        </td>
        <td><span class="stage-pill">${OVERVIEW_STATUS_LABELS[category]}</span></td>
        <td>${category === "wip" ? `<span class="code-pill">${escapeHtml(cutting.stage)}</span>` : "&mdash;"}</td>
      </tr>
    `;
      }).join("")
    : emptyRow(6);
}

// Each stage now has its own primary nav tab and panel (instead of one
// shared kanban board), so this fills each stage's #stageBoard-<slug>
// container with just that stage's batches.
function renderStagePanels() {
  STAGES.forEach((stage) => {
    const slug = STAGE_TAB_SLUGS[stage];
    const container = document.getElementById(`stageBoard-${slug}`);
    if (!container) return;
    const batches = state.cuttings.filter((cutting) => cutting.stage === stage);
    container.innerHTML = batches.length
      ? batches.map(renderBatchCard).join("")
      : '<p class="empty">No batches</p>';
  });
}

function renderBatchCard(cutting) {
  const totalPieces = getPieces(cutting.sizes);
  const remainingPieces = getRemainingPieces(cutting);
  const outsourcedPieces = totalPieces - remainingPieces;
  const previousStage = cutting.stageHistory && cutting.stageHistory.length
    ? cutting.stageHistory[cutting.stageHistory.length - 1]
    : null;
  const backOption = previousStage
    ? `<button class="secondary-action" type="button" data-move-back="${cutting.id}" data-tooltip="Undo the last stage move">&larr; Back to ${previousStage}</button>`
    : "";
  // Every transition (in-house move or outsource) now requires there to be
  // remaining, uncommitted pieces to act on — "move" used to fire on the
  // whole batch regardless of remainingPieces, but now that move buttons
  // open the per-size quantity dialog too, there's nothing to send once
  // remaining hits zero.
  const nextOptions = (STAGE_TRANSITIONS[cutting.stage] || [])
    .filter(() => remainingPieces > 0)
    .map((transition) => transition.type === "outsource"
      ? `<button class="secondary-action" type="button" data-outsource-prefill="${cutting.id}" data-outsource-work-type="${transition.workType}">${transition.label}</button>`
      : `<button class="secondary-action" type="button" data-move-qty="${cutting.id}" data-target-stage="${transition.stage}" data-target-label="${escapeHtml(transition.label)}" data-tooltip="Choose how many pieces of each size to send">${transition.label}</button>`)
    .join("");
  const isSplit = cutting.rootCode && cutting.rootCode !== cutting.batchCode;
  const setSiblings = getSetSiblings(cutting);
  return `
    <article class="batch-card">
      <div>
        <strong>${cutting.commonName} \u2014 ${escapeHtml(garmentDisplayLabel(cutting))}</strong>
        <small>${cutting.batchCode} | ${cutting.sku}</small>
        ${setSiblings.length ? `<small class="set-badge">Cut together with ${escapeHtml(setSiblings.map(garmentDisplayLabel).join(", "))}</small>` : ""}
        ${isSplit ? `<small class="size-breakdown">Split from ${cutting.rootCode}</small>` : ""}
      </div>
      <div class="mini-grid">
        <span>Pieces <b>${formatQty(totalPieces)}</b></span>
        <span>Sizes <b>${formatSizeBreakdown(cutting.sizes) || "&mdash;"}</b></span>
        ${outsourcedPieces > 0 ? `<span>Outsourced <b>${formatQty(outsourcedPieces)}</b></span><span>Available <b>${formatQty(remainingPieces)}</b></span>` : ""}
        ${cutting.stage === "Finished Goods" && cutting.finishedGoodsDate ? `<span>In stock since <b>${formatDate(cutting.finishedGoodsDate)}</b></span>` : ""}
      </div>
      <div class="row-actions">${nextOptions}${backOption}</div>
    </article>
  `;
}

// Every stage-transition button (In-house stitching, Kaaj/Button, Handwork,
// Dhaga Cutting, Finished Goods) now opens this dialog instead of moving the
// whole batch outright. It's pre-filled with the full remaining quantity per
// size, so pressing "Send" with no changes behaves like the old one-click
// move — but the operator can dial any size down to send only part of the
// batch forward, with the rest staying behind at the current stage.
let moveQtyTarget = null; // { cuttingId, stage }

function openMoveQtyDialog(cutting, stage, label) {
  moveQtyTarget = { cuttingId: cutting.id, stage };
  const remaining = cutting.sizesRemaining || cutting.sizes;
  const dialog = $("#moveQtyDialog");
  $("#moveQtyDialogTitle").textContent = label;
  $("#moveQtySubtitle").textContent =
    `${cutting.commonName} \u2014 ${cutting.batchCode} \u00b7 ${formatQty(getRemainingPieces(cutting))} pieces available`;
  $("#moveQtySizeGrid").innerHTML = SIZES
    .filter(([name]) => toNumber(remaining[name]) > 0)
    .map(([name, sizeLabel]) => `
      <label>
        ${sizeLabel}
        <input type="number" min="0" max="${toNumber(remaining[name])}" step="1" value="${toNumber(remaining[name])}" data-move-qty-size="${name}">
        <small>of ${formatQty(remaining[name])} available</small>
      </label>
    `).join("");
  updateMoveQtyTotal();
  dialog.showModal();
}

function readMoveQtySizes() {
  return Object.fromEntries(
    $$("[data-move-qty-size]").map((input) => [input.dataset.moveQtySize, toNumber(input.value)])
  );
}

function updateMoveQtyTotal() {
  const total = getPieces(readMoveQtySizes());
  $("#moveQtyTotal").textContent = `Sending ${formatQty(total)} piece${total === 1 ? "" : "s"} forward`;
}

// Advances the whole record to `stage` in place (used when the selected
// quantity is the full remaining amount, so there's no need to split off a
// separate batch).
function applyStageMove(cutting, stage) {
  cutting.stageHistory = cutting.stageHistory || [];
  cutting.stageHistory.push(cutting.stage);
  cutting.stage = stage;
  // Arriving at a new stage always starts with the full quantity available
  // again — "remaining" tracks what hasn't been committed to a vendor *at
  // this stage*, not lifetime history.
  cutting.sizesRemaining = { ...cutting.sizes };
  if (stage === "Finished Goods") {
    cutting.finishedGoodsDate = todayDate();
  }
}

// Sends `selectedSizes` worth of pieces from `cutting` forward to `stage`.
// If the selection covers everything remaining, the batch just moves as a
// whole (no new batch code). Otherwise it peels the selected sizes off into
// a brand-new batch (reusing splitBatch's cloning/lineage/fabric-prorating
// logic) and puts that new batch straight onto `stage`, while the original
// batch stays put with the leftover quantity.
function moveQuantityForward(cutting, stage, selectedSizes) {
  const remaining = cutting.sizesRemaining || cutting.sizes;
  const overage = SIZES.find(([name]) => toNumber(selectedSizes[name]) > toNumber(remaining[name]));
  if (overage) {
    alert(`Only ${formatQty(remaining[overage[0]])} pieces of ${overage[1]} are still available to send.`);
    return false;
  }
  const selectedPieces = getPieces(selectedSizes);
  if (selectedPieces <= 0) {
    alert("Enter at least one piece to send.");
    return false;
  }
  const isFullMove = SIZES.every(([name]) => toNumber(selectedSizes[name]) === toNumber(remaining[name]));
  if (isFullMove) {
    applyStageMove(cutting, stage);
    return true;
  }
  const previousStage = cutting.stage;
  const previousHistory = cutting.stageHistory || [];
  const child = splitBatch(cutting, selectedSizes);
  if (!child) return false; // splitBatch already alerted on invalid input
  child.stageHistory = [...previousHistory, previousStage];
  child.stage = stage;
  delete child.finishedGoodsDate;
  if (stage === "Kaaj/Button") child.sizesRemaining = { ...child.sizes };
  if (stage === "Finished Goods") child.finishedGoodsDate = todayDate();
  return true;
}

// Not every SKU walks the full stage path — some skip Kaaj/Button and/or
// Handwork entirely and go straight to Dhaga Cutting. Rather than guess this
// per SKU, every stage that could plausibly be skipped shows ALL of its
// plausible next stages as buttons, and the operator picks the one that's
// correct for that specific batch. Kaaj/Button is still always vendor work
// (no in-house move onto it), but once a batch sits at Kaaj/Button, the
// operator can move it straight to Handwork or straight to Dhaga Cutting
// without outsourcing, if this batch doesn't need that step.
const STAGE_TRANSITIONS = {
  "Cutting complete": [
    { type: "move", stage: "In-house stitching", label: "In-house stitching" },
    { type: "outsource", workType: "Stitching", label: "Outsource stitching" }
  ],
  "In-house stitching": [
    { type: "outsource", workType: "Stitching", label: "Outsource stitching" },
    { type: "move", stage: "Kaaj/Button", label: "Kaaj/Button" },
    { type: "move", stage: "Handwork", label: "Handwork" },
    { type: "move", stage: "Dhaga Cutting", label: "Dhaga Cutting" }
  ],
  "Outsource stitching": [
    { type: "move", stage: "Kaaj/Button", label: "Kaaj/Button" },
    { type: "move", stage: "Handwork", label: "Handwork" },
    { type: "move", stage: "Dhaga Cutting", label: "Dhaga Cutting" }
  ],
  "Kaaj/Button": [
    { type: "outsource", workType: "Kaaj/Button", label: "Outsource Kaaj/Button" },
    { type: "move", stage: "Handwork", label: "Handwork" },
    { type: "move", stage: "Dhaga Cutting", label: "Dhaga Cutting" }
  ],
  "Handwork": [
    { type: "outsource", workType: "Handwork", label: "Outsource Handwork" },
    { type: "move", stage: "Dhaga Cutting", label: "Dhaga Cutting" }
  ],
  "Dhaga Cutting": [
    { type: "move", stage: "Finished Goods", label: "Move to Finished Goods" }
  ]
};

// Stages that should auto-advance once every remaining piece has been committed
// to an outsourcing entry (so the board doesn't need a dedicated "waiting on
// vendor" column for stages with no in-house alternative).
const AUTO_ADVANCE_ON_FULL_OUTSOURCE = {
  "Cutting complete": "Outsource stitching",
  "In-house stitching": "Outsource stitching",
  "Kaaj/Button": "Handwork",
  "Handwork": "Dhaga Cutting"
};

function renderOutsourcingRows() {
  $("#outsourcingRows").innerHTML = state.outsourcing.length
    ? state.outsourcing.map((entry) => `
      <tr>
        <td><span class="stage-pill">${entry.workType}</span></td>
        <td>${entry.vendorName}</td>
        <td>${entry.sku}</td>
        <td>${entry.commonName}</td>
        <td class="num">
          <div>${formatQty(getPieces(entry.sizes))}</div>
          <small class="size-breakdown">${formatSizeBreakdown(entry.sizes) || "&mdash;"}</small>
        </td>
        <td class="num">${formatMoney(entry.rate)}</td>
        <td class="num">${formatMoney(getOutsourcingTotal(entry))}</td>
        <td>${entry.deliveryDate}</td>
        <td>${formatAccessories(entry.accessories)}</td>
        <td class="num">
          <button class="icon-button danger" type="button" data-delete-outsourcing="${entry.id}" aria-label="Delete outsourcing entry" data-tooltip="Delete">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </td>
      </tr>
    `).join("")
    : emptyRow(10);
}

function formatReceiptHistory(entry) {
  if (!(entry.receipts || []).length) return "";
  return `<small class="size-breakdown">${entry.receipts
    .map((receipt) => `${formatQty(receipt.qty)} on ${formatDate(receipt.date)}`)
    .join(", ")}</small>`;
}

function renderIncomingMaterialRows() {
  $("#incomingMaterialRows").innerHTML = state.outsourcing.length
    ? state.outsourcing.map((entry) => {
        const fullyReceived = isOutsourcingFullyReceived(entry);
        return `
      <tr>
        <td><span class="stage-pill">${entry.workType}</span></td>
        <td>${entry.vendorName}</td>
        <td>${entry.sku}</td>
        <td>${entry.commonName}</td>
        <td class="num">${formatQty(getPieces(entry.sizes))}</td>
        <td class="num">
          <div>${formatQty(getOutsourcingReceivedQty(entry))}</div>
          ${formatReceiptHistory(entry)}
        </td>
        <td class="num">${fullyReceived ? '<span class="code-pill">Fully received</span>' : formatQty(getOutsourcingPendingQty(entry))}</td>
        <td class="num">${formatMoney(getOutsourcingTotal(entry))}</td>
        <td class="num">${formatMoney(getOutsourcingAmountPaid(entry))}</td>
        <td class="num">${formatMoney(getOutsourcingAmountLeft(entry))}</td>
        <td>${fullyReceived ? "&mdash;" : formatDate(entry.pendingDeliveryDate || entry.deliveryDate)}</td>
        <td class="num">
          <button class="secondary-action" type="button" data-log-receipt="${entry.id}" ${fullyReceived ? "disabled" : ""}>
            Log receipt
          </button>
        </td>
      </tr>
    `;
      }).join("")
    : emptyRow(12);
}

// "Log receipt" dialog: records one incoming delivery against an
// outsourcing entry (partial or full), the date it came in, what was paid
// against it, and — if anything's still outstanding — a revised pending
// delivery date for the rest. The entry itself is picked from a dropdown
// inside the dialog, so it works both from a specific row's "Log receipt"
// button (pre-selected) and from the panel's top-level "Log receipt" button
// (operator picks which vendor/work just arrived).
let receiveTarget = null; // outsourcing entry id

function pendingOutsourcingEntries() {
  return state.outsourcing.filter((entry) => getOutsourcingPendingQty(entry) > 0);
}

function populateReceiveEntryOptions(selectedId) {
  const select = $("#receiveEntrySelect");
  const options = pendingOutsourcingEntries();
  select.innerHTML = options.length
    ? options.map((entry) => `
        <option value="${entry.id}">
          ${escapeHtml(entry.workType)} \u00b7 ${escapeHtml(entry.vendorName)} \u00b7 ${escapeHtml(entry.commonName)} (${formatQty(getOutsourcingPendingQty(entry))} pending)
        </option>
      `).join("")
    : '<option value="">No pending entries</option>';
  select.value = selectedId && options.some((entry) => entry.id === selectedId) ? selectedId : (options[0]?.id || "");
}

// Fills every dialog field from the currently selected entry. Called on
// open and again whenever the dropdown selection changes.
function applyReceiveEntryToDialog(entry) {
  if (!entry) {
    $("#receiveSubtitle").textContent = "Nothing pending right now.";
    $("#receiveQty").value = 0;
    $("#receiveQty").max = 0;
    $("#receiveQtyMax").textContent = "";
    $("#receiveAmountLeftHint").textContent = "";
    $("#receivePendingDate").value = "";
    $("#receiveTotal").textContent = "";
    return;
  }
  receiveTarget = entry.id;
  const pending = getOutsourcingPendingQty(entry);
  const amountLeft = getOutsourcingAmountLeft(entry);
  $("#receiveSubtitle").textContent =
    `${entry.commonName} \u2014 ${entry.vendorName} \u00b7 ${formatQty(pending)} of ${formatQty(getPieces(entry.sizes))} pieces still pending`;
  const qtyInput = $("#receiveQty");
  qtyInput.value = pending;
  qtyInput.max = pending;
  $("#receiveQtyMax").textContent = `of ${formatQty(pending)} pending`;
  $("#receiveAmountLeftHint").textContent = `${formatMoney(amountLeft)} left on this entry`;
  $("#receivePendingDate").value = entry.pendingDeliveryDate || entry.deliveryDate;
  updateReceiveTotal();
}

function openReceiveDialog(entry) {
  populateReceiveEntryOptions(entry?.id);
  const selectedId = $("#receiveEntrySelect").value;
  const selectedEntry = state.outsourcing.find((item) => item.id === selectedId) || null;
  $("#receiveDate").value = todayDate();
  $("#receiveAmountPaid").value = 0;
  applyReceiveEntryToDialog(selectedEntry);
  if (!selectedEntry) {
    alert("No pending outsourcing entries to receive against.");
    return;
  }
  $("#receiveDialog").showModal();
}

function updateReceiveTotal() {
  const entry = state.outsourcing.find((item) => item.id === receiveTarget);
  if (!entry) return;
  const qty = toNumber($("#receiveQty").value);
  const pending = getOutsourcingPendingQty(entry);
  const stillPending = Math.max(0, pending - qty);
  $("#receivePendingDate").closest("label").style.opacity = stillPending > 0 ? "1" : "0.5";
  $("#receivePendingDate").disabled = stillPending <= 0;
  $("#receiveTotal").textContent = stillPending > 0
    ? `Receiving ${formatQty(qty)} piece${qty === 1 ? "" : "s"} \u2014 ${formatQty(stillPending)} will still be pending`
    : `Receiving ${formatQty(qty)} piece${qty === 1 ? "" : "s"} \u2014 clears this entry`;
}

function submitReceipt() {
  clearFieldInvalid($("#receiveQty"));
  clearFieldInvalid($("#receiveDate"));
  const entry = state.outsourcing.find((item) => item.id === $("#receiveEntrySelect").value);
  if (!entry) {
    alert("Pick which outsourcing entry this receipt is against.");
    return false;
  }
  const pending = getOutsourcingPendingQty(entry);
  const qty = toNumber($("#receiveQty").value);
  if (qty <= 0) {
    markFieldInvalid($("#receiveQty"));
    alert("Enter at least one piece received.");
    return false;
  }
  if (qty > pending) {
    markFieldInvalid($("#receiveQty"));
    alert(`Only ${formatQty(pending)} pieces are still pending on this entry.`);
    return false;
  }
  const date = $("#receiveDate").value;
  if (!date) {
    markFieldInvalid($("#receiveDate"));
    alert("Pick the date received.");
    return false;
  }
  entry.receipts = entry.receipts || [];
  entry.receipts.push({
    id: crypto.randomUUID(),
    qty,
    date,
    amountPaid: toNumber($("#receiveAmountPaid").value)
  });
  const stillPending = pending - qty;
  entry.pendingDeliveryDate = stillPending > 0
    ? ($("#receivePendingDate").value || entry.pendingDeliveryDate || entry.deliveryDate)
    : "";
  return true;

}

function formatAccessories(accessories) {
  const parts = [];
  if (toNumber(accessories?.elastic)) parts.push(`Elastic ${formatQty(accessories.elastic)}`);
  if (toNumber(accessories?.button)) parts.push(`Button ${formatQty(accessories.button)}`);
  if (toNumber(accessories?.tag)) parts.push(`Tag ${formatQty(accessories.tag)}`);
  if (accessories?.otherAccessory) parts.push(accessories.otherAccessory);
  return parts.length ? parts.join(", ") : "None";
}

function renderAccessoryRows() {
  $("#accessoryRows").innerHTML = state.cuttings.length
    ? state.cuttings.map((cutting) => {
      const use = getAccessoryUse(cutting);
      return `
        <tr>
          <td><span class="code-pill">${cutting.batchCode}</span></td>
          <td>${cutting.commonName}</td>
          <td>${escapeHtml(garmentDisplayLabel(cutting))}</td>
          <td class="num">${formatQty(getPieces(cutting.sizes))}</td>
          <td class="num">${formatQty(use.elastic)}</td>
          <td class="num">${formatQty(use.button)}</td>
          <td class="num">${formatQty(use.tag)}</td>
        </tr>
      `;
    }).join("")
    : emptyRow(7);
}

function renderAccessoryStockRows() {
  $("#accessoryStockRows").innerHTML = state.accessoryStock.length
    ? state.accessoryStock.slice().reverse().map((entry) => `
      <tr>
        <td><span class="stage-pill">${accessoryTypeLabel(entry.accessoryType)}</span></td>
        <td>${entry.accessoryType === "other" ? escapeHtml(entry.label) : "&mdash;"}</td>
        <td>${entry.sku ? `${escapeHtml(entry.sku)}${entry.commonName ? ` (${escapeHtml(entry.commonName)})` : ""}` : "General stock"}</td>
        <td>${formatDate(entry.date)}</td>
        <td class="num">${formatQty(entry.qty)}</td>
        <td class="num">
          <button class="icon-button danger" type="button" data-delete-accessory-stock="${entry.id}" aria-label="Delete stock entry" data-tooltip="Delete">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </td>
      </tr>
    `).join("")
    : emptyRow(6);
}

function renderAccessoryStockBalance() {
  const groups = getAccessoryStockGroups();
  $("#accessoryBalanceRows").innerHTML = groups.length
    ? groups.map((group) => `
      <tr>
        <td>${escapeHtml(group.label)}</td>
        <td class="num">${formatQty(group.received)}</td>
        <td class="num">${group.required === null ? "&mdash;" : formatQty(group.required)}</td>
        <td class="num">${group.balance === null ? "&mdash;" : formatQty(group.balance)}</td>
      </tr>
    `).join("")
    : emptyRow(4);
}

function labelType(type) {
  return ACCESSORY_RULES[type]?.label || type;
}

// A garment's optional free-text label (e.g. a custom name typed on its row)
// wins over the generic type label, so "Kurta" can show even if the type
// dropdown was left on "custom".
function garmentDisplayLabel(cutting) {
  return cutting.garmentLabel || labelType(cutting.garmentType);
}

// Other batches created from the same multi-garment cut event (e.g. this
// batch's Pant sibling, if this one is Kurta). Empty for single-garment cuts.
function getSetSiblings(cutting) {
  if (!cutting.cutGroupId) return [];
  return state.cuttings.filter((item) => item.cutGroupId === cutting.cutGroupId && item.id !== cutting.id);
}

function accessoryTypeLabel(type) {
  return ACCESSORY_TYPES.find(([key]) => key === type)?.[1] || type;
}

// Groups stock receipts by accessory type (and by custom name for "other"),
// then measures each group against total requirement across all open
// batches. This is a global pool, not a per-SKU allocation — the optional
// "Linked SKU" on a stock entry is a reference note only (shown in the log),
// it does not carve out a separate balance for that SKU. Splitting the pool
// per SKU would need to know which specific stock lot each cutting actually
// draws from, which this app doesn't track — showing a precise-looking
// per-SKU balance without that would be a fake-precision bug, not a feature.
function getAccessoryStockGroups() {
  const groups = new Map();
  state.accessoryStock.forEach((entry) => {
    const key = entry.accessoryType === "other" ? `other:${entry.label.toLowerCase()}` : entry.accessoryType;
    if (!groups.has(key)) {
      groups.set(key, {
        accessoryType: entry.accessoryType,
        label: entry.accessoryType === "other" ? entry.label : accessoryTypeLabel(entry.accessoryType),
        received: 0
      });
    }
    groups.get(key).received += toNumber(entry.qty);
  });
  const openCuttings = state.cuttings.filter((cutting) => cutting.stage !== "Finished Goods");
  return Array.from(groups.values()).map((group) => {
    const required = group.accessoryType === "other"
      ? null
      : openCuttings.reduce((sum, cutting) => sum + toNumber(getAccessoryUse(cutting)[group.accessoryType]), 0);
    return { ...group, required, balance: required === null ? null : group.received - required };
  });
}

function labelGender(gender) {
  return GENDERS.find(([value]) => value === gender)?.[1] || gender || "\u2014";
}

function updateCuttingPreview() {
  const { components, totalUsed, totalCorrection } = getCuttingCalculation();
  components.forEach((entry) => updateFabricRowAvailability(entry.row, entry.fabric));
  if (components.length <= 1) {
    const only = components[0];
    $("#cuttingPreview").innerHTML = `
      <span>Fabric used: <strong>${formatMeters(only?.used || 0)}</strong></span>
      <span>Correction: <strong>${formatMeters(only?.correction || 0)}</strong></span>
      <span>Remaining after cut: <strong>${formatMeters(only?.remaining ?? 0)}</strong></span>
    `;
    return;
  }
  const rows = components.map((entry) => `
    <span>${entry.fabric ? escapeHtml(entry.fabric.code) : "\u2014"}:
      <strong>${formatMeters(entry.used)} used, ${formatMeters(entry.remaining)} left</strong>
    </span>
  `).join("");
  $("#cuttingPreview").innerHTML = `
    ${rows}
    <span>Total used: <strong>${formatMeters(totalUsed)}</strong></span>
    <span>Total correction: <strong>${formatMeters(totalCorrection)}</strong></span>
  `;
}

function updateFabricTotal() {
  const form = $("#fabricForm");
  form.totalLength.value = toNumber(form.qty.value) * toNumber(form.rolls.value);
  form.codePreview.value = makeFabricCode({
    name: form.name.value,
    printType: form.printType.value,
    colour: form.colour.value
  });
}

function updateOutsourcingPreview() {
  const form = $("#outsourcingForm");
  const sizes = Object.fromEntries(SIZES.map(([name]) => [name, toNumber(form[name].value)]));
  const quantity = getPieces(sizes);
  const total = quantity * toNumber(form.rate.value);
  form.totalAmount.value = total;
  $("#outsourcingPreview").innerHTML = `
    <span>Total quantity: <strong>${formatQty(quantity)}</strong></span>
    <span>Total amount: <strong>${formatMoney(total)}</strong></span>
  `;
}

let fabricRowSeq = 0;

// Writes the read-only Print / Colour reference fields on a fabric row.
// These mirror whatever fabric is currently linked to the row (a matched
// received roll, or — if nothing's been receipted yet — the print/colour
// the master style database says this slot requires) so the operator can
// always see what's needed, even before a real roll exists in inventory.
function setFabricRowPrintColour(row, printType, colour) {
  row.querySelector('[data-role="printType"]').value = printType || "";
  row.querySelector('[data-role="colour"]').value = colour || "";
}

// Builds one fabric-component row (search input + avg-used input + Print/
// Colour reference fields + remove button), wires its own autocomplete
// instance, and appends it to the container.
// - fabricCode/avgUsed pre-fill it against an ALREADY RECEIVED roll (used
//   when a common name/SKU match finds stock on hand).
// - required ({name, printType, colour}) is used instead when the matched
//   style needs a fabric that hasn't been receipted into inventory yet: the
//   row still shows what's needed (and stays searchable/selectable once
//   that roll does arrive) rather than silently disappearing.
function addFabricComponentRow(fabricCode = "", avgUsed = "", required = null) {
  const container = $("#fabricComponentsContainer");
  const id = `fabricRow${++fabricRowSeq}`;
  const wrapper = document.createElement("div");
  wrapper.className = "fabric-component-row";
  wrapper.dataset.rowId = id;
  wrapper.dataset.fabricCode = fabricCode;
  wrapper.innerHTML = `
    <input class="fabric-search" data-role="search" autocomplete="off" placeholder="Search style/nickname, fabric name, print, colour, or code">
    <input class="fabric-avg-used" data-role="avgUsed" type="number" min="0.01" step="0.01" placeholder="Avg used/piece (m) \u2014 required" value="${avgUsed}">
    <input class="fabric-print" data-role="printType" readonly placeholder="Print">
    <input class="fabric-colour" data-role="colour" readonly placeholder="Colour">
    <button class="icon-button danger" type="button" data-remove-fabric-row aria-label="Remove this fabric" data-tooltip="Remove">
      <i data-lucide="trash-2" aria-hidden="true"></i>
    </button>
    <small class="fabric-row-avail" data-role="avail"></small>
  `;
  container.appendChild(wrapper);
  const searchInput = wrapper.querySelector('[data-role="search"]');
  attachAutocomplete(searchInput, fabricInventoryOptions, { maxResults: 10 });
  const fabric = fabricCode ? state.fabrics.find((item) => item.code === fabricCode) : null;
  if (fabric) {
    searchInput.value = [fabric.name, fabric.printType, fabric.colour].filter(Boolean).join(" / ");
    setFabricRowPrintColour(wrapper, fabric.printType, fabric.colour);
    updateFabricRowAvailability(wrapper, fabric);
  } else if (required && (required.name || required.printType || required.colour)) {
    wrapper.dataset.requiredFabric = required.name || "";
    wrapper.dataset.requiredPrint = required.printType || "";
    wrapper.dataset.requiredColour = required.colour || "";
    searchInput.value = [required.name, required.printType, required.colour].filter(Boolean).join(" / ");
    setFabricRowPrintColour(wrapper, required.printType, required.colour);
    updateFabricRowAvailability(wrapper, null, required);
  }
  if (window.lucide) window.lucide.createIcons();
  return wrapper;
}

function updateFabricRowAvailability(row, fabric, required = null) {
  const label = row.querySelector('[data-role="avail"]');
  if (fabric) {
    const available = getAvailableFabric(fabric);
    label.textContent = `${fabric.code} \u2014 ${formatMeters(available)} available`;
    label.classList.toggle("warn", available <= 0);
    return;
  }
  if (required && (required.name || required.printType || required.colour)) {
    label.textContent = "This style needs this fabric \u2014 not received into inventory yet. Log it under Fabric inventory, then search to link the roll here.";
    label.classList.add("warn");
    return;
  }
  label.textContent = "";
  label.classList.remove("warn");
}

function clearFabricComponentRows() {
  $("#fabricComponentsContainer").innerHTML = "";
}

let garmentRowSeq = 0;

// Builds one "garment produced" row: a type select, an optional free-text
// label, a remove button, and that garment's own size grid (always shown —
// every garment enters its own size split directly, there's no shared
// fallback grid anymore).
function addGarmentComponentRow(type = "", label = "") {
  const container = $("#garmentComponentsContainer");
  const id = `garmentRow${++garmentRowSeq}`;
  const wrapper = document.createElement("div");
  wrapper.className = "garment-component-row";
  wrapper.dataset.rowId = id;
  wrapper.innerHTML = `
    <label>Garment type
      <select data-role="garmentType">
        ${GARMENT_TYPE_OPTIONS.map(([value, text]) => `<option value="${value}"${value === type ? " selected" : ""}>${text}</option>`).join("")}
      </select>
    </label>
    <label>Label (optional)
      <input data-role="garmentLabel" autocomplete="off" placeholder="e.g. Kurta" value="${escapeHtml(label)}">
    </label>
    <button class="icon-button danger" type="button" data-remove-garment-row aria-label="Remove this garment" data-tooltip="Remove">
      <i data-lucide="trash-2" aria-hidden="true"></i>
    </button>
    <fieldset class="size-grid garment-size-grid" data-role="ownSizeGrid">
      <legend>Sizes for this garment<span class="req">*</span></legend>
      ${SIZES.map(([name, sizeLabel]) => `<label>${sizeLabel} <input type="number" min="0" step="1" value="0" data-size="${name}"></label>`).join("")}
    </fieldset>
  `;
  container.appendChild(wrapper);
  if (window.lucide) window.lucide.createIcons();
  return wrapper;
}

function clearGarmentComponentRows() {
  $("#garmentComponentsContainer").innerHTML = "";
}

// Reads the live DOM rows in #garmentComponentsContainer, including each
// garment's own size grid.
function readGarmentComponentRows() {
  return $$(".garment-component-row").map((row) => {
    const sizes = {};
    row.querySelectorAll("[data-size]").forEach((input) => {
      sizes[input.dataset.size] = toNumber(input.value);
    });
    return {
      type: row.querySelector('[data-role="garmentType"]').value,
      label: row.querySelector('[data-role="garmentLabel"]').value.trim(),
      sizes
    };
  });
}

// The "set" size used to size a shared fabric roll's consumption. A fabric's
// avgFabricUsed is entered once per set (e.g. it already covers a Kurta +
// Pant cut together from the same roll), so the pieces used to multiply it
// must be the set count — NOT the sum of every garment's pieces, which would
// double (or triple) count the same roll once per garment in the set. The
// largest garment row stands in for the set count: garments cut together as
// a set share the same count, and a smaller row (e.g. a few unmatched extra
// pieces of one garment) shouldn't shrink the fabric estimate for the set.
function getSetPieces(garmentRows) {
  return garmentRows.reduce((max, row) => Math.max(max, getPieces(row.sizes)), 0);
}

// Rebuilds the fabric-component rows from a matched SKU's master fabric
// record (fabric + optional fabric2, e.g. a coord set that pairs two
// different colours/prints), so a style that's used a known combination
// before doesn't need re-typing every time. A row is added for every slot
// the master record actually defines, whether or not a matching roll has
// been received yet — a slot that's needed but not in stock still shows up
// (with its required fabric/print/colour) instead of silently vanishing,
// which previously made 2-fabric styles look like only one was needed.
function populateFabricRowsFromSku(skuRecord) {
  clearFabricComponentRows();
  const fabricRecord = findFabricBySku(skuRecord?.sku);
  const slot1Match = matchFabricForSku(skuRecord, 1);
  const slot2Match = matchFabricForSku(skuRecord, 2);
  const slot1Required = fabricRecord?.fabric
    ? { name: fabricRecord.fabric, printType: fabricRecord.printType, colour: fabricRecord.colour }
    : null;
  const slot2Required = fabricRecord?.fabric2
    ? { name: fabricRecord.fabric2, printType: fabricRecord.printType2, colour: fabricRecord.colour2 }
    : null;
  if (slot1Match) addFabricComponentRow(slot1Match.code);
  else if (slot1Required) addFabricComponentRow("", "", slot1Required);
  if (slot2Match) addFabricComponentRow(slot2Match.code);
  else if (slot2Required) addFabricComponentRow("", "", slot2Required);
  if (!slot1Match && !slot1Required && !slot2Match && !slot2Required) addFabricComponentRow();
}

function applySkuToForm(form, skuRecord) {
  if (!skuRecord) return;
  form.sku.value = skuRecord.sku;
  form.commonName.value = skuRecord.commonName;
  // Only the cutting form has fabric-component rows (and now garment rows)
  // to rebuild (outsourcing and accessory forms call applySkuToForm too,
  // but don't touch fabric or garments).
  if (form.id === "cuttingForm") {
    // Only guess when there's a single, still-untouched garment row — once
    // someone's built out a multi-garment set manually, a SKU match
    // shouldn't clobber it.
    const rows = $$(".garment-component-row");
    if (rows.length === 1) {
      const skuText = `${skuRecord.commonName} ${skuRecord.sku}`.toLowerCase();
      let guessedType = "";
      if (skuText.includes("kurta")) guessedType = "kurta";
      else if (skuText.includes("pant")) guessedType = "pant";
      else if (skuText.includes("shirt") || skuText.includes("top")) guessedType = "shirt";
      else if (skuText.includes("dress")) guessedType = "dress";
      if (guessedType) rows[0].querySelector('[data-role="garmentType"]').value = guessedType;
    }
    populateFabricRowsFromSku(skuRecord);
  }
}

// Fills only Fabric name / Print type / Colour from a picked style/nickname
// match — code, quantity, rolls, and date stay untouched and manual, same as
// they would be entering straight from an invoice. slot picks which fabric
// on a two-fabric master record to apply (1 = fabric/printType/colour,
// 2 = fabric2/printType2/colour2); defaults to 1 for single-fabric styles.
function applyFabricStyleToForm(form, fabricRecord, slot = 1) {
  if (!fabricRecord) return;
  form.name.value = (slot === 2 ? fabricRecord.fabric2 : fabricRecord.fabric) || "";
  form.printType.value = (slot === 2 ? fabricRecord.printType2 : fabricRecord.printType) || "";
  form.colour.value = (slot === 2 ? fabricRecord.colour2 : fabricRecord.colour) || "";
  updateFabricTotal();
}

// Only "Cutting complete" has a genuine in-house alternative for leftover
// pieces of the SAME work type (stitch in-house vs. outsource stitching).
// Kaaj/Button also mixes move + outsource buttons now, but its move options
// are stage-skips to a different stage entirely, not an in-house way to
// finish Kaaj/Button work — so it's deliberately excluded here.
const STAGES_WITH_IN_HOUSE_OPTION = new Set(["Cutting complete"]);

function setOutsourcingSourceLink(cutting, workType) {
  const form = $("#outsourcingForm");
  form.sourceCuttingId.value = cutting.id;
  const leftoverNote = STAGES_WITH_IN_HOUSE_OPTION.has(cutting.stage)
    ? "reduce a size below to keep those pieces in-house"
    : "reduce a size below to leave the rest for another outsourcing entry";
  $("#outsourcingHintText").textContent =
    `Outsourcing ${workType} from ${cutting.batchCode} (${cutting.commonName}) \u2014 ${leftoverNote}. Max shown is what's still available.`;
  $("#outsourcingHint").hidden = false;
}

function clearOutsourcingSourceLink() {
  const form = $("#outsourcingForm");
  form.sourceCuttingId.value = "";
  $("#outsourcingHint").hidden = true;
  SIZES.forEach(([name]) => form[name].removeAttribute("max"));
}

function applyCuttingSizesToOutsourcingForm(cutting, workType = "Stitching") {
  const form = $("#outsourcingForm");
  const remaining = cutting.sizesRemaining || cutting.sizes;
  SIZES.forEach(([name]) => {
    const available = toNumber(remaining[name]);
    form[name].value = available;
    form[name].max = available;
  });
  setOutsourcingSourceLink(cutting, workType);
  updateOutsourcingPreview();
}

function prefillOutsourcingFromCutting(cutting, workType = "Stitching") {
  const form = $("#outsourcingForm");
  form.workType.value = workType;
  form.sku.value = cutting.sku;
  form.commonName.value = cutting.commonName;
  applyCuttingSizesToOutsourcingForm(cutting, workType);
  form.vendorName.focus();
}

function switchTab(tabName) {
  $$(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === tabName));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${tabName}Panel`));
}

function bindEvents() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  $("#overviewFilters").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-overview-filter]");
    if (!btn) return;
    overviewFilter = btn.dataset.overviewFilter;
    $$("#overviewFilters .filter-tab").forEach((el) => el.classList.toggle("active", el === btn));
    renderOverviewRows();
  });

  $("#fabricForm").addEventListener("input", updateFabricTotal);

  $("#fabricForm").styleSearch.addEventListener("change", (event) => {
    const match = resolveFabricStyleSelection(event.target.value);
    if (match) {
      // Rewrite the raw "<sku>::<slot>" (or free-typed text) back to a
      // human-readable label, same pattern the cutting form's fabric-search
      // uses after resolving a code — and mark which fabric this is when
      // it's the second of a two-fabric style, so re-opening the field
      // still shows which slot was picked.
      event.target.value = match.slot === 2 ? `${match.record.commonName} \u2014 2nd fabric` : match.record.commonName;
    }
    applyFabricStyleToForm(event.currentTarget.form, match?.record, match?.slot);
  });

  $("#fabricForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    clearAllInvalid(form);
    let hasInvalid = false;
    if (!(toNumber(form.qty.value) > 0)) {
      markFieldInvalid(form.qty);
      hasInvalid = true;
    }
    if (!(toNumber(form.rolls.value) > 0)) {
      markFieldInvalid(form.rolls);
      hasInvalid = true;
    }
    if (hasInvalid) {
      alert("Qty per roll and Rolls must both be greater than 0 before saving. The missing fields are highlighted in red.");
      return;
    }
    updateFabricTotal();
    const fabric = {
      id: crypto.randomUUID(),
      code: form.codePreview.value,
      name: form.name.value.trim(),
      printType: form.printType.value.trim(),
      colour: form.colour.value.trim(),
      date: form.date.value,
      qty: toNumber(form.qty.value),
      rolls: toNumber(form.rolls.value),
      totalLength: toNumber(form.qty.value) * toNumber(form.rolls.value),
      consumed: 0
    };
    state.fabrics.push(fabric);
    saveState();
    form.reset();
    updateFabricTotal();
    form.date.value = todayDate();
    renderAll();
  });

  $("#cuttingForm").addEventListener("input", updateCuttingPreview);

  // Delegated: fires when an autocomplete commit sets a fabric-search
  // input's value to a fabric code (attachAutocomplete dispatches
  // "change" on commit). Resolves the code against inventory, swaps the
  // input's display text to something human-readable, and stores the code
  // on the row for readFabricComponentRows()/submit to use.
  $("#cuttingForm").addEventListener("change", (event) => {
    if (!event.target.classList.contains("fabric-search")) return;
    const row = event.target.closest(".fabric-component-row");
    const typed = event.target.value.trim();
    // Autocomplete commits always write a fabric CODE into the field before
    // dispatching this change event, so code match is checked first. But
    // any native browser "change" (typing the label text and tabbing away,
    // pasting it, or the field simply losing focus again later) fires this
    // same handler with the human-readable LABEL as the value, not a code —
    // that used to fail the lookup and silently blank out dataset.fabricCode
    // even when the field still displayed a perfectly valid-looking fabric
    // name. Falling back to a label match keeps the row linked in that case
    // instead of unlinking a fabric the operator already picked correctly.
    let fabric = state.fabrics.find((item) => item.code === typed);
    if (!fabric) {
      const typedLower = typed.toLowerCase();
      fabric = state.fabrics.find((item) =>
        [item.name, item.printType, item.colour].filter(Boolean).join(" / ").toLowerCase() === typedLower
      );
    }
    if (fabric) {
      row.dataset.fabricCode = fabric.code;
      event.target.value = [fabric.name, fabric.printType, fabric.colour].filter(Boolean).join(" / ");
      setFabricRowPrintColour(row, fabric.printType, fabric.colour);
      updateFabricRowAvailability(row, fabric);
    } else {
      row.dataset.fabricCode = "";
      // Cleared or no longer matches a received roll — fall back to the
      // required print/colour for this slot (if this row came from a SKU
      // match) instead of leaving the reference fields blank.
      const required = {
        name: row.dataset.requiredFabric || "",
        printType: row.dataset.requiredPrint || "",
        colour: row.dataset.requiredColour || ""
      };
      setFabricRowPrintColour(row, required.printType, required.colour);
      updateFabricRowAvailability(row, null, required);
    }
    updateCuttingPreview();
  });

  $("#addFabricRowBtn").addEventListener("click", () => {
    addFabricComponentRow();
    updateCuttingPreview();
  });

  $("#addGarmentRowBtn").addEventListener("click", () => {
    addGarmentComponentRow();
  });

  document.addEventListener("click", (event) => {
    const removeRow = event.target.closest("[data-remove-fabric-row]");
    if (removeRow) {
      const container = $("#fabricComponentsContainer");
      if (container.children.length <= 1) {
        alert("A cutting entry needs at least one fabric.");
        return;
      }
      removeRow.closest(".fabric-component-row").remove();
      updateCuttingPreview();
    }
    const removeGarmentRow = event.target.closest("[data-remove-garment-row]");
    if (removeGarmentRow) {
      const container = $("#garmentComponentsContainer");
      if (container.children.length <= 1) {
        alert("A cutting entry needs at least one garment.");
        return;
      }
      removeGarmentRow.closest(".garment-component-row").remove();
    }
  });

  addFabricComponentRow();
  addGarmentComponentRow();

  $("#cuttingForm").commonName.addEventListener("change", (event) => {
    applySkuToForm(event.currentTarget.form, findSkuByCommonName(event.target.value));
    updateCuttingPreview();
  });

  $("#cuttingForm").sku.addEventListener("change", (event) => {
    applySkuToForm(event.currentTarget.form, findSkuByCode(event.target.value));
    updateCuttingPreview();
  });

  $("#cuttingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    clearAllInvalid(form);
    const { components, totalUsed, totalCorrection } = getCuttingCalculation();
    const fabricRows = readFabricComponentRows();

    // Every fabric row needs a resolved fabric AND a positive avg-used
    // figure — a row that saves with avg-used left blank/0 is exactly how a
    // batch ends up showing 20 pieces cut but "0 m" used and remaining
    // fabric never dropping (see cutting table: fabric consumption silently
    // never gets recorded). Both checks run together so every bad row gets
    // highlighted in one pass instead of the person hitting Save repeatedly.
    let hasInvalid = false;
    fabricRows.forEach((entry) => {
      const searchInput = entry.row.querySelector('[data-role="search"]');
      const avgInput = entry.row.querySelector('[data-role="avgUsed"]');
      if (!entry.fabric) {
        markFieldInvalid(searchInput);
        hasInvalid = true;
      }
      if (!(entry.avgFabricUsed > 0)) {
        markFieldInvalid(avgInput);
        hasInvalid = true;
      }
    });
    if (!fabricRows.length || hasInvalid) {
      alert("Every fabric row needs a valid fabric AND an average fabric used per piece greater than 0 before saving. The missing fields are highlighted in red.");
      return;
    }

    const garmentRows = readGarmentComponentRows();
    if (!garmentRows.length) {
      alert("Add at least one garment produced from this cut.");
      return;
    }
    const garments = garmentRows.map((row) => ({
      type: row.type,
      label: row.label,
      sizes: row.sizes
    }));
    const emptyGarment = garments.find((garment) => getPieces(garment.sizes) <= 0);
    if (emptyGarment) {
      const emptyRowIndex = garments.indexOf(emptyGarment);
      const emptyRowEl = $$(".garment-component-row")[emptyRowIndex];
      if (emptyRowEl) emptyRowEl.classList.add("row-invalid");
      alert(`Add at least one piece for ${labelType(emptyGarment.type)} across the size grid. The empty row is highlighted in red.`);
      return;
    }

    // Fabric stock is deducted exactly once, against the set-level totals
    // (see getSetPieces) — regardless of how many garment batches get
    // created below.
    components.forEach((entry) => {
      entry.fabric.consumed = toNumber(entry.fabric.consumed) + entry.used + entry.correction;
    });

    const rootBatchCode = makeBatchCode();
    const isMultiGarment = garments.length > 1;
    const cutGroupId = isMultiGarment ? crypto.randomUUID() : null;
    const createdAt = new Date().toISOString();
    // Splits the shared fabric figures across garment siblings in proportion
    // to how many physical pieces each one accounts for — same "prorate by
    // piece share, deduct once" principle splitBatch already uses, so a
    // Kurta+Pant set at 60 pieces each shows ~half the combined meterage on
    // each sibling's card without ever double-counting against fabric.consumed.
    const totalGarmentPieces = garments.reduce((sum, garment) => sum + getPieces(garment.sizes), 0) || 1;

    garments.forEach((garment, index) => {
      const batchCode = isMultiGarment ? `${rootBatchCode}-${letterForIndex(index + 1)}` : rootBatchCode;
      const share = getPieces(garment.sizes) / totalGarmentPieces;
      state.cuttings.push({
        id: crypto.randomUUID(),
        batchCode,
        rootCode: batchCode,
        cutGroupId,
        createdAt,
        sku: form.sku.value.trim(),
        commonName: form.commonName.value.trim(),
        entryDate: form.entryDate.value,
        garmentType: garment.type,
        garmentLabel: garment.label,
        gender: form.gender.value,
        fabricComponents: components.map((entry) => ({
          fabricCode: entry.fabricCode,
          avgFabricUsed: entry.avgFabricUsed,
          used: entry.used * share,
          correction: entry.correction * share
        })),
        correctionPercent: toNumber(form.correctionPercent.value),
        fabricUsed: totalUsed * share,
        correction: totalCorrection * share,
        sizes: garment.sizes,
        sizesRemaining: { ...garment.sizes },
        stage: "Cutting complete",
        stageHistory: []
      });
    });

    saveState();
    form.reset();
    form.correctionPercent.value = 5;
    form.entryDate.value = todayDate();
    clearFabricComponentRows();
    addFabricComponentRow();
    clearGarmentComponentRows();
    addGarmentComponentRow();
    renderAll();
  });

  $("#outsourcingForm").addEventListener("input", (event) => {
    const form = event.currentTarget;
    if (event.target.name === "sku") {
      const skuRecord = findSkuByCode(event.target.value);
      if (skuRecord) applySkuToForm(form, skuRecord);
      // Only auto-link a batch here when the operator hasn't already picked
      // one via a card's "Outsource ..." button (form.sourceCuttingId
      // already set), and only when the SKU unambiguously matches exactly
      // one still-open batch. Multiple cutting batches routinely share the
      // same SKU (same design, different cut dates/splits) — guessing
      // among them by SKU alone was silently swapping the link away from
      // whichever specific batch the operator actually meant to outsource
      // from, so the wrong batch's remaining quantity got reduced (or none
      // at all, if the picked one had no matching sizes).
      if (!form.sourceCuttingId.value) {
        const openMatches = state.cuttings.filter((item) => item.sku === form.sku.value && item.stage !== "Finished Goods");
        if (openMatches.length === 1) {
          if (!form.commonName.value) form.commonName.value = openMatches[0].commonName;
          applyCuttingSizesToOutsourcingForm(openMatches[0], form.workType.value);
        }
      }
    }
    updateOutsourcingPreview();
  });

  $("#clearSourceLink").addEventListener("click", () => {
    clearOutsourcingSourceLink();
  });

  $("#outsourcingForm").commonName.addEventListener("change", (event) => {
    applySkuToForm(event.currentTarget.form, findSkuByCommonName(event.target.value));
    updateOutsourcingPreview();
  });

  $("#outsourcingForm").sku.addEventListener("change", (event) => {
    applySkuToForm(event.currentTarget.form, findSkuByCode(event.target.value));
    updateOutsourcingPreview();
  });

  $("#outsourcingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    clearAllInvalid(form);
    const sizes = Object.fromEntries(SIZES.map(([name]) => [name, toNumber(form[name].value)]));
    // The size-wise quantity fieldset has no native `required` (each size
    // input is individually optional — only the total matters), so an entry
    // with every size left at 0 would otherwise save silently with no
    // pieces actually sent out.
    if (getPieces(sizes) <= 0) {
      const sizeGrid = form.querySelector(".size-grid:not(.accessory-grid)");
      SIZES.forEach(([name]) => markFieldInvalid(form[name]));
      if (sizeGrid) sizeGrid.classList.add("row-invalid");
      alert("Enter at least one piece across the size-wise quantity grid before saving. The empty fields are highlighted in red.");
      return;
    }
    const sourceCuttingId = form.sourceCuttingId.value || null;
    const sourceCutting = sourceCuttingId ? state.cuttings.find((item) => item.id === sourceCuttingId) : null;
    if (sourceCutting) {
      const remaining = sourceCutting.sizesRemaining || sourceCutting.sizes;
      const overage = SIZES.find(([name]) => toNumber(sizes[name]) > toNumber(remaining[name]));
      if (overage) {
        alert(`Only ${formatQty(remaining[overage[0]])} pieces of ${overage[1]} are still available in ${sourceCutting.batchCode}.`);
        return;
      }
    }
    state.outsourcing.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      workType: form.workType.value,
      vendorName: form.vendorName.value.trim(),
      sku: form.sku.value.trim(),
      commonName: form.commonName.value.trim(),
      sourceCuttingId,
      sizes,
      rate: toNumber(form.rate.value),
      deliveryDate: form.deliveryDate.value,
      pendingDeliveryDate: form.deliveryDate.value,
      receipts: [],
      accessories: {
        elastic: toNumber(form.elastic.value),
        button: toNumber(form.button.value),
        tag: toNumber(form.tag.value),
        otherAccessory: form.otherAccessory.value.trim()
      }
    });
    if (sourceCutting) {
      SIZES.forEach(([name]) => {
        sourceCutting.sizesRemaining[name] = toNumber(sourceCutting.sizesRemaining[name]) - toNumber(sizes[name]);
      });
      const nextStage = AUTO_ADVANCE_ON_FULL_OUTSOURCE[sourceCutting.stage];
      if (nextStage && getRemainingPieces(sourceCutting) <= 0) {
        sourceCutting.stageHistory = sourceCutting.stageHistory || [];
        sourceCutting.stageHistory.push(sourceCutting.stage);
        sourceCutting.stage = nextStage;
        // Arriving at a new stage always starts with the full quantity
        // available again — "remaining" tracks what hasn't been committed
        // to a vendor *at this stage*, not lifetime history.
        sourceCutting.sizesRemaining = { ...sourceCutting.sizes };
      }
    }
    saveState();
    // If the source batch still has pieces left at this stage, keep it
    // linked (refreshed to the new remaining amounts) so a second vendor
    // entry against the same leftover pieces doesn't need the card's
    // "Outsource ..." button clicked again — losing that link silently was
    // the reason a follow-up entry wouldn't reduce the batch's remaining
    // quantity at all.
    const workTypeUsed = form.workType.value;
    const keepLinked = sourceCutting && getRemainingPieces(sourceCutting) > 0;
    form.reset();
    if (keepLinked) {
      prefillOutsourcingFromCutting(sourceCutting, workTypeUsed);
    } else {
      clearOutsourcingSourceLink();
    }
    updateOutsourcingPreview();
    renderAll();
  });

  $("#moveQtySizeGrid").addEventListener("input", updateMoveQtyTotal);

  $("[data-move-qty-cancel]").addEventListener("click", () => {
    $("#moveQtyDialog").close();
  });

  $("#moveQtyForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!moveQtyTarget) return;
    const cutting = state.cuttings.find((item) => item.id === moveQtyTarget.cuttingId);
    if (!cutting) return;
    const selected = readMoveQtySizes();
    $$("[data-move-qty-size]").forEach((input) => input.classList.remove("field-invalid"));
    if (getPieces(selected) <= 0) {
      $$("[data-move-qty-size]").forEach((input) => markFieldInvalid(input));
      alert("Enter at least one piece to send forward before saving.");
      return;
    }
    const ok = moveQuantityForward(cutting, moveQtyTarget.stage, selected);
    if (!ok) return; // moveQuantityForward already alerted on invalid input
    saveState();
    $("#moveQtyDialog").close();
    renderAll();
  });

  $("#receiveQty").addEventListener("input", updateReceiveTotal);

  $("#receiveEntrySelect").addEventListener("change", (event) => {
    const entry = state.outsourcing.find((item) => item.id === event.target.value) || null;
    applyReceiveEntryToDialog(entry);
  });

  $("#addReceiptBtn").addEventListener("click", () => {
    openReceiveDialog(null);
  });

  $("[data-receive-cancel]").addEventListener("click", () => {
    $("#receiveDialog").close();
  });

  $("#receiveForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const ok = submitReceipt();
    if (!ok) return; // submitReceipt already alerted on invalid input
    saveState();
    $("#receiveDialog").close();
    renderAll();
  });

  $("#accessoryStockForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    clearAllInvalid(form);
    if (form.accessoryType.value === "other" && !form.label.value.trim()) {
      markFieldInvalid(form.label);
      alert('Please name this "Other" accessory (e.g. Lace, Dori).');
      return;
    }
    // qty has `required` + min="0" in the HTML, which lets a literal 0
    // through native validation — this catches that case explicitly.
    if (!(toNumber(form.qty.value) > 0)) {
      markFieldInvalid(form.qty);
      alert("Enter a quantity received greater than 0 before saving.");
      return;
    }
    const sku = form.sku.value.trim();
    const skuRecord = sku ? findSkuByCode(sku) : null;
    state.accessoryStock.push({
      id: crypto.randomUUID(),
      accessoryType: form.accessoryType.value,
      label: form.accessoryType.value === "other" ? form.label.value.trim() : accessoryTypeLabel(form.accessoryType.value),
      sku,
      commonName: skuRecord?.commonName || "",
      qty: toNumber(form.qty.value),
      date: form.date.value
    });
    saveState();
    form.reset();
    form.date.value = todayDate();
    renderAll();
  });

  document.addEventListener("click", (event) => {
    const deleteFabric = event.target.closest("[data-delete-fabric]");
    if (deleteFabric) {
      const id = deleteFabric.dataset.deleteFabric;
      const fabric = state.fabrics.find((item) => item.id === id);
      const used = state.cuttings.some((cutting) => (cutting.fabricComponents || []).some((c) => c.fabricCode === fabric?.code));
      if (used) {
        alert("This fabric is already used in cutting entries.");
        return;
      }
      state.fabrics = state.fabrics.filter((item) => item.id !== id);
      saveState();
      renderAll();
    }

    const deleteCutting = event.target.closest("[data-delete-cutting]");
    if (deleteCutting) {
      const id = deleteCutting.dataset.deleteCutting;
      const cutting = state.cuttings.find((item) => item.id === id);
      if (!cutting) return;
      // A batch already past "Cutting complete" may have outsourcing/
      // accessory/incoming-material entries pointing at it by SKU and
      // common name (not a hard link), so deleting it won't break those
      // records, but it does erase the batch's own trail — worth a
      // stronger warning than the plain "are you sure" a fresh cut gets.
      const advanced = cutting.stage !== "Cutting complete" || getRemainingPieces(cutting) < getPieces(cutting.sizes);
      const warning = advanced
        ? `${cutting.batchCode} (${cutting.commonName}) has already moved past Cutting complete or has pieces routed out. Deleting it removes the batch entirely and restores its fabric to stock, but any outsourcing/stage history already logged against it stays as-is. Delete anyway?`
        : `Delete cutting entry ${cutting.batchCode} (${cutting.commonName})? Its fabric usage will be restored to inventory. This can't be undone.`;
      if (!confirm(warning)) return;
      (cutting.fabricComponents || []).forEach((component) => {
        const fabric = state.fabrics.find((item) => item.code === component.fabricCode);
        if (fabric) {
          fabric.consumed = Math.max(0, toNumber(fabric.consumed) - toNumber(component.used) - toNumber(component.correction));
        }
      });
      state.cuttings = state.cuttings.filter((item) => item.id !== id);
      saveState();
      renderAll();
    }

    const moveQtyTrigger = event.target.closest("[data-move-qty]");
    if (moveQtyTrigger) {
      const cutting = state.cuttings.find((item) => item.id === moveQtyTrigger.dataset.moveQty);
      if (cutting) openMoveQtyDialog(cutting, moveQtyTrigger.dataset.targetStage, moveQtyTrigger.dataset.targetLabel);
    }

    const moveBack = event.target.closest("[data-move-back]");
    if (moveBack) {
      const cutting = state.cuttings.find((item) => item.id === moveBack.dataset.moveBack);
      if (cutting && cutting.stageHistory && cutting.stageHistory.length) {
        if (cutting.stage === "Finished Goods") {
          delete cutting.finishedGoodsDate;
        }
        cutting.stage = cutting.stageHistory.pop();
        saveState();
        renderAll();
      }
    }

    const outsourcePrefill = event.target.closest("[data-outsource-prefill]");
    if (outsourcePrefill) {
      const cutting = state.cuttings.find((item) => item.id === outsourcePrefill.dataset.outsourcePrefill);
      if (cutting) {
        switchTab("outsourcing");
        prefillOutsourcingFromCutting(cutting, outsourcePrefill.dataset.outsourceWorkType || "Stitching");
      }
    }

    const deleteOutsourcing = event.target.closest("[data-delete-outsourcing]");
    if (deleteOutsourcing) {
      state.outsourcing = state.outsourcing.filter((entry) => entry.id !== deleteOutsourcing.dataset.deleteOutsourcing);
      saveState();
      renderAll();
    }

    const logReceipt = event.target.closest("[data-log-receipt]");
    if (logReceipt) {
      const entry = state.outsourcing.find((item) => item.id === logReceipt.dataset.logReceipt);
      if (entry) openReceiveDialog(entry);
    }

    const deleteAccessoryStock = event.target.closest("[data-delete-accessory-stock]");
    if (deleteAccessoryStock) {
      state.accessoryStock = state.accessoryStock.filter((entry) => entry.id !== deleteAccessoryStock.dataset.deleteAccessoryStock);
      saveState();
      renderAll();
    }
  });

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `peekaaboo-production-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  $("#importInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      state = JSON.parse(await file.text());
      saveState();
      renderAll();
    } catch {
      alert("Could not import this file.");
    } finally {
      event.target.value = "";
    }
  });

  $("#resetBtn").addEventListener("click", () => {
    if (confirm("Clear all production tracker data from this browser?")) {
      state = structuredClone(defaultState);
      saveState();
      renderAll();
    }
  });
}

async function initApp() {
  await loadRemoteState();
  bindEvents();
  bindAutocompletes();
  renderAll();
  if ($("#fabricForm").date) $("#fabricForm").date.value = todayDate();
  if ($("#cuttingForm").entryDate) $("#cuttingForm").entryDate.value = todayDate();
  if ($("#accessoryStockForm").date) $("#accessoryStockForm").date.value = todayDate();
}

// --- Auth gating -----------------------------------------------------
// replace_relational_data (and RLS on fabrics/production_tracker_state) now
// require an authenticated session. The app must not attempt to load or
// render data until Supabase confirms a signed-in user.

let appBooted = false;

function showLoginScreen(message) {
  $("#appRoot").hidden = true;
  $("#loginScreen").hidden = false;
  $("#loginError").textContent = message || "";
}

async function showAppAfterLogin() {
  $("#loginScreen").hidden = true;
  $("#appRoot").hidden = false;
  if (!appBooted) {
    appBooted = true;
    await initApp();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const submitBtn = $("#loginSubmit");
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  submitBtn.disabled = true;
  $("#loginError").textContent = "";

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  submitBtn.disabled = false;
  if (error) {
    $("#loginError").textContent = error.message || "Sign in failed.";
  }
  // onAuthStateChange handles the transition to the app on success.
}

async function handleSignOut() {
  await supabaseClient.auth.signOut();
  appBooted = false;
  state = structuredClone(defaultState);
  showLoginScreen("");
}

async function bootWithAuth() {
  // TEMP: login disabled for local testing. Delete this block to restore
  // the Supabase auth gate (the original logic below is untouched).
  await showAppAfterLogin();
  return;

  if (!supabaseClient) {
    console.error("Supabase client not configured - check supabase-config.js.");
    showLoginScreen("App is not configured. Contact the administrator.");
    return;
  }

  $("#loginForm").addEventListener("submit", handleLoginSubmit);
  $("#signOutBtn").addEventListener("click", handleSignOut);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) {
      setTimeout(() => {
        showAppAfterLogin();
      }, 0);
    } else {
      showLoginScreen("");
    }
  });

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await showAppAfterLogin();
  } else {
    showLoginScreen("");
  }
}

bootWithAuth();