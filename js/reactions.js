/*
 * reactions.js — THE CHEMISTRY SPINE
 *
 * One source of truth for all the qualitative-analysis chemistry. The old code
 * smeared this across two duplicated if/else chains inside jQuery handlers
 * (the reagent-preview colours and the reaction results). Now every ion+reagent
 * pair lives here as data, and the renderer, the explain panel, the notebook and
 * the game all read from this same table.
 *
 * Each reaction carries everything the rest of the app needs:
 *   color        [r,g,b]  the colour the solution/precipitate takes
 *   precipitate  bool     does a solid form and settle?
 *   gas          bool     does a gas bubble off?
 *   product      string   the trivial name, if any ("Prussian blue", ...)
 *   equation     string   the ionic equation, for teaching
 *   observation  string   plain-English "what you'd see and why"
 */

// ---- Ions the unknown salt can be made of -------------------------------
// `label` is the verbose dropdown text; `name` is the clean prose form used
// when the app writes a salt's name in a sentence (e.g. "iron(III) chloride").
// `clue` (coloured cations only) is the Easy-mode hint about the solution tint.
// `flame` (cations) is the flame-test result: the colour the Bunsen flame takes
// when the metal is heated on a nichrome wire, plus its prose. `flame: null`
// means the metal gives no characteristic flame colour.
const IONS = {
  // cations
  "Na+":  { label: "Sodium",            name: "sodium",     formula: "Na⁺",   type: "cation", soln: [226, 236, 239],
             flame: { color: [255, 190, 60], name: "intense golden-yellow",
               observation: "The flame blazes an intense golden-yellow — the unmistakable confirmatory flame test for sodium." } },
  "Fe2+": { label: "Ferrous (iron II)",  name: "iron(II)",  formula: "Fe²⁺", type: "cation", soln: [201, 226, 206], // very pale green
             clue: "The solution has a faint green tint — a coloured cation, think iron(II).",
             flame: null },
  "Fe3+": { label: "Ferric (iron III)",  name: "iron(III)", formula: "Fe³⁺", type: "cation", soln: [221, 201, 150], // pale yellow-brown
             clue: "The solution has a pale yellow-brown tint — a coloured cation, think iron(III).",
             flame: null },
  "Cu2+": { label: "Cupric (copper II)", name: "copper(II)", formula: "Cu²⁺", type: "cation", soln: [150, 201, 225], // pale blue
             clue: "The solution has a pale blue tint — a coloured cation, think copper(II).",
             flame: { color: [70, 205, 140], name: "green / blue-green",
               observation: "The flame turns a vivid green to blue-green — the signature flame colour of copper(II)." } },
  "Zn2+": { label: "Zinc",              name: "zinc",       formula: "Zn²⁺", type: "cation", soln: [226, 236, 239], flame: null },
  "Al3+": { label: "Aluminium",         name: "aluminium",  formula: "Al³⁺", type: "cation", soln: [226, 236, 239], flame: null },
  "NH4+": { label: "Ammonium",          name: "ammonium",   formula: "NH₄⁺", type: "cation", soln: [226, 236, 239], flame: null },
  "Ca2+": { label: "Calcium",           name: "calcium",    formula: "Ca²⁺", type: "cation", soln: [226, 236, 239],
             flame: { color: [220, 80, 48], name: "brick-red",
               observation: "The flame glows a steady brick-red — the confirmatory flame test for calcium." } },
  // anions
  "SO4":  { label: "Sulphate",  name: "sulphate",  formula: "SO₄²⁻", type: "anion" },
  "CO3":  { label: "Carbonate", name: "carbonate", formula: "CO₃²⁻", type: "anion" },
  "Cl":   { label: "Chloride",  name: "chloride",  formula: "Cl⁻",   type: "anion" },
};

// ---- Reagents on the bench ----------------------------------------------
// `color` is the reagent's own solution colour (what fills the dropper).
const REAGENTS = {
  "Pot-Ferro": { label: "Potassium Ferrocyanide",  formula: "K₄[Fe(CN)₆]", color: [243, 235, 150] },
  "Pot-Ferri": { label: "Potassium Ferricyanide",  formula: "K₃[Fe(CN)₆]", color: [214, 120, 40] },
  "Pot-Pyro":  { label: "Potassium Pyroantimonate", formula: "K₂H₂Sb₂O₇", color: [232, 240, 240] },
  "Amm-Oxa":   { label: "Ammonium Oxalate",        formula: "(NH₄)₂C₂O₄", color: [232, 240, 240] },
  "Nes-Rea":   { label: "Nessler's Reagent",       formula: "K₂[HgI₄] / KOH", color: [238, 224, 120] },
  "Sod-Hyd":   { label: "Sodium Hydroxide",        formula: "NaOH", color: [232, 240, 240] },
  "Hyd-Chl":   { label: "Dilute Hydrochloric Acid", formula: "HCl", color: [232, 240, 240] },
  "Bar-Nit":   { label: "Barium Nitrate",          formula: "Ba(NO₃)₂", color: [232, 240, 240] },
  "Sil-Nit":   { label: "Silver Nitrate",          formula: "AgNO₃", color: [232, 240, 240] },
  "Lea-Ace":   { label: "Lead Acetate",            formula: "(CH₃COO)₂Pb", color: [232, 240, 240] },
};

