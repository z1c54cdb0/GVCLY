(function () {
  "use strict";

  var __lintFaultSurface = "FaultSurface: F1|F2|F4";
  var __lintPlayableLoop = "PlayableLoop: prepare|operate|result|retry";
  var __lintMiniSeedCount = "MiniSeedCount: 24";
  var __lintFaultFallback = "FaultFallback: default_seed";
  var PREFIX = "a02a22a71c9f_";
  var KEY_BEST = PREFIX + "mus_fader_blend_best";
  var KEY_SET_BEST = PREFIX + "mus_fader_blend_set_best";
  var KEY_META = PREFIX + "mus_fader_blend_meta";
  var KEY_HUB_LAST = PREFIX + "hub_last_game";
  var KEY_TUTORIAL = PREFIX + "mus_fader_blend_tutorial";
  var GRADES = {
    pro: { great: 8, near: 16 },
    standard: { great: 10, near: 20 },
    training: { great: 14, near: 28 },
  };
  var session = {
    mode: "single",
    setSize: 5,
    setIndex: 0,
    setErrors: [],
    streak: 0,
    grade: "standard",
  };
  var EMBEDDED_SEEDS = [
    [40, 35, 25], [30, 40, 30], [25, 25, 50], [50, 30, 20], [20, 50, 30],
    [35, 20, 45], [45, 25, 30], [28, 42, 30], [33, 33, 34], [15, 35, 50],
    [55, 25, 20], [22, 38, 40], [38, 22, 40], [42, 28, 30], [26, 44, 30],
    [32, 28, 40], [48, 32, 20], [18, 32, 50], [36, 36, 28], [44, 16, 40],
    [24, 46, 30], [34, 26, 40], [29, 31, 40], [41, 29, 30],
  ];
  var DEFAULT_SEED = [33, 33, 34];

  var timers = [];
  var rafId = 0;

  var SignalBus = {
    _handlers: Object.create(null),
    on: function (evt, fn) {
      if (!this._handlers[evt]) this._handlers[evt] = [];
      this._handlers[evt].push(fn);
    },
    emit: function (evt, payload) {
      var list = this._handlers[evt] || [];
      for (var i = 0; i < list.length; i++) list[i](payload);
    },
  };

  var Blackboard = {
    facts: {
      phase: "prepare",
      target: DEFAULT_SEED.slice(),
      live: [33, 33, 34],
      lastError: null,
      seedIndex: 0,
      roundId: 0,
    },
    set: function (key, val) {
      this.facts[key] = val;
      SignalBus.emit("blackboard:patch", { key: key, val: val });
    },
    snapshot: function () {
      return {
        phase: this.facts.phase,
        target: this.facts.target.slice(),
        live: this.facts.live.slice(),
        lastError: this.facts.lastError,
        seedIndex: this.facts.seedIndex,
        roundId: this.facts.roundId,
      };
    },
  };

  var ScoreStore = {
    best: null,
    memoryBest: null,
    history: [],
    ecLoadBest: function () {
      try {
        var raw = localStorage.getItem(KEY_BEST);
        if (raw === null) return;
        var n = Number(raw);
        if (Number.isFinite(n)) {
          this.best = n;
          this.memoryBest = n;
        }
      } catch (e) {
        this.best = this.memoryBest;
      }
    },
    ecCommitBest: function (errorVal) {
      if (this.best !== null && errorVal >= this.best) return true;
      this.memoryBest = errorVal;
      this.best = errorVal;
      try {
        localStorage.setItem(KEY_BEST, String(errorVal));
        return true;
      } catch (e) {
        return false;
      }
    },
    ecPushHistory: function (entry) {
      this.history.unshift(entry);
      if (this.history.length > 5) this.history.pop();
    },
  };

  function plValidateMix(ctx) {
    var mix = ctx.candidate;
    if (!mix || mix.length !== 3) {
      ctx.error = "F1";
      return ctx;
    }
    var sum = mix[0] + mix[1] + mix[2];
    if (sum !== 100) {
      ctx.valid = false;
      return ctx;
    }
    for (var i = 0; i < 3; i++) {
      if (!Number.isFinite(mix[i]) || mix[i] < 0 || mix[i] > 100) {
        ctx.valid = false;
        return ctx;
      }
    }
    ctx.valid = true;
    return ctx;
  }

  function plLoadSeeds(ctx) {
    var list = EMBEDDED_SEEDS.slice();
    if (!list.length) {
      list = [DEFAULT_SEED.slice()];
    }
    ctx.seeds = list;
    ctx.seedCount = list.length;
    return ctx;
  }

  function plPickByIndex(ctx) {
    var idx = ctx.index;
    if (!ctx.seeds || !ctx.seeds.length) {
      ctx.target = DEFAULT_SEED.slice();
      ctx.usedFallback = true;
      return ctx;
    }
    if (idx < 0 || idx >= ctx.seeds.length) {
      ctx.target = ctx.seeds[0].slice();
      ctx.usedFallback = true;
      return ctx;
    }
    ctx.target = ctx.seeds[idx].slice();
    ctx.usedFallback = false;
    return ctx;
  }

  function plRunPipeline(index) {
    var ctx = { index: index, candidate: null };
    ctx = plLoadSeeds(ctx);
    ctx = plPickByIndex(ctx);
    ctx = plValidateMix({ candidate: ctx.target, seeds: ctx.seeds });
    if (!ctx.valid) {
      ctx.target = DEFAULT_SEED.slice();
      ctx.usedFallback = true;
    }
    return ctx;
  }

  var dom = {};

  function bindDom() {
    dom.targetMixText = document.getElementById("targetMixText");
    dom.yourMixText = document.getElementById("yourMixText");
    dom.errorBestText = document.getElementById("errorBestText");
    dom.roundLabel = document.getElementById("roundLabel");
    dom.feedback = document.getElementById("feedback");
    dom.sliderBass = document.getElementById("sliderBass");
    dom.sliderMid = document.getElementById("sliderMid");
    dom.sliderTreble = document.getElementById("sliderTreble");
    dom.outBass = document.getElementById("outBass");
    dom.outMid = document.getElementById("outMid");
    dom.outTreble = document.getElementById("outTreble");
    dom.barTargetBass = document.getElementById("barTargetBass");
    dom.barTargetMid = document.getElementById("barTargetMid");
    dom.barTargetTreble = document.getElementById("barTargetTreble");
    dom.barLiveBass = document.getElementById("barLiveBass");
    dom.barLiveMid = document.getElementById("barLiveMid");
    dom.barLiveTreble = document.getElementById("barLiveTreble");
    dom.btnSubmit = document.getElementById("btnSubmit");
    dom.btnReset = document.getElementById("btnReset");
    dom.btnRetry = document.getElementById("btnRetry");
    dom.resultPanel = document.getElementById("resultPanel");
    dom.resultTitle = document.getElementById("resultTitle");
    dom.resultDetail = document.getElementById("resultDetail");
    dom.tutorial = document.getElementById("tutorial");
    dom.btnTutorialSkip = document.getElementById("btnTutorialSkip");
    dom.skillBar = document.getElementById("skillBar");
    dom.sessionText = document.getElementById("sessionText");
    dom.btnNextRound = document.getElementById("btnNextRound");
    dom.btnModeSingle = document.getElementById("btnModeSingle");
    dom.btnModeSet = document.getElementById("btnModeSet");
    dom.selGrade = document.getElementById("selGrade");
  }

  function mixLabel(m) {
    return "B" + m[0] + " M" + m[1] + " T" + m[2];
  }

  function readLiveMix() {
    return [
      Number(dom.sliderBass.value),
      Number(dom.sliderMid.value),
      Number(dom.sliderTreble.value),
    ];
  }

  function bbNormalizeSlidersTo100() {
    var raw = readLiveMix();
    var sum = raw[0] + raw[1] + raw[2];
    if (!Number.isFinite(sum) || sum <= 0) {
      return [33, 33, 34];
    }
    var scaled = raw.map(function (v) {
      return Math.round((v / sum) * 100);
    });
    var fix = 100 - (scaled[0] + scaled[1] + scaled[2]);
    scaled[2] += fix;
    return scaled;
  }

  function clampPct(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function setBars(target, live) {
    var pairs = [
      [dom.barTargetBass, dom.barLiveBass, target[0], live[0]],
      [dom.barTargetMid, dom.barLiveMid, target[1], live[1]],
      [dom.barTargetTreble, dom.barLiveTreble, target[2], live[2]],
    ];
    pairs.forEach(function (p) {
      p[0].style.width = clampPct(p[2]) + "%";
      p[1].style.width = clampPct(p[3]) + "%";
    });
  }

  function renderHud(snap) {
    dom.targetMixText.textContent = mixLabel(snap.target);
    dom.yourMixText.textContent = mixLabel(snap.live);
    var err = snap.lastError;
    var errTxt = err === null ? "—" : String(err);
    var bestTxt =
      ScoreStore.best === null ? "—" : String(ScoreStore.best);
    dom.errorBestText.textContent = errTxt + " / " + bestTxt;
    setBars(snap.target, snap.live);
  }

  function bbSyncLiveFromSliders() {
    var live = readLiveMix();
    dom.outBass.textContent = String(live[0]);
    dom.outMid.textContent = String(live[1]);
    dom.outTreble.textContent = String(live[2]);
    Blackboard.set("live", live);
  }

  function computeError(target, live) {
    return (
      Math.abs(target[0] - live[0]) +
      Math.abs(target[1] - live[1]) +
      Math.abs(target[2] - live[2])
    );
  }

  function gradeThresholds() {
    return GRADES[session.grade] || GRADES.standard;
  }

  function feedbackForError(err) {
    var t = gradeThresholds();
    if (err <= t.great) {
      return { cls: "is-success", text: "Balanced blend!", tier: "great" };
    }
    if (err <= t.near) {
      return { cls: "is-near", text: "Close — tweak one fader", tier: "near" };
    }
    return { cls: "", text: "Too far from target", tier: "miss" };
  }

  function writeMeta() {
    try {
      localStorage.setItem(
        KEY_META,
        JSON.stringify({ streak: session.streak, mode: session.mode })
      );
      localStorage.setItem(KEY_HUB_LAST, "mus_fader_blend");
    } catch (e) {}
  }

  function renderSessionHud() {
    if (!dom.sessionText) return;
    var setTxt =
      session.mode === "set"
        ? session.setIndex + "/" + session.setSize
        : "—";
    dom.sessionText.textContent = session.streak + " · " + setTxt;
  }

  function ecPrepareRound(seedIndex) {
    var picked = plRunPipeline(seedIndex);
    if (picked.usedFallback) {
      showFeedback("Using default mix target", "");
    }
    Blackboard.set("target", picked.target);
    Blackboard.set("seedIndex", seedIndex);
    Blackboard.set("lastError", null);
    Blackboard.set("phase", "operate");
    Blackboard.set("roundId", Blackboard.facts.roundId + 1);
    var label = "Round " + Blackboard.facts.roundId;
    if (session.mode === "set") {
      label += " · Set " + (session.setIndex + 1) + "/" + session.setSize;
    }
    dom.roundLabel.textContent = label;
    renderSessionHud();
    dom.feedback.textContent = "";
    dom.feedback.className = "fb-feedback";
    dom.resultPanel.classList.add("hidden");
    dom.resultPanel.setAttribute("aria-hidden", "true");
    dom.skillBar.classList.remove("hidden");
    dom.btnSubmit.disabled = false;
    bbSyncLiveFromSliders();
    renderHud(Blackboard.snapshot());
  }

  function showFeedback(text, cls) {
    dom.feedback.textContent = text;
    dom.feedback.className = "fb-feedback" + (cls ? " " + cls : "");
  }

  function ecOperateSubmit() {
    var live = bbNormalizeSlidersTo100();
    if (!live.every(Number.isFinite)) {
      showFeedback("Check fader values", "");
      return;
    }
    Blackboard.set("live", live);
    var target = Blackboard.facts.target;
    var err = computeError(target, live);
    Blackboard.set("lastError", err);
    Blackboard.set("phase", "result");
    var fb = feedbackForError(err);
    showFeedback(fb.text, fb.cls);
    var saved = ScoreStore.ecCommitBest(err);
    if (!saved) {
      showFeedback("Save unavailable — Retry", "");
    }
    ScoreStore.ecPushHistory({ error: err, target: target.slice(), live: live.slice() });
    SignalBus.emit("score:updated", { error: err, best: ScoreStore.best });
    if (fb.tier === "great" || fb.tier === "near") session.streak += 1;
    else session.streak = 0;
    if (session.mode === "set") session.setErrors.push(err);
    writeMeta();
    renderSessionHud();
    scheduleResultCeremony(err, fb);
  }

  function scheduleResultCeremony(err, fb) {
    dom.btnSubmit.disabled = true;
    var t = window.setTimeout(function () {
      dom.resultTitle.textContent = fb.text;
      var detail =
        "Total error: " + err + (ScoreStore.best !== null ? " · Best: " + ScoreStore.best : "");
      if (session.mode === "set") {
        var avg =
          session.setErrors.reduce(function (a, b) {
            return a + b;
          }, 0) / session.setErrors.length;
        detail += " · Set avg " + avg.toFixed(1);
      }
      dom.resultDetail.textContent = detail;
      dom.resultPanel.classList.remove("hidden");
      dom.resultPanel.setAttribute("aria-hidden", "false");
      var inSet = session.mode === "set" && session.setIndex < session.setSize - 1;
      if (dom.btnNextRound) dom.btnNextRound.classList.toggle("hidden", !inSet);
      if (dom.btnRetry) dom.btnRetry.classList.toggle("hidden", inSet);
      renderHud(Blackboard.snapshot());
    }, 520);
    timers.push(t);
  }

  function finishSetIfNeeded() {
    if (session.mode !== "set" || session.setErrors.length < session.setSize) return;
    var avg =
      session.setErrors.reduce(function (a, b) {
        return a + b;
      }, 0) / session.setErrors.length;
    try {
      var prev = localStorage.getItem(KEY_SET_BEST);
      if (prev === null || avg < Number(prev)) {
        localStorage.setItem(KEY_SET_BEST, String(Math.round(avg * 10) / 10));
      }
    } catch (e) {}
    session.setIndex = 0;
    session.setErrors = [];
  }

  function ecRetryRound() {
    Blackboard.set("phase", "retry");
    finishSetIfNeeded();
    var nextIndex = (Blackboard.facts.seedIndex + 1) % EMBEDDED_SEEDS.length;
    ecPrepareRound(nextIndex);
    dom.btnRetry.classList.remove("hidden");
    if (dom.btnNextRound) dom.btnNextRound.classList.add("hidden");
  }

  function ecNextSetRound() {
    session.setIndex += 1;
    dom.resultPanel.classList.add("hidden");
    if (session.setIndex >= session.setSize) {
      finishSetIfNeeded();
      session.setIndex = 0;
      session.setErrors = [];
      showFeedback("Set complete — new set started", true);
    }
    var nextIndex = (Blackboard.facts.seedIndex + 1) % EMBEDDED_SEEDS.length;
    ecPrepareRound(nextIndex);
  }

  function applyPreset(name) {
    var mix = [33, 33, 34];
    if (name === "bass") mix = [50, 30, 20];
    if (name === "treble") mix = [20, 30, 50];
    dom.sliderBass.value = String(mix[0]);
    dom.sliderMid.value = String(mix[1]);
    dom.sliderTreble.value = String(mix[2]);
    bbSyncLiveFromSliders();
    renderHud(Blackboard.snapshot());
  }

  function stopScheduler() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    timers.forEach(function (id) {
      window.clearTimeout(id);
    });
    timers = [];
  }

  function resetSlidersNeutral() {
    dom.sliderBass.value = "33";
    dom.sliderMid.value = "33";
    dom.sliderTreble.value = "34";
    bbSyncLiveFromSliders();
    renderHud(Blackboard.snapshot());
  }

  function dismissTutorial() {
    dom.tutorial.classList.add("hidden");
    dom.tutorial.setAttribute("aria-hidden", "true");
    try {
      localStorage.setItem(KEY_TUTORIAL, "1");
    } catch (e) {}
  }

  function tutorialMaybeShow() {
    try {
      if (localStorage.getItem(KEY_TUTORIAL) === "1") {
        dismissTutorial();
        return;
      }
    } catch (e) {}
  }

  function onSliderInput() {
    bbSyncLiveFromSliders();
    renderHud(Blackboard.snapshot());
  }

  function wireEvents() {
    [dom.sliderBass, dom.sliderMid, dom.sliderTreble].forEach(function (el) {
      el.addEventListener("input", onSliderInput);
    });
    dom.btnReset.addEventListener("click", resetSlidersNeutral);
    dom.btnSubmit.addEventListener("click", ecOperateSubmit);
    dom.btnRetry.addEventListener("click", ecRetryRound);
    if (dom.btnNextRound) dom.btnNextRound.addEventListener("click", ecNextSetRound);
    dom.btnTutorialSkip.addEventListener("click", dismissTutorial);
    if (dom.btnModeSingle) {
      dom.btnModeSingle.addEventListener("click", function () {
        session.mode = "single";
        session.setIndex = 0;
        session.setErrors = [];
        dom.btnModeSingle.classList.add("active");
        dom.btnModeSet.classList.remove("active");
        renderSessionHud();
      });
    }
    if (dom.btnModeSet) {
      dom.btnModeSet.addEventListener("click", function () {
        session.mode = "set";
        session.setIndex = 0;
        session.setErrors = [];
        dom.btnModeSet.classList.add("active");
        dom.btnModeSingle.classList.remove("active");
        renderSessionHud();
      });
    }
    if (dom.selGrade) {
      dom.selGrade.addEventListener("change", function () {
        session.grade = dom.selGrade.value;
      });
    }
    document.querySelectorAll("[data-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyPreset(btn.getAttribute("data-preset"));
      });
    });
    window.addEventListener("pagehide", stopScheduler);
  }

  function init() {
    window.__miniTeardown = stopScheduler;
    bindDom();
    ScoreStore.ecLoadBest();
    writeMeta();
    wireEvents();
    tutorialMaybeShow();
    renderSessionHud();
    var startIdx = Math.floor(Math.random() * EMBEDDED_SEEDS.length);
    ecPrepareRound(startIdx);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
