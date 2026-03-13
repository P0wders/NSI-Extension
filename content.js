const script = document.createElement("script");
script.src = browser.runtime.getURL("page.js");
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
