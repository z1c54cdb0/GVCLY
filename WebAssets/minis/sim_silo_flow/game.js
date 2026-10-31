(function () {
  "use strict";

  var __lintFaultSurface = "FaultSurface: F1|F2|F4";
  var __lintPlayableLoop = "PlayableLoop: prepare|operate|result|retry";
  var __lintMiniSeedCount = "MiniSeedCount: 24";
  var __lintFaultFallback = "FaultFallback: default_seed";
  var PREFIX = "a02a22a71c9f_";
  var KEY_BEST = PREFIX + "sim_silo_flow_best";
  var KEY_SHIPPED = PREFIX + "sim_silo_flow_shipped";
  var KEY_META = PREFIX + "sim_silo_flow_meta";
  var KEY_HUB_LAST = PREFIX + "hub_last_game";
  var KEY_TUTORIAL = PREFIX + "sim_silo_flow_tutorial";
  var careerShipped = 0;
  var STOCK_MIN = 0;
  var STOCK_MAX = 100;
  var STARVE_LIMIT_SEC = 3.2;
  var TICK_MS = 120;

  var DAY_SEEDS = [
    { id: 0, inflow: 4.2, outOpen: 6.5, outClosed: 0.4, demand: 2.8, durationSec: 28 },
    { id: 1, inflow: 3.6, outOpen: 5.8, outClosed: 0.3, demand: 2.5, durationSec: 30 },
    { id: 2, inflow: 5.0, outOpen: 7.2, outClosed: 0.5, demand: 3.2, durationSec: 26 },
    { id: 3, inflow: 3.2, outOpen: 5.2, outClosed: 0.2, demand: 2.2, durationSec: 32 },
    { id: 4, inflow: 4.8, outOpen: 6.8, outClosed: 0.4, demand: 3.0, durationSec: 27 },
    { id: 5, inflow: 3.9, outOpen: 6.0, outClosed: 0.35, demand: 2.6, durationSec: 29 },
    { id: 6, inflow: 5.4, outOpen: 7.5, outClosed: 0.55, demand: 3.4, durationSec: 25 },
    { id: 7, inflow: 3.4, outOpen: 5.4, outClosed: 0.25, demand: 2.3, durationSec: 31 },
    { id: 8, inflow: 4.5, outOpen: 6.6, outClosed: 0.45, demand: 2.9, durationSec: 28 },
    { id: 9, inflow: 3.7, outOpen: 5.9, outClosed: 0.3, demand: 2.4, durationSec: 30 },
    { id: 10, inflow: 5.2, outOpen: 7.0, outClosed: 0.5, demand: 3.1, durationSec: 26 },
    { id: 11, inflow: 3.3, outOpen: 5.3, outClosed: 0.2, demand: 2.1, durationSec: 33 },
    { id: 12, inflow: 4.6, outOpen: 6.7, outClosed: 0.42, demand: 2.85, durationSec: 28 },
    { id: 13, inflow: 3.8, outOpen: 6.1, outClosed: 0.32, demand: 2.55, durationSec: 29 },
    { id: 14, inflow: 5.1, outOpen: 7.3, outClosed: 0.48, demand: 3.15, durationSec: 27 },
    { id: 15, inflow: 3.5, outOpen: 5.5, outClosed: 0.28, demand: 2.35, durationSec: 30 },
    { id: 16, inflow: 4.4, outOpen: 6.4, outClosed: 0.38, demand: 2.75, durationSec: 28 },
    { id: 17, inflow: 4.9, outOpen: 6.9, outClosed: 0.46, demand: 3.05, durationSec: 27 },
    { id: 18, inflow: 3.1, outOpen: 5.1, outClosed: 0.22, demand: 2.0, durationSec: 34 },
    { id: 19, inflow: 4.0, outOpen: 6.2, outClosed: 0.36, demand: 2.65, durationSec: 29 },
    { id: 20, inflow: 5.3, outOpen: 7.4, outClosed: 0.52, demand: 3.25, durationSec: 26 },
    { id: 21, inflow: 3.65, outOpen: 5.7, outClosed: 0.3, demand: 2.45, durationSec: 31 },
    { id: 22, inflow: 4.7, outOpen: 6.75, outClosed: 0.44, demand: 2.95, durationSec: 28 },
    { id: 23, inflow: 4.1, outOpen: 6.3, outClosed: 0.34, demand: 2.7, durationSec: 30 },
  ];
  var DEFAULT_DAY = {
    id: -1,
    inflow: 4.0,
    outOpen: 6.0,
    outClosed: 0.35,
    demand: 2.6,
    durationSec: 28,
  };

  var dom = {};
  var tickId = 0;
  var timers = [];

  var World = {
    entities: [],
    wsClear: function () {
      this.entities = [];
    },
    wsAttach: function (entity) {
      this.entities.push(entity);
    },
    wsFind: function (kind) {
      for (var i = 0; i < this.entities.length; i++) {
        if (this.entities[i].kind === kind) return this.entities[i];
      }
      return null;
    },
  };

  var SystemScheduler = {
    wsTick: function (dtSec) {
      var sim = World.wsFind("SimState");
      if (!sim || sim.phase !== "operate") return;
      wsApplyFlow(sim, dtSec);
      wsCheckFail(sim);
      wsCheckDayComplete(sim);
      publishView();
    },
  };

  var EventQueue = {
    subs: Object.create(null),
    edPublish: function (type, payload) {
      var list = this.subs[type] || [];
      for (var i = 0; i < list.length; i++) list[i](payload);
    },
    edSubscribe: function (type, fn) {
      if (!this.subs[type]) this.subs[type] = [];
      this.subs[type].push(fn);
    },
  };

  var ScoreStore = {
    bestDays: null,
    stLoad: function () {
      try {
        var raw = localStorage.getItem(KEY_BEST);
        if (raw !== null && Number.isFinite(Number(raw))) {
          this.bestDays = Number(raw);
        }
    } catch (e) {}
    },
    stSaveBest: function (days) {
      if (this.bestDays !== null && days <= this.bestDays) return true;
      this.bestDays = days;
      try {
        localStorage.setItem(KEY_BEST, String(days));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  function plLoadDays(ctx) {
    ctx.days = DAY_SEEDS.slice();
    return ctx;
  }

  function plValidateDay(ctx) {
    var day = ctx.days[ctx.index];
    if (!day || !Number.isFinite(day.inflow)) {
      ctx.day = DEFAULT_DAY;
      ctx.usedFallback = true;
      return ctx;
    }
    ctx.day = day;
    ctx.usedFallback = false;
    return ctx;
  }

  function plPickDay(ctx) {
    ctx = plLoadDays(ctx);
    ctx = plValidateDay(ctx);
    return ctx;
  }

  function createSimState(dayIndex) {
    var ctx = plPickDay({ index: dayIndex });
    if (ctx.usedFallback) setFeedback("Using default level", false);
    return {
      kind: "SimState",
      phase: "operate",
      dayIndex: dayIndex,
      day: ctx.day,
      stock: 50,
      daysCleared: 0,
      dayElapsed: 0,
      gateOpen: false,
      fineBleed: false,
      intakeThrottle: false,
      starveSec: 0,
      lastOut: 0,
      shipped: 0,
    };
  }

  function writeMeta() {
    try {
      localStorage.setItem(
        KEY_META,
        JSON.stringify({ shipped: careerShipped })
      );
      localStorage.setItem(KEY_HUB_LAST, "sim_silo_flow");
    } catch (e) {}
  }

  function loadCareer() {
    try {
      var raw = localStorage.getItem(KEY_SHIPPED);
      if (raw !== null) careerShipped = Number(raw) || 0;
    } catch (e) {}
  }

  function wsOutflow(sim) {
    if (sim.gateOpen) return sim.day.outOpen;
    if (sim.fineBleed) return sim.day.demand * 0.95;
    return sim.day.outClosed;
  }

  function wsApplyFlow(sim, dtSec) {
    var scale = dtSec * 0.35;
    var surge = sim.day.id % 4 === 0 ? 1.35 : 1;
    var inflow = sim.day.inflow * scale * surge;
    if (sim.intakeThrottle) inflow *= 0.55;
    var outflow = wsOutflow(sim) * scale;
    sim.lastOut = outflow / scale;
    sim.stock += inflow - outflow;
    sim.shipped += outflow * 0.15;
    if (sim.stock < STOCK_MIN) sim.stock = STOCK_MIN;
    if (sim.stock > STOCK_MAX) sim.stock = STOCK_MAX;
    sim.dayElapsed += dtSec;
    if (sim.lastOut + 0.01 < sim.day.demand) {
      sim.starveSec += dtSec;
    } else {
      sim.starveSec = Math.max(0, sim.starveSec - dtSec * 0.5);
    }
  }

  function wsCheckFail(sim) {
    if (sim.stock <= STOCK_MIN + 0.001) {
      endRun("Starvation — silo empty");
      return;
    }
    if (sim.stock >= STOCK_MAX - 0.001) {
      endRun("Overflow — silo full");
      return;
    }
    if (sim.starveSec >= STARVE_LIMIT_SEC) {
      endRun("Demand not met — line stopped");
    }
  }

  function wsCheckDayComplete(sim) {
    if (sim.dayElapsed < sim.day.durationSec) return;
    careerShipped += Math.floor(sim.shipped);
    sim.shipped = 0;
    try {
      localStorage.setItem(KEY_SHIPPED, String(careerShipped));
    } catch (e) {}
    writeMeta();
    sim.daysCleared += 1;
    sim.dayElapsed = 0;
    sim.starveSec = 0;
    sim.stock = Math.min(85, Math.max(35, sim.stock));
    var nextIndex = (sim.dayIndex + 1) % DAY_SEEDS.length;
    sim.dayIndex = nextIndex;
    var ctx = plPickDay({ index: nextIndex });
    sim.day = ctx.day;
    dom.phaseText.textContent =
      "Day " + (sim.daysCleared + 1) + " — balance inflow and discharge";
    setFeedback("Day " + sim.daysCleared + " cleared", true);
    EventQueue.edPublish("DAY_CLEARED", { days: sim.daysCleared });
  }

  function getSim() {
    return World.wsFind("SimState");
  }

  function publishView() {
    var sim = getSim();
    if (!sim) return;
    dom.hudStock.textContent = sim.stock.toFixed(0) + "%";
    dom.hudDays.textContent = String(sim.daysCleared);
    dom.hudBest.textContent =
      ScoreStore.bestDays === null ? "—" : String(ScoreStore.bestDays);
    dom.siloFill.style.height = sim.stock + "%";
    var surge = sim.day.id % 4 === 0 ? " · surge" : "";
    dom.statIn.textContent = sim.day.inflow.toFixed(1) + surge;
    dom.statOut.textContent = sim.lastOut.toFixed(1);
    dom.statDemand.textContent = sim.day.demand.toFixed(1);
    var left = Math.max(0, sim.day.durationSec - sim.dayElapsed);
    dom.statTimer.textContent = left.toFixed(1) + "s";
    dom.btnToggle.classList.toggle("active", sim.gateOpen);
    dom.btnSlowOut.classList.toggle("active", sim.fineBleed);
    if (dom.btnThrottle) dom.btnThrottle.classList.toggle("active", sim.intakeThrottle);
  }

  function setFeedback(msg, ok) {
    dom.feedback.textContent = msg;
    dom.feedback.className = ok ? "sl-feedback ok" : "sl-feedback";
  }

  function stopTick() {
    if (tickId) {
      window.clearInterval(tickId);
      tickId = 0;
    }
    timers.forEach(function (t) {
      window.clearTimeout(t);
    });
    timers = [];
  }

  function startTick() {
    stopTick();
    tickId = window.setInterval(function () {
      SystemScheduler.wsTick(TICK_MS / 1000);
    }, TICK_MS);
  }

  function prepareRun(startDayIndex) {
    World.wsClear();
    var sim = createSimState(startDayIndex || 0);
    sim.daysCleared = 0;
    World.wsAttach(sim);
    dom.resultPanel.classList.add("hidden");
    dom.phaseText.textContent = "Day 1 — balance inflow and discharge";
    setFeedback("", false);
    publishView();
    startTick();
  }

  function endRun(title) {
    var sim = getSim();
    if (!sim || sim.phase === "result") return;
    sim.phase = "result";
    stopTick();
    var days = sim.daysCleared;
    careerShipped += Math.floor(sim.shipped);
    try {
      localStorage.setItem(KEY_SHIPPED, String(careerShipped));
    } catch (e) {}
    writeMeta();
    var saved = ScoreStore.stSaveBest(days);
    if (!saved) setFeedback("Save unavailable — Retry", false);
    publishView();
    timers.push(
      window.setTimeout(function () {
        dom.resultTitle.textContent = title;
        dom.resultDetail.textContent = "Survived " + days + " day(s) before shutdown";
        dom.resultPanel.classList.remove("hidden");
        dom.resultPanel.setAttribute("aria-hidden", "false");
      }, 560)
    );
  }

  function bindDom() {
    dom.hudStock = document.getElementById("hudStock");
    dom.hudDays = document.getElementById("hudDays");
    dom.hudBest = document.getElementById("hudBest");
    dom.phaseText = document.getElementById("phaseText");
    dom.siloFill = document.getElementById("siloFill");
    dom.statIn = document.getElementById("statIn");
    dom.statOut = document.getElementById("statOut");
    dom.statDemand = document.getElementById("statDemand");
    dom.statTimer = document.getElementById("statTimer");
    dom.feedback = document.getElementById("feedback");
    dom.btnToggle = document.getElementById("btnToggle");
    dom.btnSlowOut = document.getElementById("btnSlowOut");
    dom.btnThrottle = document.getElementById("btnThrottle");
    dom.btnRetry = document.getElementById("btnRetry");
    dom.resultPanel = document.getElementById("resultPanel");
    dom.resultTitle = document.getElementById("resultTitle");
    dom.resultDetail = document.getElementById("resultDetail");
    dom.tutorial = document.getElementById("tutorial");
    dom.btnSkipTutorial = document.getElementById("btnSkipTutorial");
  }

  function wireEvents() {
    dom.btnToggle.addEventListener("click", function () {
      var sim = getSim();
      if (!sim || sim.phase !== "operate") return;
      sim.gateOpen = !sim.gateOpen;
      publishView();
    });
    dom.btnSlowOut.addEventListener("click", function () {
      var sim = getSim();
      if (!sim || sim.phase !== "operate") return;
      sim.fineBleed = !sim.fineBleed;
      publishView();
    });
    if (dom.btnThrottle) {
      dom.btnThrottle.addEventListener("click", function () {
        var sim = getSim();
        if (!sim || sim.phase !== "operate") return;
        sim.intakeThrottle = !sim.intakeThrottle;
        publishView();
      });
    }
    dom.btnRetry.addEventListener("click", function () {
      prepareRun(Math.floor(Math.random() * DAY_SEEDS.length));
    });
    dom.btnSkipTutorial.addEventListener("click", hideTutorial);
    window.addEventListener("pagehide", stopTick);
    EventQueue.edSubscribe("DAY_CLEARED", function (payload) {
      ScoreStore.stSaveBest(payload.days);
      publishView();
    });
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
    window.__miniTeardown = stopTick;
    bindDom();
    ScoreStore.stLoad();
    loadCareer();
    writeMeta();
    wireEvents();
    maybeTutorial();
    prepareRun(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