// ---- The reactions: REACTIONS[ion][reagent] -----------------------------
const REACTIONS = {
  // ===== CATIONS =====
  "Na+": {
    "Pot-Pyro": {
      product: "sodium pyroantimonate", color: [230, 231, 236], precipitate: true, gas: false,
      equation: "Na⁺ + H₂SbO₄⁻ → NaH₂SbO₄↓",
      observation: "A white crystalline precipitate slowly forms — the classic confirmatory test for sodium.",
    },
  },
  "Fe2+": {
    "Pot-Ferri": {
      product: "Turnbull's blue", color: [8, 32, 102], precipitate: true, gas: false,
      equation: "3Fe²⁺ + 2[Fe(CN)₆]³⁻ → Fe₃[Fe(CN)₆]₂↓",
      observation: "A deep blue precipitate (Turnbull's blue) crashes out. Iconic test for Fe²⁺.",
    },
    "Pot-Ferro": {
      product: "potassium ferrous ferrocyanide", color: [200, 215, 225], precipitate: true, gas: false,
      equation: "Fe²⁺ + [Fe(CN)₆]⁴⁻ → Fe₂[Fe(CN)₆]↓",
      observation: "A bluish-white precipitate forms that slowly darkens to blue in air.",
    },
    "Sod-Hyd": {
      product: "iron(II) hydroxide", color: [96, 132, 96], precipitate: true, gas: false,
      equation: "Fe²⁺ + 2OH⁻ → Fe(OH)₂↓",
      observation: "A dirty-green gelatinous precipitate forms (Fe(OH)₂), going brown on standing.",
    },
  },
  "Fe3+": {
    "Pot-Ferro": {
      product: "Prussian blue", color: [30, 55, 140], precipitate: true, gas: false,
      equation: "4Fe³⁺ + 3[Fe(CN)₆]⁴⁻ → Fe₄[Fe(CN)₆]₃↓",
      observation: "An intense blue precipitate (Prussian blue) forms. Iconic test for Fe³⁺.",
    },
    "Pot-Ferri": {
      product: null, color: [110, 70, 45], precipitate: false, gas: false,
      equation: "Fe³⁺ + [Fe(CN)₆]³⁻ → brown coloration",
      observation: "The solution just turns brown — no precipitate. Not a confirmatory test.",
    },
    "Sod-Hyd": {
      product: "iron(III) hydroxide", color: [142, 62, 30], precipitate: true, gas: false,
      equation: "Fe³⁺ + 3OH⁻ → Fe(OH)₃↓",
      observation: "A reddish-brown precipitate forms (Fe(OH)₃), insoluble in excess.",
    },
  },
  "Cu2+": {
    "Pot-Ferro": {
      product: "cupric ferrocyanide", color: [150, 55, 40], precipitate: true, gas: false,
      equation: "2Cu²⁺ + [Fe(CN)₆]⁴⁻ → Cu₂[Fe(CN)₆]↓",
      observation: "A chocolate / reddish-brown precipitate forms. Confirmatory test for Cu²⁺.",
    },
    "Sod-Hyd": {
      product: "copper(II) hydroxide", color: [120, 170, 220], precipitate: true, gas: false,
      equation: "Cu²⁺ + 2OH⁻ → Cu(OH)₂↓",
      observation: "A pale blue precipitate forms (Cu(OH)₂), insoluble in excess.",
    },
  },
  "Zn2+": {
    "Pot-Ferro": {
      product: "zinc ferrocyanide", color: [224, 228, 231], precipitate: true, gas: false,
      equation: "2Zn²⁺ + [Fe(CN)₆]⁴⁻ → Zn₂[Fe(CN)₆]↓",
      observation: "A bluish-white precipitate forms.",
    },
    "Sod-Hyd": {
      product: "zinc hydroxide", color: [226, 230, 233], precipitate: true, gas: false,
      equation: "Zn²⁺ + 2OH⁻ → Zn(OH)₂↓  (soluble in excess)",
      observation: "A white precipitate forms that dissolves in excess alkali — amphoteric Zn(OH)₂.",
    },
  },
  "Al3+": {
    "Sod-Hyd": {
      product: "aluminium hydroxide", color: [228, 231, 233], precipitate: true, gas: false,
      equation: "Al³⁺ + 3OH⁻ → Al(OH)₃↓  (soluble in excess)",
      observation: "A white gelatinous precipitate forms that dissolves in excess alkali — amphoteric Al(OH)₃.",
    },
  },
  "NH4+": {
    "Nes-Rea": {
      product: "Nessler's brown", color: [110, 60, 30], precipitate: true, gas: false,
      equation: "NH₄⁺ + 2[HgI₄]²⁻ + 4OH⁻ → brown ppt",
      observation: "A brown precipitate (or brown colour) appears. Confirmatory test for ammonium.",
    },
    "Sod-Hyd": {
      product: "ammonia gas", color: [226, 236, 239], precipitate: false, gas: true,
      equation: "NH₄⁺ + OH⁻ → NH₃↑ + H₂O",
      observation: "No precipitate, but a pungent gas (ammonia) is given off on warming — turns red litmus blue.",
    },
  },
  "Ca2+": {
    "Amm-Oxa": {
      product: "calcium oxalate", color: [230, 232, 235], precipitate: true, gas: false,
      equation: "Ca²⁺ + C₂O₄²⁻ → CaC₂O₄↓",
      observation: "A white precipitate forms (calcium oxalate), insoluble in acetic acid.",
    },
  },

  // ===== ANIONS =====
  "SO4": {
    "Bar-Nit": {
      product: "barium sulphate", color: [235, 237, 240], precipitate: true, gas: false,
      equation: "SO₄²⁻ + Ba²⁺ → BaSO₄↓",
      observation: "A dense white precipitate forms that is insoluble in dilute acid. Confirms sulphate.",
    },
    "Lea-Ace": {
      product: "lead sulphate", color: [235, 237, 240], precipitate: true, gas: false,
      equation: "SO₄²⁻ + Pb²⁺ → PbSO₄↓",
      observation: "A white precipitate of lead sulphate forms.",
    },
  },
  "Cl": {
    "Sil-Nit": {
      product: "silver chloride", color: [240, 241, 243], precipitate: true, gas: false,
      equation: "Cl⁻ + Ag⁺ → AgCl↓",
      observation: "A white curdy precipitate forms that darkens in light. Confirms chloride.",
    },
    "Lea-Ace": {
      product: "lead chloride", color: [240, 241, 243], precipitate: true, gas: false,
      equation: "2Cl⁻ + Pb²⁺ → PbCl₂↓",
      observation: "A white precipitate of lead chloride forms (soluble in hot water).",
    },
  },
  "CO3": {
    "Hyd-Chl": {
      product: "carbon dioxide", color: [226, 236, 239], precipitate: false, gas: true,
      equation: "CO₃²⁻ + 2H⁺ → H₂O + CO₂↑",
      observation: "Brisk effervescence — a colourless gas bubbles off (CO₂) that turns limewater milky. Confirms carbonate.",
    },
    "Bar-Nit": {
      product: "barium carbonate", color: [235, 237, 240], precipitate: true, gas: false,
      equation: "CO₃²⁻ + Ba²⁺ → BaCO₃↓",
      observation: "A white precipitate forms that, unlike BaSO₄, dissolves in dilute acid with fizzing.",
    },
    "Sil-Nit": {
      product: "silver carbonate", color: [240, 238, 224], precipitate: true, gas: false,
      equation: "CO₃²⁻ + 2Ag⁺ → Ag₂CO₃↓",
      observation: "A pale yellowish-white precipitate of silver carbonate forms.",
    },
  },
};

