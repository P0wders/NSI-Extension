const runtime = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;

// Latest manifest on GitHub — the version it declares is the one users should run.
const REMOTE_MANIFEST_URL = "https://raw.githubusercontent.com/P0wders/NSI-Extension/main/manifest.json";

// Fetched from the content script so the page's CSP cannot block the request.
const remoteVersion = fetch(REMOTE_MANIFEST_URL, { cache: "no-store" })
    .then(r => r.ok ? r.json() : null)
    .then(m => m && m.version)
    .catch(() => null);

const script = document.createElement("script");
script.src = runtime.getURL("page.js");
script.onload = async () => {
    script.remove();
    const local = runtime.getManifest().version;
    const remote = await remoteVersion;
    // page.js runs in the page world, where alertify lives. Pass a JSON string:
    // Firefox hides objects created by content scripts from page code.
    if(remote && remote !== local){
        window.dispatchEvent(new CustomEvent("chocolatine-helper-update", {
            detail: JSON.stringify({ local, remote })
        }));
    }
};
(document.head || document.documentElement).appendChild(script);
