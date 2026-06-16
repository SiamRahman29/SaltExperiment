/*
 * app.js — the analyst's workflow
 *
 * Builds the UI from the chemistry data (no hardcoded <option> lists), runs the
 * game, logs every test to a lab notebook, and explains each result. The salt is
 * encodable in the URL so you can dare a classmate to identify it.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    salt: { cation: null, anion: null },
    solved: false,
    tests: 0,
    notebook: [],
  };

  // ---- salt selection / URL seed -----------------------------------------
  const cationKeys = Object.keys(IONS).filter((k) => IONS[k].type === "cation");
  const anionKeys = Object.keys(IONS).filter((k) => IONS[k].type === "anion");

  function randomSalt() {
    return {
      cation: cationKeys[Math.floor(Math.random() * cationKeys.length)],
      anion: anionKeys[Math.floor(Math.random() * anionKeys.length)],
    };
  }

  function saltFromHash() {
    const m = /#salt=([^~]+)~(.+)/.exec(location.hash);
    if (!m) return null;
    const cation = decodeURIComponent(m[1]);
    const anion = decodeURIComponent(m[2]);
    if (IONS[cation] && IONS[anion] && IONS[cation].type === "cation" && IONS[anion].type === "anion") {
      return { cation, anion };
    }
    return null;
  }

  function hashForSalt(salt) {
    return `#salt=${encodeURIComponent(salt.cation)}~${encodeURIComponent(salt.anion)}`;
  }

  function baseColorFor(salt) {
    return (IONS[salt.cation] && IONS[salt.cation].soln) || [226, 236, 239];
  }

  // ---- build the controls from data --------------------------------------
  function buildSelects() {
    const reagentSel = $("reagent-select");
    reagentSel.innerHTML = "";
    Object.keys(REAGENTS).forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = `${REAGENTS[k].label}  ·  ${REAGENTS[k].formula}`;
      reagentSel.appendChild(o);
    });

    const catSel = $("cation-select");
    catSel.innerHTML = '<option value="">— choose cation —</option>';
    cationKeys.forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = `${IONS[k].label} (${IONS[k].formula})`;
      catSel.appendChild(o);
    });

    const anSel = $("anion-select");
    anSel.innerHTML = '<option value="">— choose anion —</option>';
    anionKeys.forEach((k) => {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = `${IONS[k].label} (${IONS[k].formula})`;
      anSel.appendChild(o);
    });
  }

  // ---- reagent dropper preview -------------------------------------------
  function loadSelectedReagent() {
    const key = $("reagent-select").value;
    if (window.Lab) window.Lab.loadReagent(REAGENTS[key].color);
  }

  // ---- run a test --------------------------------------------------------
  function runTest() {
    if (!window.Lab || window.Lab.isBusy()) return;
    const key = $("reagent-select").value;
    const reagent = REAGENTS[key];
    const reaction = lookupReaction(state.salt, key);
    state.tests++;

    setControlsDisabled(true);
    window.Lab.loadReagent(reagent.color);
    window.Lab.addReagent(reaction, () => {
      logResult(reagent, reaction);
      setControlsDisabled(false);
    });
  }

  function logResult(reagent, reaction) {
    // explain panel
    const explain = $("explain");
    if (reaction) {
      explain.innerHTML = `
        <div class="explain-head">${reaction.product ? cap(reaction.product) : "Reaction"}</div>
        <div class="explain-eq">${reaction.equation}</div>
        <p class="explain-obs">${reaction.observation}</p>`;
      explain.className = "explain active";
    } else {
      explain.innerHTML = `
        <div class="explain-head">No visible change</div>
        <p class="explain-obs">${reagent.label} doesn't react with either ion in this sample. A negative result is still information — it rules things out.</p>`;
      explain.className = "explain active muted";
    }

    // notebook
    const obs = reaction
      ? reaction.observation
      : `No visible change with ${reagent.label}.`;
    state.notebook.push({ reagent: reagent.label, obs });
    renderNotebook();
  }

  function renderNotebook() {
    const ol = $("notebook");
    if (!state.notebook.length) {
      ol.innerHTML = '<li class="empty">No tests run yet. Pick a reagent and add it to the sample.</li>';
      return;
    }
    ol.innerHTML = state.notebook
      .map(
        (e, i) => `<li><span class="nb-n">${i + 1}</span>
          <span class="nb-body"><strong>${e.reagent}</strong><br>${e.obs}</span></li>`
      )
      .join("");
    ol.scrollTop = ol.scrollHeight;
  }

  // ---- identify ----------------------------------------------------------
  function identify(ev) {
    ev.preventDefault();
    const cat = $("cation-select").value;
    const an = $("anion-select").value;
    const result = $("result");
    if (!cat || !an) {
      result.textContent = "Pick both a cation and an anion first.";
      result.className = "result warn";
      return;
    }
    const right = cat === state.salt.cation && an === state.salt.anion;
    if (right) {
      state.solved = true;
      bumpScore(true);
      const name = `${IONS[state.salt.cation].label} ${IONS[state.salt.anion].label.toLowerCase()}`;
      result.innerHTML = `✓ Correct! The unknown was <strong>${name}</strong>
        (${IONS[state.salt.cation].formula} / ${IONS[state.salt.anion].formula}),
        solved in ${state.tests} test${state.tests === 1 ? "" : "s"}.`;
      result.className = "result ok";
    } else {
      bumpScore(false);
      // partial feedback without giving it away
      const catOk = cat === state.salt.cation;
      const anOk = an === state.salt.anion;
      let hint = "Both ions are wrong.";
      if (catOk && !anOk) hint = "Cation is right, anion is wrong.";
      else if (!catOk && anOk) hint = "Anion is right, cation is wrong.";
      result.textContent = `✗ Not quite. ${hint} Run more tests and try again.`;
      result.className = "result no";
    }
  }

  // ---- score (persists across sessions) ----------------------------------
  function bumpScore(correct) {
    const s = readScore();
    if (correct) s.solved++;
    s.attempts++;
    localStorage.setItem("salt-score", JSON.stringify(s));
    renderScore();
  }
  function readScore() {
    try { return JSON.parse(localStorage.getItem("salt-score")) || { solved: 0, attempts: 0 }; }
    catch (_) { return { solved: 0, attempts: 0 }; }
  }
  function renderScore() {
    const s = readScore();
    $("score").textContent = `Solved ${s.solved} / ${s.attempts} attempts`;
  }

  // ---- session lifecycle -------------------------------------------------
  function loadSalt(salt, updateHash) {
    state.salt = salt;
    state.solved = false;
    state.tests = 0;
    state.notebook = [];
    if (updateHash) history.replaceState(null, "", hashForSalt(salt));
    if (window.Lab) window.Lab.freshSample(baseColorFor(salt));
    loadSelectedReagent();
    $("result").textContent = "";
    $("result").className = "result";
    $("explain").className = "explain";
    $("explain").innerHTML =
      '<div class="explain-head">Observe first</div><p class="explain-obs">Look at the colour of the unknown solution — coloured ions leave a clue. Then run reagent tests and read each result here.</p>';
    renderNotebook();
  }

  function newChallenge() {
    loadSalt(randomSalt(), true);
  }

  function freshSample() {
    // same unknown, clean tube (keeps your notebook)
    if (window.Lab) window.Lab.freshSample(baseColorFor(state.salt));
    loadSelectedReagent();
  }

  async function shareChallenge() {
    const url = location.origin + location.pathname + hashForSalt(state.salt);
    try {
      await navigator.clipboard.writeText(url);
      toast("Challenge link copied! Send it to a friend.");
    } catch (_) {
      toast(url, 6000);
    }
  }

  // ---- misc UI -----------------------------------------------------------
  function setControlsDisabled(d) {
    $("add-btn").disabled = d;
    $("fresh-btn").disabled = d;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  let toastTimer = null;
  function toast(msg, ms) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms || 2600);
  }

  // ---- boot --------------------------------------------------------------
  function init() {
    buildSelects();
    renderScore();
    $("reagent-select").addEventListener("change", loadSelectedReagent);
    $("add-btn").addEventListener("click", runTest);
    $("fresh-btn").addEventListener("click", freshSample);
    $("identify-form").addEventListener("submit", identify);
    $("new-btn").addEventListener("click", newChallenge);
    $("share-btn").addEventListener("click", shareChallenge);

    loadSalt(saltFromHash() || randomSalt(), false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
