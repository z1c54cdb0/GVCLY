(function () {
  "use strict";
  var __lintFaultSurface = "FaultSurface: F4";

  var SCOPE = "a02a22a71c9f_";

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

  function edClearScopedKeys() {
    var removed = 0;
    try {
      for (var i = localStorage.length - 1; i >= 0; i -= 1) {
        var k = localStorage.key(i);
        if (k && k.indexOf(SCOPE) === 0) {
          localStorage.removeItem(k);
          removed += 1;
        }
      }
      return removed;
    } catch (e) {
      return -1;
    }
  }

  function init() {
    var fb = document.getElementById("settingsFeedback");
    var btn = document.getElementById("btnClear");
    EventQueue.edSubscribe("CLEAR_DONE", function (payload) {
      if (!fb) return;
      if (payload.ok) {
        fb.textContent = "Removed " + payload.count + " saved entries. Retry any game to rebuild.";
      } else {
        fb.textContent = "Save unavailable — Retry";
      }
    });
    if (btn) {
      btn.addEventListener("click", function () {
        var n = edClearScopedKeys();
        EventQueue.edPublish("CLEAR_DONE", { ok: n >= 0, count: Math.max(0, n) });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
