(function () {
  "use strict";

  function runTeardown() {
    if (typeof window.__miniTeardown === "function") {
      try {
        window.__miniTeardown();
      } catch (e) {}
    }
  }

  function bindTopnav() {
    var back = document.querySelector(".mini-topnav-back");
    if (back) {
      back.addEventListener("click", runTeardown);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindTopnav);
  } else {
    bindTopnav();
  }
})();
