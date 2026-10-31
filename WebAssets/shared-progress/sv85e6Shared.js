(function () {
  "use strict";
  var __lintFaultSurface = "FaultSurface: F1|F4";

  var PREFIX = "a02a22a71c9f_";
  var PLUGINS = [
    {
      id: "mus_fader_blend",
      title: "Fader Blend",
      key: PREFIX + "mus_fader_blend_best",
      format: function (v) {
        return "Best mix error " + v;
      },
    },
    {
      id: "spr_long_jump",
      title: "Long Jump Board",
      key: PREFIX + "spr_long_jump_best",
      format: function (v) {
        return "Best distance " + v + " m";
      },
    },
    {
      id: "puz_sokoban_freeze",
      title: "Freeze Sokoban",
      key: PREFIX + "puz_sokoban_freeze_best",
      format: function (v) {
        return "Best clear in " + v + " steps";
      },
    },
    {
      id: "sim_silo_flow",
      title: "Silo Flow",
      key: PREFIX + "sim_silo_flow_best",
      format: function (v) {
        return "Best run " + v + " day(s)";
      },
    },
  ];

  var KernelCore = {
    registry: PLUGINS,
    mkActivateAll: function () {
      return this.registry.map(mkPluginRead);
    },
  };

  function mkPluginRead(plugin) {
    try {
      var raw = localStorage.getItem(plugin.key);
      if (raw === null) {
        return {
          plugin: plugin,
          value: null,
          line: "No save yet",
        };
      }
      return {
        plugin: plugin,
        value: raw,
        line: plugin.format(raw),
      };
    } catch (e) {
      return {
        plugin: plugin,
        value: null,
        line: "Save unavailable — Retry from game",
      };
    }
  }

  function renderRows(rows) {
    var list = document.getElementById("progressList");
    var fb = document.getElementById("sharedFeedback");
    if (!list) return;
    list.innerHTML = "";
    var saved = 0;
    rows.forEach(function (row) {
      if (row.value !== null) saved += 1;
      var li = document.createElement("li");
      li.className = "sh-item";
      li.innerHTML =
        "<h2>" +
        row.plugin.title +
        "</h2>" +
        "<p>" +
        row.line +
        "</p>" +
        '<a href="../minis/' +
        row.plugin.id +
        '/index.html">Play</a>';
      list.appendChild(li);
    });
    if (fb) {
      fb.textContent =
        saved === 0
          ? "Using default view — play a mini to record progress"
          : saved + " of " + rows.length + " games have local saves";
    }
  }

  function init() {
    var rows = KernelCore.mkActivateAll();
    renderRows(rows);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
