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

  // In Hard mode you get a limited number of tests before you must commit to an
  // identification — it forces you to read clues and choose reagents deliberately.
  const HARD_TEST_LIMIT = 5;

  const state = {
    salt: { cation: null, anion: null },
    solved: false,
    tests: 0,
    notebook: [],
    difficulty: "easy",  // "easy" | "hard"
    station: "reagent",  // "reagent" | "flame"
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
    if (testsExhausted()) return;
    const key = $("reagent-select").value;
    const reagent = REAGENTS[key];
    const reaction = lookupReaction(state.salt, key);
    state.tests++;

    setControlsDisabled(true);
    window.Lab.loadReagent(reagent.color);
    window.Lab.addReagent(reaction, () => {
      logResult(reagent, reaction);
      setControlsDisabled(false);
      updateTestGate();
    });
  }

  // ---- run a flame test --------------------------------------------------
  // Heating on a nichrome wire probes the cation only. Counts against the same
  // Hard-mode budget as a reagent test — it's one more move in the deduction.
  function runFlameTest() {
    if (!window.Lab || window.Lab.isBusy()) return;
    if (testsExhausted()) return;
    const flame = lookupFlame(state.salt);
    state.tests++;

    setControlsDisabled(true);
    window.Lab.flameTest(flame, () => {
      logFlame(flame);
      setControlsDisabled(false);
      updateTestGate();
    });
  }

  // ---- difficulty: hints (Easy) + a test budget (Hard) -------------------
  function testsExhausted() {
    return state.difficulty === "hard" && state.tests >= HARD_TEST_LIMIT;
  }

  // In Hard mode the test buttons lock once the budget is spent.
  // Always run after toggling controls so the gate wins over a blanket re-enable.
  function updateTestGate() {
    if (testsExhausted() && !window.Lab.isBusy()) {
      $("add-btn").disabled = true;
      $("flame-btn").disabled = true;
    }
    renderTestsLeft();
  }

  function renderTestsLeft() {
    const el = $("tests-left");
    if (state.difficulty !== "hard") {
      el.textContent = "";
      el.className = "tests-left";
      return;
    }
    const left = Math.max(0, HARD_TEST_LIMIT - state.tests);
    if (left === 0) {
      el.textContent = "Out of tests — make your identification.";
      el.className = "tests-left spent";
    } else {
      el.textContent = `Hard mode · ${left} test${left === 1 ? "" : "s"} left`;
      el.className = "tests-left";
    }
  }

  function readDifficulty() {
    const d = localStorage.getItem("salt-difficulty");
    return d === "hard" ? "hard" : "easy";
  }

  function setDifficulty(d, fromUser) {
    state.difficulty = d === "hard" ? "hard" : "easy";
    localStorage.setItem("salt-difficulty", state.difficulty);
    $("diff-easy").setAttribute("aria-checked", String(state.difficulty === "easy"));
    $("diff-hard").setAttribute("aria-checked", String(state.difficulty === "hard"));
    $("diff-easy").classList.toggle("active", state.difficulty === "easy");
    $("diff-hard").classList.toggle("active", state.difficulty === "hard");
    // re-apply the gate, and refresh the observe-first clue if the bench is untouched
    if (!window.Lab || !window.Lab.isBusy()) {
      $("add-btn").disabled = false;
      $("flame-btn").disabled = false;
    }
    updateTestGate();
    if (fromUser && !state.solved && state.notebook.length === 0) renderObservePrompt();
  }

  // ---- stations: switch the bench between the reagent tube and the burner --
  function setStation(name, fromUser) {
    if (fromUser && window.Lab && window.Lab.isBusy()) return; // don't switch mid-test
    state.station = name === "flame" ? "flame" : "reagent";
    const flame = state.station === "flame";
    $("station-flame").setAttribute("aria-checked", String(flame));
    $("station-reagent").setAttribute("aria-checked", String(!flame));
    $("station-flame").classList.toggle("active", flame);
    $("station-reagent").classList.toggle("active", !flame);
    $("flame-station").hidden = !flame;
    $("reagent-station").hidden = flame;
    if (window.Lab) {
      window.Lab.setStation(flame ? "flame" : "tube");
      if (flame) window.Lab.loadReagent(null);
      else loadSelectedReagent();
    }
  }

  // The opening "Observe first" panel — Easy adds the solution-colour clue.
  function renderObservePrompt() {
    const explain = $("explain");
    let body =
      "Look at the colour of the unknown solution — coloured ions leave a clue. Then run reagent tests and read each result here.";
    if (state.difficulty === "easy") {
      const clue = IONS[state.salt.cation] && IONS[state.salt.cation].clue;
      body = clue
        ? `<strong>Hint:</strong> ${clue} Run reagent tests to pin down the rest.`
        : "The solution is colourless — that already rules out the coloured ions (iron and copper). Run reagent tests to identify it.";
    }
    explain.className = "explain";
    explain.innerHTML = `<div class="explain-head">Observe first</div><p class="explain-obs">${body}</p>`;
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

  function logFlame(flame) {
    const explain = $("explain");
    if (flame) {
      explain.innerHTML = `
        <div class="explain-head">Flame test · ${cap(flame.name)}</div>
        <p class="explain-obs">${flame.observation}</p>`;
      explain.className = "explain active";
    } else {
      explain.innerHTML = `
        <div class="explain-head">Flame test · no characteristic colour</div>
        <p class="explain-obs">The flame stays its normal blue — this metal has no flame colour. A negative result still narrows it down: it rules out sodium, copper and calcium.</p>`;
      explain.className = "explain active muted";
    }
    const obs = flame
      ? `Flame test — ${flame.observation}`
      : "Flame test — no characteristic flame colour (rules out sodium, copper, calcium).";
    state.notebook.push({ reagent: "Flame test", obs });
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
      bumpScore(true, state.tests);
      const name = `${IONS[state.salt.cation].name} ${IONS[state.salt.anion].name}`;
      result.innerHTML = `✓ Correct! The unknown was <strong>${name}</strong>
        (${IONS[state.salt.cation].formula} / ${IONS[state.salt.anion].formula}),
        solved in ${state.tests} test${state.tests === 1 ? "" : "s"}.`;
      result.className = "result ok";
    } else {
      bumpScore(false, state.tests);
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
  function bumpScore(correct, tests) {
    const s = readScore();
    if (correct) {
      s.solved++;
      // record the leanest winning solve — fewest tests to a correct ID
      if (s.best === null || tests < s.best) s.best = tests;
    }
    s.attempts++;
    localStorage.setItem("salt-score", JSON.stringify(s));
    renderScore();
  }
  function readScore() {
    let s;
    try { s = JSON.parse(localStorage.getItem("salt-score")); }
    catch (_) { s = null; }
    if (!s || typeof s !== "object") s = {};
    return { solved: s.solved || 0, attempts: s.attempts || 0, best: s.best == null ? null : s.best };
  }
  function renderScore() {
    const s = readScore();
    let txt = `Solved ${s.solved} / ${s.attempts} attempts`;
    if (s.best !== null) txt += ` · best ${s.best} test${s.best === 1 ? "" : "s"}`;
    $("score").textContent = txt;
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
    $("add-btn").disabled = false;
    $("flame-btn").disabled = false;
    renderObservePrompt();
    renderNotebook();
    renderTestsLeft();
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
    $("flame-btn").disabled = d;
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
    setDifficulty(readDifficulty(), false);
    $("reagent-select").addEventListener("change", loadSelectedReagent);
    $("add-btn").addEventListener("click", runTest);
    $("fresh-btn").addEventListener("click", freshSample);
    $("flame-btn").addEventListener("click", runFlameTest);
    $("identify-form").addEventListener("submit", identify);
    $("new-btn").addEventListener("click", newChallenge);
    $("share-btn").addEventListener("click", shareChallenge);
    $("diff-easy").addEventListener("click", () => setDifficulty("easy", true));
    $("diff-hard").addEventListener("click", () => setDifficulty("hard", true));
    $("station-reagent").addEventListener("click", () => setStation("reagent", true));
    $("station-flame").addEventListener("click", () => setStation("flame", true));

    setStation("reagent", false);
    loadSalt(saltFromHash() || randomSalt(), false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
