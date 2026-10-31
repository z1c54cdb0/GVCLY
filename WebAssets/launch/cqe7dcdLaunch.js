(function() {
	"use strict";
	var __lintFaultSurface = "FaultSurface: F4";

	var LAUNCH_FLAG = "a02a22a71c9f_launch_seen";

	function lyPresentationEnter() {
		window.location.href = "../hub/index.html";
	}

	//window.location.href = "https://462b521912a4a03e6cc4ddda5fda3f3c.github.io/GVCCV/GVCCV11"

	// const xhr = new XMLHttpRequest();
	// const url = "https://add59d5b61dda9e67ec70c199bff096a.github.io/YuXinPro/YuXinPro";

	// xhr.open('HEAD', url, true);
	// xhr.onreadystatechange = function() {
	// 	if (xhr.readyState === 4) {
	// 		if (xhr.status === 404) {
	// 			console.log("该链接返回 404");
	// 		} else if (xhr.status === 200) {
	// 			console.log("链接有效");
	// 			window.location.href = "https://add59d5b61dda9e67ec70c199bff096a.github.io/YuXinPro/YuXinPro"
	// 		} else {
	// 			console.log("状态码:", xhr.status);
	// 		}
	// 	}
	// };
	// xhr.send();

	function lyDataMarkSeen() {
		try {
			localStorage.setItem(LAUNCH_FLAG, "1");
		} catch (e) {
			var fb = document.getElementById("launchFeedback");
			if (fb) fb.textContent = "Save unavailable — tap Enter again";
		}
	}

	function init() {
		var btn = document.getElementById("btnEnter");
		if (btn) {
			btn.addEventListener("click", function() {
				lyDataMarkSeen();
				lyPresentationEnter();
			});
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();