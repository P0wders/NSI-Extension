<div align="center">

<img src="https://img.shields.io/badge/Firefox-Supported-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white" />
<img src="https://img.shields.io/badge/Chrome-Supported-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" />
<img src="https://img.shields.io/badge/Manifest-v3-lightgrey?style=for-the-badge&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" />

# 🍫 Chocolatine Helper

**Automatically selects the correct answers on [raisintine.fr/chocolatine](https://raisintine.fr/chocolatine) — you just hit Valider.**

</div>

---

## ✨ What it does

The extension silently fetches the correct answer from the server for each question, then fills it in automatically — no guessing, no cheating the hard way.

It handles every question type on the platform:

| Question type | Behaviour |
|---|---|
| 🔘 QCM (single answer) | Selects the correct radio button |
| ☑️ QCM (multiple answers) | Ticks all correct checkboxes |
| ✏️ Text / fill-in | Types the correct answer into the field |
| 🔀 Match / drag-drop (side-by-side) | Moves each label into the right slot |
| 🖼️ Match / drag-drop (image grid) | Drops each label under the correct image |
| 📦 Group / sort | Places each element in the correct group |
| 🐍 Python IDE (write from scratch) | Retrieves the solution by exhausting attempts, writes it into the Ace editor |
| 🔧 Python IDE (fix pre-filled code) | Detects the bug from the hint and auto-applies the fix (e.g. wrapping `input()` with `int()`) |

> **You always validate manually.** The extension fills the answer — clicking *Valider* is up to you.

---

## 📁 File structure

```
chocolatine-helper/
├── manifest.json        — Extension manifest (MV3)
├── content.js           — Injects page.js into the page context
├── page.js              — Core logic (runs in page scope, accesses q[])
└── icons/
    ├── logo_48.png      — Extension icon (48px)
    └── logo_96.png      — Extension icon (96px, HiDPI)
```

---

## 🚀 Installation

Both Firefox and Chrome are supported. The extension uses the WebExtensions API (Manifest V3) which works on both browsers.

### 🦊 Firefox

1. **Clone or download** this repository
   ```
   git clone https://github.com/yourname/chocolatine-helper.git
   ```

2. Open Firefox and go to **`about:debugging`**

3. Click **"This Firefox"** → **"Load Temporary Add-on..."**

4. Select the **`manifest.json`** file from the cloned folder

5. Navigate to [raisintine.fr/chocolatine](https://raisintine.fr/chocolatine) — the extension activates automatically

> ⚠️ Temporary add-ons are removed when Firefox restarts. To make it permanent, use **Firefox Developer Edition** and set `xpinstall.signatures.required` to `false` in `about:config`, then install via `about:addons` → Install Add-on From File.

### 🟦 Chrome

1. **Clone or download** this repository
   ```
   git clone https://github.com/yourname/chocolatine-helper.git
   ```

2. Open Chrome and go to **`chrome://extensions`**

3. Enable **"Developer mode"** (top right toggle)

4. Click **"Load unpacked"**

5. Select the cloned folder

6. Navigate to [raisintine.fr/chocolatine](https://raisintine.fr/chocolatine) — the extension activates automatically

> ⚠️ Unpacked extensions are kept across restarts in Chrome, but Chrome may occasionally warn you about developer mode extensions on startup.

---

## ⚙️ How it works

### Text / QCM / Drag questions

```
Page loads a new question
        │
        ▼
MutationObserver detects #cadre-formulaire-{id}
        │
        ▼
Waits for q[id] to be initialized by the page JS
        │
        ▼
POST /chocolatine/serveur.php  ←  fetches the correct answer
        │
        ▼
Detects question type from response shape:
  • reponses_liste  →  text input
  • correction[0][] →  group/drag
  • mix keys end "2" → match/drag-drop
  • correction[]    →  QCM
        │
        ▼
Fills in the answer — waits for you to click Valider
```

### Python IDE questions

```
Detects #qIdePy-{id} in the DOM
        │
        ▼
Sends dummy code to request_tests → gets number of test cases
        │
        ▼
Submits empty answers repeatedly until attempts are exhausted
        │
        ├── Server returns <py pre>code</py>
        │         → Writes solution directly into Ace editor
        │
        └── Server returns only a text hint (fix-the-code questions)
                  → Reads the pre-filled code from the hidden div
                  → Applies hint-based fix (int/float/str wrapping, indentation, colons...)
                  → Writes fixed code into Ace editor
        │
        ▼
Calls valider_reponse() once — waits for you to click Valider
```

The extension uses a `pending` + `solved` set to ensure each question is only processed **once**, even though the MutationObserver can fire dozens of times per DOM insertion.

Requests are spaced with an adaptive delay starting at 500ms, doubling up to 5s on rate-limit errors, then resetting on success.

---

## 🛠️ Development

The extension is plain vanilla JS — no build step required.

After editing `page.js`, reload the extension:

- **Firefox:** `about:debugging` → This Firefox → Chocolatine Helper → **Reload**
- **Chrome:** `chrome://extensions` → Chocolatine Helper → **↺ Reload**

---

## ⚠️ Disclaimer

This extension is for educational and personal use. Use it responsibly.

---

<div align="center">
  Made with ☕ and a deep dislike of doing flashcards manually
</div>
