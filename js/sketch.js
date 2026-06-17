/*
 * sketch.js — the lab bench renderer (p5.js, instance mode)
 *
 * p5 is the maintained successor to ProcessingJS, so the draw()/fill()/rect()
 * model from the original carries straight over — just alive, and animated.
 *
 * The sketch is dumb: it renders whatever is in SimState and runs the animation
 * clock. app.js drives it through the window.Lab API at the bottom of this file.
 */

const SimState = {
  baseColor: [226, 236, 239], // fresh unknown solution
  liquidColor: [226, 236, 239],
  reagentColor: null,         // colour loaded in the dropper
  reaction: null,             // current reaction object (or null = no change)
  phase: "idle",              // idle | pouring | reacting | done
  phaseStart: 0,
  particles: [],              // precipitate specks
  bubbles: [],                // gas bubbles
  onDone: null,               // callback fired once when a reaction finishes
  flash: 0,                   // brief glow when a reaction completes
  // ---- flame station ----
  station: "tube",            // "tube" (reagent bench) | "flame" (Bunsen burner)
  flameColor: null,           // characteristic colour while a wire is in the flame
  flamePhase: "idle",         // idle | testing
  flameStart: 0,
  flameOnDone: null,
};

const POUR_MS = 900;
const REACT_MS = 2200;
const FLAME_MS = 2800;

