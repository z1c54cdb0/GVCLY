(function () {
  "use strict";
  var __lintFaultSurface = "FaultSurface: F1|F4";

  var PREFIX = "a02a22a71c9f_";
  var KEY_LAST = PREFIX + "hub_last_game";
  var GAMES = [
    {
      id: "mus_fader_blend",
      title: "Fader Blend",
      genre: "Music",
      blurb: "5-set sessions, presets, streak scoring",
      statKey: PREFIX + "mus_fader_blend_best",
      metaKey: PREFIX + "mus_fader_blend_meta",
      statLabel: "Best error",
    },
    {
      id: "spr_long_jump",
      title: "Long Jump Board",
      genre: "Sports",
      blurb: "Single jumps or 3-attempt meets with wind",
      statKey: PREFIX + "spr_long_jump_best",
      metaKey: PREFIX + "spr_long_jump_meta",
      statLabel: "Best distance",
    },
    {
      id: "puz_sokoban_freeze",
      title: "Freeze Sokoban",
      genre: "Puzzle",
      blurb: "24 levels, undo, stars, level select",
      statKey: PREFIX + "puz_sokoban_freeze_best",
      metaKey: PREFIX + "puz_sokoban_freeze_meta",
      statLabel: "Best steps",
    },
    {
      id: "sim_silo_flow",
      title: "Silo Flow",
      genre: "Simulation",
      blurb: "Throttle intake, surges, career totals",
      statKey: PREFIX + "sim_silo_flow_best",
      metaKey: PREFIX + "sim_silo_flow_meta",
      statLabel: "Best days",
    },
  ];

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

  function mkReadMeta(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function dailyGameId() {
    var day = new Date().toISOString().slice(0, 10);
    var h = 0;
    for (var i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
    return GAMES[h % GAMES.length].id;
  }

  function mkReadProgress(games) {
    var saved = 0;
    var streakSum = 0;
    var stars = 0;
    var shipped = 0;
    games.forEach(function (g) {
      if (mkReadStorage(g.statKey) !== null) saved += 1;
      var meta = mkReadMeta(g.metaKey);
      if (meta) {
        if (meta.streak) streakSum += Number(meta.streak) || 0;
        if (meta.stars) stars += Number(meta.stars) || 0;
        if (meta.shipped) shipped += Number(meta.shipped) || 0;
      }
    });
    return {
      saved: saved,
      total: games.length,
      streakSum: streakSum,
      stars: stars,
      shipped: shipped,
    };
  }

  function apRenderStrip(progress) {
    var map = {
      progSaved: progress.saved + "/" + progress.total,
      progStreaks: progress.streakSum ? String(progress.streakSum) : "—",
      progStars: progress.stars ? progress.stars + " ★" : "—",
      progCareer: progress.shipped ? progress.shipped + " t" : "—",
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = map[id];
    });
  }

  function gameById(games, id) {
    for (var i = 0; i < games.length; i++) {
      if (games[i].id === id) return games[i];
    }
    return null;
  }

  function apRenderSpotlight(games, progress) {
    var root = document.getElementById("spotlight");
    if (!root) return;
    root.innerHTML = "";
    var last = mkReadStorage(KEY_LAST);
    if (last) {
      var gLast = gameById(games, last);
      if (gLast) {
        var cont = document.createElement("a");
        cont.className = "hb-spot-card";
        cont.href = "../minis/" + gLast.id + "/index.html";
        cont.innerHTML =
          "<strong>Continue: " +
          gLast.title +
          "</strong><span>Pick up where you left off</span>";
        root.appendChild(cont);
      }
    }
    var dailyId = dailyGameId();
    var gDaily = gameById(games, dailyId);
    if (gDaily) {
      var day = document.createElement("a");
      day.className = "hb-spot-card";
      day.href = "../minis/" + gDaily.id + "/index.html";
      day.innerHTML =
        "<strong>Today’s bench: " +
        gDaily.title +
        "</strong><span>Daily loft rotation · extra bragging rights</span>";
      root.appendChild(day);
    }
    var goals = document.createElement("div");
    goals.className = "hb-spot-goals";
    goals.innerHTML = "<h2>Loft goals</h2>";
    var ul = document.createElement("ul");
    var checks = [
      { ok: progress.saved >= 2, text: "Save progress in 2+ games" },
      { ok: progress.stars >= 3, text: "Earn 3+ puzzle stars" },
      { ok: progress.shipped >= 50, text: "Ship 50+ tons in Silo Flow" },
    ];
    checks.forEach(function (c) {
      var li = document.createElement("li");
      li.className = c.ok ? "done" : "";
      li.textContent = (c.ok ? "✓ " : "○ ") + c.text;
      ul.appendChild(li);
    });
    goals.appendChild(ul);
    root.appendChild(goals);
  }

  function apRenderCards(games) {
    var root = document.getElementById("cardList");
    if (!root) return;
    root.innerHTML = "";
    games.forEach(function (g) {
      var stat = mkReadStorage(g.statKey);
      var meta = mkReadMeta(g.metaKey);
      var extra = "";
      if (meta) {
        if (meta.streak) extra += " · Streak " + meta.streak;
        if (meta.unlocked) extra += " · Unlocked " + meta.unlocked + "/24";
        if (meta.meetBest) extra += " · Meet " + meta.meetBest + " m";
      }
      var metaLine =
        stat !== null
          ? g.statLabel + ": " + stat + (g.id === "spr_long_jump" ? " m" : "") + extra
          : "No save yet — tap to play" + extra;
      var a = document.createElement("a");
      a.className = "hb-card";
      a.href = "../minis/" + g.id + "/index.html";
      a.innerHTML =
        '<span class="hb-card-genre">' +
        g.genre +
        "</span>" +
        '<h2 class="hb-card-title">' +
        g.title +
        "</h2>" +
        '<p class="hb-card-meta">' +
        g.blurb +
        " · " +
        metaLine +
        "</p>";
      root.appendChild(a);
    });
  }

  function init() {
    var progress = mkReadProgress(GAMES);
    apRenderStrip(progress);
    apRenderSpotlight(GAMES, progress);
    apRenderCards(GAMES);
    window.addEventListener("pagehide", function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
