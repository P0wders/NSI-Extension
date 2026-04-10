const runtime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;

const script = document.createElement("script");
script.src = runtime.getURL("page.js");
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