const sketch = (p) => {
  // logical canvas; CSS scales it down responsively
  const W = 920, H = 560;

  // sample-tube geometry
  const TUBE = { cx: 360, top: 120, w: 86, h: 310 };
  const wallpad = 7;
  const liquidTop = () => TUBE.top + TUBE.h * 0.40;
  const liquidBottom = () => TUBE.top + TUBE.h - wallpad - 4;

  // Bunsen-burner geometry for the flame station. Shares the tube's column so
  // the two stations read as the same bench seen from different tools.
  const BURNER = { cx: 360, baseY: H - 96, barrelTop: H - 96 - 150, barrelW: 16 };

  p.setup = () => {
    const c = p.createCanvas(W, H);
    c.parent("stage");
    p.frameRate(60);
    SimState.liquidColor = SimState.baseColor.slice();
  };

  p.draw = () => {
    drawBench();
    if (SimState.station === "flame") {
      advanceFlame();
      drawFlameStation();
    } else {
      advance();
      drawSampleTube();
      drawDropper();
    }
    drawCaption();
  };

  // ---- background lab bench ------------------------------------------------
  function drawBench() {
    // cool dark wall, lighter near top
    for (let y = 0; y < H; y++) {
      const t = y / H;
      const r = p.lerp(16, 30, t), g = p.lerp(42, 70, t), b = p.lerp(54, 92, t);
      p.stroke(r, g, b);
      p.line(0, y, W, y);
    }
    // bench surface
    p.noStroke();
    p.fill(34, 52, 58);
    p.rect(0, H - 96, W, 96);
    p.fill(44, 66, 74);
    p.rect(0, H - 96, W, 10);
    // soft pool of light behind the tube
    p.push();
    p.noStroke();
    for (let i = 6; i > 0; i--) {
      p.fill(120, 200, 210, 5);
      p.ellipse(TUBE.cx, TUBE.top + TUBE.h * 0.55, 240 + i * 26, 360 + i * 26);
    }
    p.pop();
  }

  // ---- the sample test tube ------------------------------------------------
  function drawSampleTube() {
    const { cx, top, w, h } = TUBE;
    const x = cx - w / 2;
    const r = w / 2;

    // liquid first (clipped visually by drawing inside the glass footprint)
    const lt = liquidTop();
    const lh = top + h - lt - wallpad;
    p.noStroke();
    const lc = SimState.liquidColor;
    p.fill(lc[0], lc[1], lc[2], 235);
    p.rect(x + wallpad, lt, w - wallpad * 2, lh, 0, 0, r - wallpad, r - wallpad);

    // suspended precipitate + settled sediment
    drawParticles();
    // rising gas bubbles
    drawBubbles();

    // meniscus highlight
    p.noFill();
    p.stroke(255, 255, 255, 60);
    p.strokeWeight(2);
    p.line(x + wallpad + 2, lt + 2, x + w - wallpad - 2, lt + 2);

    // glass body
    p.noFill();
    p.stroke(220, 240, 245, 180);
    p.strokeWeight(3);
    p.rect(x, top, w, h, 6, 6, r, r);
    // glass highlight stripe
    p.noStroke();
    p.fill(255, 255, 255, 38);
    p.rect(x + 10, top + 14, 10, h - 60, 6);
    // lip
    p.fill(210, 232, 238, 150);
    p.rect(x - 5, top - 6, w + 10, 10, 4);

    // completion glow
    if (SimState.flash > 0) {
      p.noFill();
      p.stroke(255, 255, 255, SimState.flash * 120);
      p.strokeWeight(6);
      p.rect(x - 3, top - 3, w + 6, h + 6, 8, 8, r + 4, r + 4);
      SimState.flash = Math.max(0, SimState.flash - 0.02);
    }
  }

  function drawParticles() {
    p.noStroke();
    for (const pt of SimState.particles) {
      p.fill(pt.c[0], pt.c[1], pt.c[2], pt.a);
      p.ellipse(pt.x, pt.y, pt.s, pt.s);
    }
  }

  function drawBubbles() {
    p.noFill();
    for (const b of SimState.bubbles) {
      p.stroke(255, 255, 255, b.a);
      p.strokeWeight(1.4);
      p.ellipse(b.x, b.y, b.s, b.s);
    }
  }

  // ---- the dropper / pipette ----------------------------------------------
  function drawDropper() {
    const pouring = SimState.phase === "pouring";
    // resting position to the right, swings over the tube while pouring
    const restX = 620, overX = TUBE.cx;
    let dropX = restX, tipY = 90;
    if (pouring) {
      const t = clamp((p.millis() - SimState.phaseStart) / 250, 0, 1);
      dropX = p.lerp(restX, overX, easeOut(t));
    }
    if (SimState.reagentColor === null && !pouring) return;

    p.push();
    p.translate(dropX, 0);
    // rubber bulb
    p.noStroke();
    p.fill(60, 80, 86);
    p.rect(-12, 24, 24, 30, 8);
    // glass barrel
    p.fill(225, 240, 244, 120);
    p.stroke(220, 240, 245, 150);
    p.strokeWeight(2);
    p.rect(-7, 50, 14, 46, 4);
    // reagent inside barrel
    if (SimState.reagentColor) {
      const rc = SimState.reagentColor;
      p.noStroke();
      p.fill(rc[0], rc[1], rc[2], 230);
      p.rect(-5, 60, 10, 34, 3);
    }
    // tip
    p.fill(220, 240, 245, 150);
    p.noStroke();
    p.triangle(-4, 96, 4, 96, 0, tipY + 16);
    p.pop();

    // falling drops while pouring
    if (pouring) {
      const elapsed = p.millis() - SimState.phaseStart;
      if (elapsed > 250 && SimState.reagentColor) {
        const rc = SimState.reagentColor;
        const cycle = (elapsed - 250) % 220;
        const dy = p.map(cycle, 0, 220, 110, liquidTop() - 4);
        p.noStroke();
        p.fill(rc[0], rc[1], rc[2], 240);
        p.ellipse(TUBE.cx, dy, 7, 10);
      }
    }
  }

  // ---- caption under the tube ---------------------------------------------
  function drawCaption() {
    p.noStroke();
    p.fill(190, 214, 220);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(15);
    let msg = "Unknown sample";
    if (SimState.station === "flame") {
      msg = SimState.flamePhase === "testing" ? "Heating in the flame…" : "Flame test — dip the wire and heat";
    } else if (SimState.phase === "pouring") {
      msg = "Adding reagent…";
    } else if (SimState.phase === "reacting") {
      msg = "Reacting…";
    }
    p.text(msg, TUBE.cx, TUBE.top + TUBE.h + 26);
  }

  // ---- animation clock -----------------------------------------------------
  function advance() {
    const now = p.millis();
    const since = now - SimState.phaseStart;

    if (SimState.phase === "pouring" && since >= POUR_MS) {
      startReacting();
    } else if (SimState.phase === "reacting") {
      stepReaction(since);
      if (since >= REACT_MS) finishReaction();
    }

    // physics always tick
    stepParticles();
    stepBubbles();
  }

  function startReacting() {
    SimState.phase = "reacting";
    SimState.phaseStart = p.millis();
    const rx = SimState.reaction;
    if (rx && rx.precipitate) seedPrecipitate(rx.color);
  }

  function stepReaction(since) {
    const rx = SimState.reaction;
    if (!rx) return;
    const t = clamp(since / REACT_MS, 0, 1);
    // colour change: precipitate clouds the liquid, colour-only reactions tween it
    if (rx.precipitate || (!rx.gas && rx.color)) {
      SimState.liquidColor = lerpRGB(SimState.baseColor, rx.color, t * 0.92);
    }
    // keep bubbling for gas reactions (taper off near the end)
    if (rx.gas && since % 90 < 18 && Math.random() < 0.9) {
      spawnBubble(1 - t * 0.6);
    }
  }

  function finishReaction() {
    SimState.phase = "done";
    SimState.flash = 1;
    if (typeof SimState.onDone === "function") {
      const cb = SimState.onDone;
      SimState.onDone = null;
      cb();
    }
  }

  // ---- precipitate particles ----------------------------------------------
  function seedPrecipitate(color) {
    const lt = liquidTop(), lb = liquidBottom();
    const n = 150;
    for (let i = 0; i < n; i++) {
      const x = TUBE.cx + p.random(-TUBE.w / 2 + 12, TUBE.w / 2 - 12);
      const y = p.random(lt + 6, lb - 6);
      SimState.particles.push({
        x, y,
        targetX: TUBE.cx + p.random(-TUBE.w / 2 + 14, TUBE.w / 2 - 14),
        targetY: lb - p.random(0, 34),  // heap at the bottom
        s: p.random(2.5, 5),
        c: color,
        a: 0,
        v: p.random(0.3, 0.7),          // starting fall speed (then accelerates)
        drift: p.random(p.TWO_PI),      // phase for the lazy sideways sway
        wobble: 0,                      // settle shudder, decays to rest
        settled: false,
      });
    }
  }

  function stepParticles() {
    for (const pt of SimState.particles) {
      if (pt.a < 220) pt.a += 6;            // fade in
      if (!pt.settled) {
        const dist = pt.targetY - pt.y;
        pt.v += 0.045;                       // gentle gravity, so the fall accelerates
        // decelerate into the heap: cap the step as the particle nears its rest spot
        const step = Math.min(pt.v, Math.max(0.35, dist * 0.14));
        pt.y += step;
        // lazy sideways sway while sinking, plus a pull toward the target column
        pt.x += (pt.targetX - pt.x) * 0.03 + Math.sin((p.frameCount + pt.drift * 9) * 0.06) * 0.25;
        if (dist <= 0.8) {
          pt.y = pt.targetY;
          pt.settled = true;
          pt.wobble = p.random(0.6, 1.4);    // little shudder as it lands in the sediment
        }
      } else if (pt.wobble > 0.01) {
        // brief settle shudder that decays — reads like specks jostling into the heap
        pt.y = pt.targetY + Math.sin(p.frameCount * 0.5 + pt.drift) * pt.wobble;
        pt.wobble *= 0.88;
      }
    }
  }

  // ---- gas bubbles ---------------------------------------------------------
  function spawnBubble(rate) {
    const lt = liquidTop(), lb = liquidBottom();
    if (Math.random() > rate) return;
    SimState.bubbles.push({
      x: TUBE.cx + p.random(-TUBE.w / 2 + 14, TUBE.w / 2 - 14),
      y: lb - p.random(0, 8),
      top: lt,
      s: p.random(4, 11),
      a: 200,
      vy: p.random(1.2, 2.4),
      phase: p.random(p.TWO_PI),
    });
  }

  function stepBubbles() {
    for (let i = SimState.bubbles.length - 1; i >= 0; i--) {
      const b = SimState.bubbles[i];
      b.y -= b.vy;
      b.x += Math.sin((p.frameCount + b.phase * 10) * 0.08) * 0.6;
      if (b.y <= b.top + 2) { b.a -= 28; }   // pop at the surface
      if (b.a <= 0) SimState.bubbles.splice(i, 1);
    }
  }

  // ---- flame station: Bunsen burner + nichrome wire -----------------------
  function advanceFlame() {
    if (SimState.flamePhase === "testing" && p.millis() - SimState.flameStart >= FLAME_MS) {
      finishFlame();
    }
  }

  function finishFlame() {
    SimState.flamePhase = "idle";
    SimState.flameColor = null;   // wire lifts out — flame returns to plain blue
    SimState.flash = 1;
    if (typeof SimState.flameOnDone === "function") {
      const cb = SimState.flameOnDone;
      SimState.flameOnDone = null;
      cb();
    }
  }

  function drawFlameStation() {
    const cx = BURNER.cx;
    const baseY = BURNER.baseY;

    // burner: weighted foot, slim barrel, collar
    p.noStroke();
    p.fill(30, 44, 50);
    p.ellipse(cx, baseY - 2, 120, 22);
    p.fill(46, 62, 70);
    p.rect(cx - BURNER.barrelW / 2, BURNER.barrelTop, BURNER.barrelW, baseY - BURNER.barrelTop - 6, 3);
    p.fill(70, 88, 96);
    p.rect(cx - BURNER.barrelW / 2 - 3, BURNER.barrelTop - 5, BURNER.barrelW + 6, 9, 2); // collar
    // air-hole shadow on the collar
    p.fill(20, 30, 34);
    p.ellipse(cx, BURNER.barrelTop - 1, 5, 5);

    // is the wire (and its glowing salt) in the flame right now?
    const testing = SimState.flamePhase === "testing";
    const t = testing ? clamp((p.millis() - SimState.flameStart) / FLAME_MS, 0, 1) : 0;
    // characteristic colour eases in, holds, eases back out over the test
    const tint = testing ? Math.sin(Math.min(t / 0.18, 1) * (Math.PI / 2)) * (t > 0.85 ? (1 - t) / 0.15 : 1) : 0;

    drawFlame(cx, BURNER.barrelTop - 2, SimState.flameColor, clamp(tint, 0, 1));

    if (testing) drawWire(cx, BURNER.barrelTop - 2);
  }

  // A layered, flickering flame. Plain roaring-Bunsen blue by default; `mix`
  // (0..1) blends in the characteristic salt colour `tintCol`.
  function drawFlame(cx, baseY, tintCol, mix) {
    const blue = [110, 165, 235];
    const outer = tintCol ? lerpRGB(blue, tintCol, mix) : blue;
    const baseH = 132 + mix * 46;        // the flame leaps taller when it colours up
    const fc = p.frameCount;

    p.push();
    p.noStroke();
    p.blendMode(p.SCREEN);   // flames are emissive — add light rather than paint over

    // soft halo of light around the flame
    const halo = tintCol ? lerpRGB([60, 110, 200], tintCol, mix) : [60, 110, 200];
    for (let i = 4; i > 0; i--) {
      p.fill(halo[0], halo[1], halo[2], 10);
      p.ellipse(cx, baseY - baseH * 0.45, 70 + i * 22, baseH + i * 26);
    }

    // three nested flame bodies: broad outer, mid, bright inner cone
    flameBody(cx, baseY, baseH, 46, outer, 120, fc * 0.06, 1.0);
    flameBody(cx, baseY, baseH * 0.74, 30, lerpRGB(outer, [240, 245, 255], 0.35), 150, fc * 0.08 + 11, 1.3);
    // inner cone keeps a hot blue-white heart even when the flame is coloured
    flameBody(cx, baseY, baseH * 0.42, 16, [180, 215, 255], 190, fc * 0.11 + 23, 1.6);
    p.pop();
  }

  // One flame teardrop, flickering via sine wobble on its tip and waist.
  function flameBody(cx, baseY, h, w, col, alpha, seed, flick) {
    const tip = Math.sin(seed) * 8 * flick + Math.sin(seed * 1.7) * 4;
    const lean = Math.sin(seed * 0.5) * 5;
    const hv = h + Math.sin(seed * 0.9) * 10 * flick;
    p.fill(col[0], col[1], col[2], alpha);
    p.beginShape();
    p.vertex(cx - w / 2, baseY);
    p.bezierVertex(cx - w / 2 - 3, baseY - hv * 0.4,
                   cx - w * 0.36 + lean, baseY - hv * 0.78,
                   cx + tip, baseY - hv);
    p.bezierVertex(cx + w * 0.36 + lean, baseY - hv * 0.78,
                   cx + w / 2 + 3, baseY - hv * 0.4,
                   cx + w / 2, baseY);
    p.endShape(p.CLOSE);
  }

  // The nichrome wire on its handle, dipping in from the upper right with a
  // glowing bead of sample at the loop, held in the hottest part of the flame.
  function drawWire(cx, flameBaseY) {
    const tipX = cx, tipY = flameBaseY - 70;   // loop sits in the flame's hot zone
    const handleX = cx + 150, handleY = 70;
    p.push();
    // insulated handle
    p.stroke(40, 30, 26);
    p.strokeWeight(9);
    p.line(handleX, handleY, handleX - 28, handleY + 26);
    // the wire, bending down into the flame
    p.noFill();
    p.stroke(150, 150, 160);
    p.strokeWeight(2.2);
    p.beginShape();
    p.vertex(handleX - 28, handleY + 26);
    p.bezierVertex(handleX - 80, handleY + 40, tipX + 70, tipY - 40, tipX, tipY);
    p.endShape();
    // glowing bead of salt at the loop
    p.noStroke();
    const glow = SimState.flameColor || [255, 160, 90];
    p.blendMode(p.SCREEN);
    p.fill(glow[0], glow[1], glow[2], 200);
    p.ellipse(tipX, tipY, 9, 9);
    p.fill(255, 240, 220, 150);
    p.ellipse(tipX, tipY, 4, 4);
    p.pop();
  }

  // ---- small helpers -------------------------------------------------------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function lerpRGB(a, b, t) {
    return [
      Math.round(p.lerp(a[0], b[0], t)),
      Math.round(p.lerp(a[1], b[1], t)),
      Math.round(p.lerp(a[2], b[2], t)),
    ];
  }

  // ===== public API (driven by app.js) =====================================
  window.Lab = {
    setBaseColor(rgb) {
      SimState.baseColor = rgb.slice();
      SimState.liquidColor = rgb.slice();
    },
    loadReagent(rgb) {
      SimState.reagentColor = rgb ? rgb.slice() : null;
    },
    // run a test: pour, then react. `reaction` may be null (no visible change).
    addReagent(reaction, onDone) {
      SimState.reaction = reaction;
      SimState.onDone = onDone;
      SimState.phase = "pouring";
      SimState.phaseStart = p.millis();
    },
    // switch the bench between the reagent tube and the Bunsen burner
    setStation(name) {
      SimState.station = name === "flame" ? "flame" : "tube";
      SimState.flash = 0;
    },
    // run a flame test: heat the sample on a nichrome wire. `flame` may be null
    // (no characteristic colour — the flame just stays blue).
    flameTest(flame, onDone) {
      SimState.flameColor = flame ? flame.color.slice() : null;
      SimState.flameOnDone = onDone;
      SimState.flamePhase = "testing";
      SimState.flameStart = p.millis();
    },
    // wipe back to a clean unknown
    freshSample(rgb) {
      SimState.baseColor = rgb.slice();
      SimState.liquidColor = rgb.slice();
      SimState.particles = [];
      SimState.bubbles = [];
      SimState.reaction = null;
      SimState.phase = "idle";
      SimState.flameColor = null;
      SimState.flamePhase = "idle";
      SimState.flash = 0;
    },
    isBusy() {
      return SimState.phase === "pouring" || SimState.phase === "reacting" ||
             SimState.flamePhase === "testing";
    },
  };
};

// boot the sketch
new p5(sketch);
