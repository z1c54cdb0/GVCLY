(function () {
  "use strict";

  var __lintFaultSurface = "FaultSurface: F1|F2|F4";
  var __lintPlayableLoop = "PlayableLoop: prepare|operate|result|retry";
  var __lintMiniSeedCount = "MiniSeedCount: 24";
  var __lintFaultFallback = "FaultFallback: default_seed";
  var PREFIX = "a02a22a71c9f_";
  var KEY_BEST = PREFIX + "spr_long_jump_best";
  var KEY_MEET_BEST = PREFIX + "spr_long_jump_meet_best";
  var KEY_META = PREFIX + "spr_long_jump_meta";
  var KEY_HUB_LAST = PREFIX + "hub_last_game";
  var KEY_TUTORIAL = PREFIX + "spr_long_jump_tutorial";
  var meetSession = { mode: "single", attempt: 0, max: 3, marks: [] };
  var BEAT_TOLERANCE_MS = 130;
  var MAX_MISSES = 2;

  var EMBEDDED_RUNS = [
    { id: 0, beatsMs: [520, 500, 480, 460, 440], boardAtMs: 2600, windowMs: 180 },
    { id: 1, beatsMs: [480, 470, 460, 450, 440], boardAtMs: 2400, windowMs: 170 },
    { id: 2, beatsMs: [560, 540, 520, 500, 480], boardAtMs: 2800, windowMs: 190 },
    { id: 3, beatsMs: [440, 430, 420, 410, 400], boardAtMs: 2200, windowMs: 160 },
    { id: 4, beatsMs: [500, 490, 480, 470, 460], boardAtMs: 2500, windowMs: 175 },
    { id: 5, beatsMs: [600, 580, 560, 540, 520], boardAtMs: 3000, windowMs: 200 },
    { id: 6, beatsMs: [460, 450, 440, 430, 420], boardAtMs: 2300, windowMs: 165 },
    { id: 7, beatsMs: [510, 500, 490, 480, 470], boardAtMs: 2550, windowMs: 180 },
    { id: 8, beatsMs: [530, 520, 510, 500, 490], boardAtMs: 2650, windowMs: 185 },
    { id: 9, beatsMs: [470, 460, 450, 440, 430], boardAtMs: 2350, windowMs: 170 },
    { id: 10, beatsMs: [490, 480, 470, 460, 450], boardAtMs: 2450, windowMs: 175 },
    { id: 11, beatsMs: [550, 530, 510, 490, 470], boardAtMs: 2750, windowMs: 190 },
    { id: 12, beatsMs: [430, 420, 410, 400, 390], boardAtMs: 2150, windowMs: 155 },
    { id: 13, beatsMs: [520, 510, 500, 490, 480], boardAtMs: 2600, windowMs: 180 },
    { id: 14, beatsMs: [580, 560, 540, 520, 500], boardAtMs: 2900, windowMs: 195 },
    { id: 15, beatsMs: [450, 440, 430, 420, 410], boardAtMs: 2250, windowMs: 165 },
    { id: 16, beatsMs: [505, 495, 485, 475, 465], boardAtMs: 2525, windowMs: 178 },
    { id: 17, beatsMs: [540, 520, 500, 480, 460], boardAtMs: 2700, windowMs: 188 },
    { id: 18, beatsMs: [465, 455, 445, 435, 425], boardAtMs: 2325, windowMs: 168 },
    { id: 19, beatsMs: [495, 485, 475, 465, 455], boardAtMs: 2475, windowMs: 172 },
    { id: 20, beatsMs: [515, 505, 495, 485, 475], boardAtMs: 2575, windowMs: 182 },
    { id: 21, beatsMs: [475, 465, 455, 445, 435], boardAtMs: 2375, windowMs: 170 },
    { id: 22, beatsMs: [525, 515, 505, 495, 485], boardAtMs: 2625, windowMs: 183 },
    { id: 23, beatsMs: [485, 475, 465, 455, 445], boardAtMs: 2425, windowMs: 174 },
  ];
  var DEFAULT_RUN = {
    id: -1,
    beatsMs: [500, 490, 480, 470, 460],
    boardAtMs: 2500,
    windowMs: 175,
  };

  var dom = {};
  var canvasCtx = null;
  var rafId = 0;
  var timers = [];

  var GameStore = {
    state: { best: null, distance: null, foul: false, phase: "prepare" },
    listeners: [],
    stDispatch: function (intent, payload) {
      if (intent === "SET_BEST") this.state.best = payload;
      if (intent === "SET_RESULT") {
        this.state.distance = payload.distance;
        this.state.foul = payload.foul;
      }
      if (intent === "SET_PHASE") this.state.phase = payload;
      this.stNotify();
    },
    stNotify: function () {
      for (var i = 0; i < this.listeners.length; i++) {
        this.listeners[i](this.state);
      }
    },
    stSubscribe: function (fn) {
      this.listeners.push(fn);
    },
    stLoadBest: function () {
      try {
        var raw = localStorage.getItem(KEY_BEST);
        if (raw !== null && Number.isFinite(Number(raw))) {
          this.state.best = Number(raw);
        }
      } catch (e) {}
    },
    stSaveBest: function (dist) {
      if (this.state.best !== null && dist <= this.state.best) return true;
      this.state.best = dist;
      try {
        localStorage.setItem(KEY_BEST, String(dist));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  var World = {
    entities: [],
    wsReset: function () {
      this.entities = [];
    },
    wsSpawnSeedEntity: function (run) {
      this.entities.push({ kind: "RunSeed", run: run });
    },
    wsGetRunSeed: function () {
      for (var i = 0; i < this.entities.length; i++) {
        if (this.entities[i].kind === "RunSeed") return this.entities[i].run;
      }
      return null;
    },
  };

  function wsBootstrapPool(index) {
    World.wsReset();
    var run = EMBEDDED_RUNS[index];
    if (!run) {
      run = DEFAULT_RUN;
    }
    World.wsSpawnSeedEntity(run);
    return run;
  }

  var JumpContext = {
    phase: "prepare",
    run: DEFAULT_RUN,
    runStart: 0,
    beatIndex: 0,
    beatDeadlines: [],
    beatErrors: [],
    missCount: 0,
    jumpDeltaMs: null,
    foul: false,
    distance: 0,
    seedIndex: 0,
  };

  function windForSeed(idx) {
    return (((idx % 7) - 3) * 1.5).toFixed(1);
  }

  function writeMeta(extra) {
    try {
      var meetBest = mkReadStorage(KEY_MEET_BEST);
      localStorage.setItem(
        KEY_META,
        JSON.stringify({
          meetBest: meetBest,
          mode: meetSession.mode,
        })
      );
      localStorage.setItem(KEY_HUB_LAST, "spr_long_jump");
    } catch (e) {}
  }

  function mkReadStorage(key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return null;
      var n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    } catch (e) {
      return null;
    }
  }

  function renderWindHud() {
    if (!dom.hudWind) return;
    var w = windForSeed(JumpContext.seedIndex);
    var att =
      meetSession.mode === "meet"
        ? meetSession.attempt + 1 + "/" + meetSession.max
        : "1/1";
    dom.hudWind.textContent = w + "% · " + att;
  }

  function dcBuildBeatDeadlines(run) {
    var t = 0;
    var list = [];
    for (var i = 0; i < run.beatsMs.length; i++) {
      t += run.beatsMs[i];
      list.push(t);
    }
    return list;
  }

  function dcPrepareScenario(seedIndex) {
    var run = wsBootstrapPool(seedIndex);
    if (!run || !run.beatsMs || !run.beatsMs.length) {
      run = DEFAULT_RUN;
      World.wsReset();
      World.wsSpawnSeedEntity(run);
      setFeedback("Using default level", false);
    }
    JumpContext.phase = "operate";
    JumpContext.run = run;
    JumpContext.runStart = 0;
    JumpContext.beatIndex = 0;
    JumpContext.beatDeadlines = dcBuildBeatDeadlines(run);
    JumpContext.beatErrors = [];
    JumpContext.missCount = 0;
    JumpContext.jumpDeltaMs = null;
    JumpContext.foul = false;
    JumpContext.distance = 0;
    JumpContext.seedIndex = seedIndex;
    GameStore.stDispatch("SET_PHASE", "operate");
    dom.phaseText.textContent = "Approach run — tap on each cue";
    dom.btnTap.disabled = false;
    dom.btnJump.disabled = true;
    dom.resultPanel.classList.add("hidden");
    dom.hudDistance.textContent = "—";
    dom.hudFoul.textContent = "Clear";
    setFeedback("", false);
    JumpContext.runStart = performance.now();
    renderWindHud();
    startLoop();
  }

  function dcRunScenarioTap(now) {
    if (JumpContext.phase !== "operate-run") return;
    if (JumpContext.beatIndex >= JumpContext.beatDeadlines.length) return;
    var target = JumpContext.runStart + JumpContext.beatDeadlines[JumpContext.beatIndex];
    var err = Math.abs(now - target);
    JumpContext.beatErrors.push(err);
    if (err > BEAT_TOLERANCE_MS) {
      JumpContext.missCount += 1;
      setFeedback("Off rhythm stride", false);
    } else {
      setFeedback("Clean stride", true);
    }
    JumpContext.beatIndex += 1;
  }

  function dcJumpScenarioTap(now) {
    if (JumpContext.phase !== "operate-jump") return;
    var sweet = JumpContext.runStart + JumpContext.run.boardAtMs;
    JumpContext.jumpDeltaMs = now - sweet;
    finishJump();
  }

  function phaseFromClock(now) {
    var elapsed = now - JumpContext.runStart;
    if (JumpContext.phase === "operate" && elapsed > 80) {
      JumpContext.phase = "operate-run";
    }
    if (JumpContext.phase === "operate-run") {
      while (
        JumpContext.beatIndex < JumpContext.beatDeadlines.length &&
        elapsed > JumpContext.beatDeadlines[JumpContext.beatIndex] + BEAT_TOLERANCE_MS
      ) {
        JumpContext.missCount += 1;
        JumpContext.beatErrors.push(BEAT_TOLERANCE_MS * 2);
        JumpContext.beatIndex += 1;
        setFeedback("Missed stride cue", false);
      }
    }
    if (
      JumpContext.phase === "operate-run" &&
      elapsed >= JumpContext.run.boardAtMs - JumpContext.run.windowMs
    ) {
      JumpContext.phase = "operate-jump";
      dom.phaseText.textContent = "Board — tap Jump in the green zone";
      dom.btnTap.disabled = true;
      dom.btnJump.disabled = false;
    }
    if (
      JumpContext.phase === "operate-jump" &&
      JumpContext.jumpDeltaMs === null &&
      elapsed > JumpContext.run.boardAtMs + JumpContext.run.windowMs * 1.5
    ) {
      JumpContext.jumpDeltaMs = JumpContext.run.windowMs * 2;
      JumpContext.foul = true;
      finishJump();
    }
  }

  function computeDistance() {
    if (JumpContext.foul || JumpContext.missCount > MAX_MISSES) {
      JumpContext.foul = true;
      return 0;
    }
    var avgErr =
      JumpContext.beatErrors.length === 0
        ? 200
        : JumpContext.beatErrors.reduce(function (a, b) {
            return a + b;
          }, 0) / JumpContext.beatErrors.length;
    var runScore = Math.max(0, 1 - avgErr / 220);
    var jumpErr = Math.abs(JumpContext.jumpDeltaMs || 999);
    if (jumpErr > JumpContext.run.windowMs) {
      JumpContext.foul = true;
      return 0;
    }
    var jumpScore = Math.max(0, 1 - jumpErr / JumpContext.run.windowMs);
    var base = 5.4 + runScore * 1.8 + jumpScore * 1.4;
    var wind = Number(windForSeed(JumpContext.seedIndex)) / 100;
    return Math.round(base * (1 + wind) * 100) / 100;
  }

  function dcResultScenario() {
    JumpContext.phase = "result";
    stopLoop();
    var dist = computeDistance();
    JumpContext.distance = dist;
    GameStore.stDispatch("SET_RESULT", { distance: dist, foul: JumpContext.foul });
    dom.hudDistance.textContent = dist.toFixed(2) + " m";
    dom.hudFoul.textContent = JumpContext.foul ? "Foul" : "Clear";
    if (!JumpContext.foul) {
      var saved = GameStore.stSaveBest(dist);
      if (!saved) setFeedback("Save unavailable — Retry", false);
    }
    if (meetSession.mode === "meet") {
      meetSession.marks.push(dist);
      meetSession.attempt += 1;
    }
    writeMeta();
    bindStoreHud();
    var meetPending =
      meetSession.mode === "meet" && meetSession.attempt < meetSession.max;
    timers.push(
      window.setTimeout(function () {
        dom.resultTitle.textContent = JumpContext.foul ? "Foul jump" : "Legal jump";
        dom.resultDetail.textContent = JumpContext.foul
          ? "No mark — check strides and board timing."
          : "Distance " + dist.toFixed(2) + " m";
        if (meetSession.mode === "meet") {
          dom.resultDetail.textContent +=
            " · Attempt " + meetSession.attempt + "/" + meetSession.max;
        }
        dom.resultPanel.classList.remove("hidden");
        dom.resultPanel.setAttribute("aria-hidden", "false");
        if (dom.btnNextAttempt) dom.btnNextAttempt.classList.toggle("hidden", !meetPending);
        if (dom.btnRetry) dom.btnRetry.classList.toggle("hidden", meetPending);
        if (!meetPending && meetSession.mode === "meet" && meetSession.marks.length) {
          var bestMark = Math.max.apply(null, meetSession.marks);
          try {
            var prev = mkReadStorage(KEY_MEET_BEST);
            if (prev === null || bestMark > Number(prev)) {
              localStorage.setItem(KEY_MEET_BEST, String(bestMark));
            }
          } catch (e) {}
          meetSession.marks = [];
          meetSession.attempt = 0;
          writeMeta();
        }
      }, 560)
    );
  }

  function finishJump() {
    dom.btnJump.disabled = true;
    dcResultScenario();
  }

  function setFeedback(msg, ok) {
    dom.feedback.textContent = msg;
    dom.feedback.className = ok ? "lj-feedback ok" : "lj-feedback";
  }

  function bindStoreHud() {
    dom.hudBest.textContent =
      GameStore.state.best === null ? "—" : GameStore.state.best.toFixed(2) + " m";
  }

  function drawTrack(now) {
    if (!canvasCtx) return;
    var w = dom.canvas.width;
    var h = dom.canvas.height;
    canvasCtx.clearRect(0, 0, w, h);
    canvasCtx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-theme-surface")
      .trim();
    canvasCtx.fillRect(0, 0, w, h);

    canvasCtx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-theme-separator")
      .trim();
    canvasCtx.fillRect(0, h * 0.55, w, 4);

    canvasCtx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-theme-warning")
      .trim();
    canvasCtx.fillRect(w * 0.62, h * 0.2, 4, h * 0.35);

    canvasCtx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-theme-accentSecondary")
      .trim();
    canvasCtx.fillRect(w * 0.62, h * 0.72, w * 0.35, h * 0.2);

    var elapsed = JumpContext.runStart ? now - JumpContext.runStart : 0;
    var progress = Math.min(1, elapsed / (JumpContext.run.boardAtMs + 400));
    var runnerX = 24 + progress * (w * 0.58);
    canvasCtx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-theme-accent")
      .trim();
    canvasCtx.beginPath();
    canvasCtx.arc(runnerX, h * 0.45, 10, 0, Math.PI * 2);
    canvasCtx.fill();

    if (JumpContext.phase === "operate-jump") {
      var sweet = JumpContext.run.boardAtMs;
      var win = JumpContext.run.windowMs;
      var inWindow =
        elapsed >= sweet - win && elapsed <= sweet + win;
      canvasCtx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue(inWindow ? "--app-theme-success" : "--app-theme-danger")
        .trim();
      canvasCtx.fillRect(w * 0.58, h * 0.12, w * 0.12, h * 0.08);
    }

    if (JumpContext.phase === "operate-run" && JumpContext.beatIndex < JumpContext.beatDeadlines.length) {
      var nextAt = JumpContext.beatDeadlines[JumpContext.beatIndex];
      var pulse = 0.5 + 0.5 * Math.sin(elapsed / 80);
      canvasCtx.globalAlpha = pulse;
      canvasCtx.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--app-theme-success")
        .trim();
      canvasCtx.fillRect(w * 0.08, h * 0.18, w * 0.12, 8);
      canvasCtx.globalAlpha = 1;
      if (Math.abs(elapsed - nextAt) < BEAT_TOLERANCE_MS) {
        canvasCtx.fillRect(w * 0.08, h * 0.28, w * 0.2, 6);
      }
    }
  }

  function loopFrame(ts) {
    phaseFromClock(ts);
    drawTrack(ts);
    rafId = window.requestAnimationFrame(loopFrame);
  }

  function startLoop() {
    stopLoop();
    rafId = window.requestAnimationFrame(loopFrame);
  }

  function stopLoop() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    timers.forEach(function (t) {
      window.clearTimeout(t);
    });
    timers = [];
  }

  function dcRetryScenario() {
    var next = (JumpContext.seedIndex + 1) % EMBEDDED_RUNS.length;
    dcPrepareScenario(next);
  }

  function bindDom() {
    dom.hudDistance = document.getElementById("hudDistance");
    dom.hudFoul = document.getElementById("hudFoul");
    dom.hudBest = document.getElementById("hudBest");
    dom.phaseText = document.getElementById("phaseText");
    dom.feedback = document.getElementById("feedback");
    dom.canvas = document.getElementById("trackCanvas");
    dom.btnTap = document.getElementById("btnTap");
    dom.btnJump = document.getElementById("btnJump");
    dom.btnRetry = document.getElementById("btnRetry");
    dom.resultPanel = document.getElementById("resultPanel");
    dom.resultTitle = document.getElementById("resultTitle");
    dom.resultDetail = document.getElementById("resultDetail");
    dom.tutorial = document.getElementById("tutorial");
    dom.btnSkipTutorial = document.getElementById("btnSkipTutorial");
    dom.hudWind = document.getElementById("hudWind");
    dom.btnNextAttempt = document.getElementById("btnNextAttempt");
    dom.btnModeSingle = document.getElementById("btnModeSingle");
    dom.btnModeMeet = document.getElementById("btnModeMeet");
    canvasCtx = dom.canvas.getContext("2d");
  }

  function wireEvents() {
    dom.btnTap.addEventListener("click", function () {
      dcRunScenarioTap(performance.now());
    });
    dom.btnJump.addEventListener("click", function () {
      dcJumpScenarioTap(performance.now());
    });
    dom.btnRetry.addEventListener("click", dcRetryScenario);
    if (dom.btnNextAttempt) {
      dom.btnNextAttempt.addEventListener("click", function () {
        dom.resultPanel.classList.add("hidden");
        dcPrepareScenario(JumpContext.seedIndex);
      });
    }
    if (dom.btnModeSingle) {
      dom.btnModeSingle.addEventListener("click", function () {
        meetSession.mode = "single";
        meetSession.attempt = 0;
        meetSession.marks = [];
        dom.btnModeSingle.classList.add("active");
        dom.btnModeMeet.classList.remove("active");
      });
    }
    if (dom.btnModeMeet) {
      dom.btnModeMeet.addEventListener("click", function () {
        meetSession.mode = "meet";
        meetSession.attempt = 0;
        meetSession.marks = [];
        dom.btnModeMeet.classList.add("active");
        dom.btnModeSingle.classList.remove("active");
      });
    }
    dom.btnSkipTutorial.addEventListener("click", hideTutorial);
    window.addEventListener("pagehide", stopLoop);
    GameStore.stSubscribe(bindStoreHud);
  }

  function hideTutorial() {
    dom.tutorial.classList.add("hidden");
    try {
      localStorage.setItem(KEY_TUTORIAL, "1");
    } catch (e) {}
  }

  function maybeTutorial() {
    try {
      if (localStorage.getItem(KEY_TUTORIAL) === "1") {
        dom.tutorial.classList.add("hidden");
      }
    } catch (e) {}
  }

  function init() {
    window.__miniTeardown = stopLoop;
    bindDom();
    GameStore.stLoadBest();
    bindStoreHud();
    wireEvents();
    maybeTutorial();
    writeMeta();
    var idx = Math.floor(Math.random() * EMBEDDED_RUNS.length);
    dcPrepareScenario(idx);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