/*
 * The engine. Given the unknown salt {cation, anion} and a reagent key, return
 * the reaction that fires (cation takes priority), or null for no visible change.
 * This single function replaces the old salt.includes(...) && salt.includes(...)
 * chains entirely.
 */
function lookupReaction(salt, reagentKey) {
  const byCation = REACTIONS[salt.cation] && REACTIONS[salt.cation][reagentKey];
  if (byCation) return Object.assign({ via: salt.cation }, byCation);
  const byAnion = REACTIONS[salt.anion] && REACTIONS[salt.anion][reagentKey];
  if (byAnion) return Object.assign({ via: salt.anion }, byAnion);
  return null;
}

/*
 * The flame-test engine. Heating a salt on a nichrome wire probes the *cation*
 * only. Returns the cation's flame entry ({color, name, observation}) or null
 * when the metal gives no characteristic flame colour — a result that is still
 * diagnostic (it rules out sodium, copper and calcium).
 */
function lookupFlame(salt) {
  const cation = IONS[salt.cation];
  return (cation && cation.flame) || null;
}

// expose as globals (no build step / no modules — keeps file:// + GH Pages happy)
window.IONS = IONS;
window.REAGENTS = REAGENTS;
window.REACTIONS = REACTIONS;
window.lookupReaction = lookupReaction;
window.lookupFlame = lookupFlame;
