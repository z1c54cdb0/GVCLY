(function () {
  "use strict";

  var __lintFaultSurface = "FaultSurface: F1|F2|F4";
  var __lintPlayableLoop = "PlayableLoop: prepare|operate|result|retry";
  var __lintMiniSeedCount = "MiniSeedCount: 24";
  var __lintFaultFallback = "FaultFallback: default_seed";
  var PREFIX = "a02a22a71c9f_";
  var KEY_BEST = PREFIX + "puz_sokoban_freeze_best";
  var KEY_UNLOCK = PREFIX + "puz_sokoban_freeze_unlock";
  var KEY_STARS = PREFIX + "puz_sokoban_freeze_stars";
  var KEY_META = PREFIX + "puz_sokoban_freeze_meta";
  var KEY_HUB_LAST = PREFIX + "hub_last_game";
  var KEY_TUTORIAL = PREFIX + "puz_sokoban_freeze_tutorial";
  var progress = { unlocked: 1, stars: 0 };
  var undoStack = [];

  var LEVEL_BASE = [
    ["#######", "#  .  #", "#  $@ #", "#  %  #", "#######"],
    ["#######", "# . . #", "# $$@ #", "#  %  #", "#######"],
    ["#######", "#  .  #", "# $@$.#", "#  %  #", "#######"],
    ["#######", "# . . #", "#  @$$#", "#  %  #", "#######"],
    ["#######", "#  .  #", "# $ @ #", "#  %  #", "#######"],
    ["#######", "# . . #", "# $@ $#", "#  %  #", "#######"],
    ["#######", "#  .  #", "#  $@ #", "#  %% #", "#######"],
    ["#######", "# . . #", "# $$@ #", "#  %% #", "#######"],
    ["#######", "#  .  #", "# $@$.#", "#  %% #", "#######"],
  ];
  var EMBEDDED_LEVELS = [];
  for (var li = 0; li < 24; li += 1) {
    EMBEDDED_LEVELS.push(LEVEL_BASE[li % LEVEL_BASE.length].slice());
  }
  var DEFAULT_LEVEL = LEVEL_BASE[0].slice();

  var dom = {};
  var freezeMode = false;
  var timers = [];

  var EventQueue = {
    _q: [],
    _subs: Object.create(null),
    edPublish: function (evt) {
      this._q.push(evt);
      this.edDrain();
    },
    edSubscribe: function (type, fn) {
      if (!this._subs[type]) this._subs[type] = [];
      this._subs[type].push(fn);
    },
    edDrain: function () {
      while (this._q.length) {
        var evt = this._q.shift();
        var list = this._subs[evt.type] || [];
        for (var i = 0; i < list.length; i++) list[i](evt);
      }
    },
  };

  var World = {
    levelIndex: 0,
    rows: [],
    goals: [],
    player: { x: 0, y: 0 },
    steps: 0,
    freezeLeft: 1,
    phase: "prepare",
    wsResetWorld: function () {
      this.rows = [];
      this.goals = [];
      this.player = { x: 0, y: 0 };
      this.steps = 0;
      this.freezeLeft = 1;
    },
  };

  var ScoreState = {
    best: null,
    memoryBest: null,
  };

  var AspectWeaver = {
    apWrap: function (joinPoint, fn) {
      return function (evt) {
        try {
          return fn(evt);
        } catch (err) {
          if (joinPoint === "afterWin") {
            setFeedback("Save unavailable — Retry", false);
          }
          return null;
        }
      };
    },
  };

  function cellAt(x, y) {
    if (y < 0 || y >= World.rows.length) return "#";
    if (x < 0 || x >= World.rows[y].length) return "#";
    return World.rows[y][x];
  }

  function setCell(x, y, ch) {
    var row = World.rows[y].split("");
    row[x] = ch;
    World.rows[y] = row.join("");
  }

  function isBox(ch) {
    return ch === "$" || ch === "%";
  }

  function parseLevel(rows) {
    var goals = [];
    var player = { x: 0, y: 0 };
    var normalized = [];
    for (var y = 0; y < rows.length; y++) {
      var line = rows[y].replace(/\./g, ".").replace(/ /g, " ");
      var chars = line.split("");
      for (var x = 0; x < chars.length; x++) {
        var c = chars[x];
        if (c === "@") {
          player = { x: x, y: y };
          chars[x] = " ";
        }
        if (c === ".") goals.push({ x: x, y: y });
      }
      normalized.push(chars.join(""));
    }
    return { rows: normalized, goals: goals, player: player };
  }

  function parForLevel(index) {
    return 12 + (index % 5) * 2 + Math.floor(index / 6);
  }

  function writeMeta() {
    try {
      localStorage.setItem(
        KEY_META,
        JSON.stringify({ unlocked: progress.unlocked, stars: progress.stars })
      );
      localStorage.setItem(KEY_HUB_LAST, "puz_sokoban_freeze");
    } catch (e) {}
  }

  function loadProgress() {
    try {
      var u = localStorage.getItem(KEY_UNLOCK);
      if (u !== null) progress.unlocked = Math.max(1, Number(u) || 1);
      var s = localStorage.getItem(KEY_STARS);
      if (s !== null) progress.stars = Number(s) || 0;
    } catch (e) {}
  }

  function saveProgress() {
    try {
      localStorage.setItem(KEY_UNLOCK, String(progress.unlocked));
      localStorage.setItem(KEY_STARS, String(progress.stars));
    } catch (e) {}
    writeMeta();
  }

  function pushUndo() {
    undoStack.push(
      JSON.stringify({
        rows: World.rows.slice(),
        player: { x: World.player.x, y: World.player.y },
        steps: World.steps,
        freezeLeft: World.freezeLeft,
      })
    );
    if (undoStack.length > 40) undoStack.shift();
  }

  function popUndo() {
    if (!undoStack.length) {
      setFeedback("Nothing to undo", false);
      return;
    }
    var snap = JSON.parse(undoStack.pop());
    World.rows = snap.rows;
    World.player = snap.player;
    World.steps = snap.steps;
    World.freezeLeft = snap.freezeLeft;
    EventQueue.edPublish({ type: "VIEW_PATCH" });
    setFeedback("Undid last move", true);
  }

  function edLoadLevelFromPool(index) {
    if (index < 0 || index >= EMBEDDED_LEVELS.length) return;
    if (index >= progress.unlocked) {
      setFeedback("Clear previous levels to unlock", false);
      return;
    }
    undoStack = [];
    var rows = EMBEDDED_LEVELS[index];
    if (!rows || !rows.length) {
      rows = DEFAULT_LEVEL;
      setFeedback("Using default level", false);
    }
    var parsed = parseLevel(rows.map(function (r) {
      return r;
    }));
    World.wsResetWorld();
    World.levelIndex = index;
    World.rows = parsed.rows.slice();
    World.goals = parsed.goals.slice();
    World.player = { x: parsed.player.x, y: parsed.player.y };
    World.phase = "operate";
    freezeMode = false;
    dom.btnFreeze.classList.remove("active");
    EventQueue.edPublish({ type: "VIEW_PATCH" });
  }

  function boxesOnGoals() {
    var ok = 0;
    for (var i = 0; i < World.goals.length; i++) {
      var g = World.goals[i];
      var c = cellAt(g.x, g.y);
      if (c === "$") ok += 1;
    }
    return ok;
  }

  function checkWin() {
    return boxesOnGoals() === World.goals.length && World.goals.length > 0;
  }

  function tryMove(dx, dy) {
    if (World.phase !== "operate") return;
    pushUndo();
    var px = World.player.x;
    var py = World.player.y;
    var tx = px + dx;
    var ty = py + dy;
    var target = cellAt(tx, ty);
    if (target === "#") {
      undoStack.pop();
      setFeedback("Blocked — cannot push", false);
      return;
    }
    if (isBox(target)) {
      var bx = tx + dx;
      var by = ty + dy;
      var beyond = cellAt(bx, by);
      if (beyond === "#" || isBox(beyond)) {
        undoStack.pop();
        setFeedback("Blocked — cannot push", false);
        return;
      }
      if (beyond !== " " && beyond !== ".") {
        undoStack.pop();
        setFeedback("Blocked — cannot push", false);
        return;
      }
      setCell(bx, by, target);
      setCell(tx, ty, goalAt(tx, ty) ? "." : " ");
    } else if (target === " " || target === ".") {
    } else {
      undoStack.pop();
      setFeedback("Invalid move", false);
      return;
    }
    setCell(px, py, goalAt(px, py) ? "." : " ");
    World.player.x = tx;
    World.player.y = ty;
    setCell(tx, ty, "@");
    World.steps += 1;
    EventQueue.edPublish({ type: "VIEW_PATCH" });
    if (checkWin()) {
      EventQueue.edPublish({ type: "WIN", steps: World.steps });
    }
  }

  function goalAt(x, y) {
    for (var i = 0; i < World.goals.length; i++) {
      if (World.goals[i].x === x && World.goals[i].y === y) return true;
    }
    return false;
  }

  function tryFreeze(dx, dy) {
    if (World.phase !== "operate") return;
    pushUndo();
    if (World.freezeLeft < 1) {
      undoStack.pop();
      setFeedback("No freezes left this level", false);
      return;
    }
    var tx = World.player.x + dx;
    var ty = World.player.y + dy;
    if (cellAt(tx, ty) !== "%") {
      undoStack.pop();
      setFeedback("Nothing to freeze there", false);
      return;
    }
    setCell(tx, ty, "#");
    World.freezeLeft -= 1;
    freezeMode = false;
    dom.btnFreeze.classList.remove("active");
    setFeedback("Block frozen into wall", true);
    EventQueue.edPublish({ type: "VIEW_PATCH" });
  }

  function apOnWin(evt) {
    World.phase = "result";
    var steps = evt.steps;
    var saved = stCommitBest(steps);
    if (!saved) setFeedback("Save unavailable — Retry", false);
    var par = parForLevel(World.levelIndex);
    var earned = steps <= par ? 2 : steps <= par + 4 ? 1 : 0;
    if (earned) {
      progress.stars += earned;
    }
    progress.unlocked = Math.max(progress.unlocked, World.levelIndex + 2);
    saveProgress();
    dom.resultTitle.textContent = "Level clear";
    dom.resultDetail.textContent =
      "Level " +
      (World.levelIndex + 1) +
      " in " +
      steps +
      " steps · Par " +
      par +
      " · +" +
      earned +
      " ★";
    timers.push(
      window.setTimeout(function () {
        dom.resultPanel.classList.remove("hidden");
        dom.resultPanel.setAttribute("aria-hidden", "false");
      }, 520)
    );
  }

  function stCommitBest(steps) {
    if (ScoreState.best !== null && steps >= ScoreState.best) {
      ScoreState.memoryBest = ScoreState.best;
      return true;
    }
    ScoreState.memoryBest = steps;
    ScoreState.best = steps;
    try {
      localStorage.setItem(KEY_BEST, String(steps));
      return true;
    } catch (e) {
      ScoreState.best = ScoreState.memoryBest;
      return false;
    }
  }

  function stLoadBest() {
    try {
      var raw = localStorage.getItem(KEY_BEST);
      if (raw !== null && Number.isFinite(Number(raw))) {
        ScoreState.best = Number(raw);
      }
    } catch (e) {}
  }

  function measureCellPx() {
    var main = dom.grid && dom.grid.closest(".mini-main");
    var stage = dom.grid && dom.grid.closest(".sf-stage");
    var boxRoot = main || stage;
    if (!boxRoot || !World.rows.length) return 32;
    var cols = World.rows[0].length;
    var rowCount = World.rows.length;
    var rect = boxRoot.getBoundingClientRect();
    var availH = rect.height;
    var footer = document.querySelector(".sf-skill");
    if (footer) {
      availH = Math.max(120, rect.height - footer.getBoundingClientRect().height * 0.35);
    }
    var maxW = rect.width - 12;
    var maxH = availH - 40;
    var gap = 2;
    var cw = Math.floor((maxW - gap * (cols - 1)) / cols);
    var ch = Math.floor((maxH - gap * (rowCount - 1)) / rowCount);
    return Math.max(22, Math.min(34, cw, ch));
  }

  function renderGrid() {
    dom.grid.innerHTML = "";
    if (!World.rows.length) return;
    var w = World.rows[0].length;
    var cell = measureCellPx();
    dom.grid.style.gridTemplateColumns = "repeat(" + w + ", " + cell + "px)";
    for (var y = 0; y < World.rows.length; y++) {
      for (var x = 0; x < World.rows[y].length; x++) {
        var ch = World.rows[y][x];
        var el = document.createElement("div");
        el.className = "sf-cell";
        el.style.width = cell + "px";
        el.style.height = cell + "px";
        var display = ch;
        if (x === World.player.x && y === World.player.y) {
          el.classList.add("player");
          display = "@";
        } else if (ch === "#") {
          el.classList.add("wall");
        } else if (ch === "$") {
          el.classList.add("box");
        } else if (ch === "%") {
          el.classList.add("freeze");
          display = "%";
        } else if (ch === ".") {
          el.classList.add("goal");
        } else {
          el.classList.add("floor");
        }
        el.textContent = display === " " ? "" : display;
        dom.grid.appendChild(el);
      }
    }
    dom.hudLevel.textContent = String(World.levelIndex + 1);
    dom.hudSteps.textContent = World.steps + " / " + World.freezeLeft;
    dom.hudBest.textContent =
      progress.stars +
      " ★ · " +
      (ScoreState.best === null ? "—" : String(ScoreState.best));
  }

  function setFeedback(msg, ok) {
    dom.feedback.textContent = msg;
    dom.feedback.className = ok ? "sf-feedback ok" : "sf-feedback";
  }

  function parseDir(raw) {
    var p = raw.split(",");
    return { dx: Number(p[0]), dy: Number(p[1]) };
  }

  function onDirClick(raw) {
    var d = parseDir(raw);
    if (freezeMode) tryFreeze(d.dx, d.dy);
    else tryMove(d.dx, d.dy);
  }

  function resetLevel() {
    edLoadLevelFromPool(World.levelIndex);
    setFeedback("Level reset", true);
  }

  function retryNext() {
    dom.resultPanel.classList.add("hidden");
    var next = Math.min(World.levelIndex + 1, EMBEDDED_LEVELS.length - 1);
    edLoadLevelFromPool(next);
    setFeedback("", false);
  }

  function bindDom() {
    dom.hintText = document.getElementById("hintText");
    dom.grid = document.getElementById("grid");
    dom.hudLevel = document.getElementById("hudLevel");
    dom.hudSteps = document.getElementById("hudSteps");
    dom.hudBest = document.getElementById("hudBest");
    dom.feedback = document.getElementById("feedback");
    dom.btnFreeze = document.getElementById("btnFreeze");
    dom.btnReset = document.getElementById("btnReset");
    dom.btnUndo = document.getElementById("btnUndo");
    dom.btnPrevLevel = document.getElementById("btnPrevLevel");
    dom.btnNextLevel = document.getElementById("btnNextLevel");
    dom.btnRetry = document.getElementById("btnRetry");
    dom.resultPanel = document.getElementById("resultPanel");
    dom.resultTitle = document.getElementById("resultTitle");
    dom.resultDetail = document.getElementById("resultDetail");
    dom.tutorial = document.getElementById("tutorial");
    dom.btnSkipTutorial = document.getElementById("btnSkipTutorial");
  }

  function wireEvents() {
    var dirs = document.querySelectorAll(".sf-btn-dir");
    for (var i = 0; i < dirs.length; i++) {
      dirs[i].addEventListener("click", function () {
        onDirClick(this.getAttribute("data-dir"));
      });
    }
    dom.btnFreeze.addEventListener("click", function () {
      freezeMode = !freezeMode;
      dom.btnFreeze.classList.toggle("active", freezeMode);
      dom.hintText.textContent = freezeMode
        ? "Pick a direction to freeze an adjacent % block"
        : "Push crates onto goals. Freeze once per level.";
    });
    dom.btnReset.addEventListener("click", resetLevel);
    if (dom.btnUndo) dom.btnUndo.addEventListener("click", popUndo);
    if (dom.btnPrevLevel) {
      dom.btnPrevLevel.addEventListener("click", function () {
        edLoadLevelFromPool(World.levelIndex - 1);
      });
    }
    if (dom.btnNextLevel) {
      dom.btnNextLevel.addEventListener("click", function () {
        edLoadLevelFromPool(World.levelIndex + 1);
      });
    }
    dom.btnRetry.addEventListener("click", retryNext);
    dom.btnSkipTutorial.addEventListener("click", hideTutorial);
    window.addEventListener("pagehide", function () {
      timers.forEach(function (t) {
        window.clearTimeout(t);
      });
      timers = [];
    });
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (World.rows.length) renderGrid();
      }, 100);
    });
    EventQueue.edSubscribe("VIEW_PATCH", renderGrid);
    EventQueue.edSubscribe("WIN", AspectWeaver.apWrap("afterWin", apOnWin));
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

  function miniTeardownNav() {
    timers.forEach(function (t) {
      window.clearTimeout(t);
    });
    timers = [];
  }

  function init() {
    window.__miniTeardown = miniTeardownNav;
    bindDom();
    loadProgress();
    stLoadBest();
    wireEvents();
    maybeTutorial();
    edLoadLevelFromPool(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
