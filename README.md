<div align="center">

<img src="https://img.shields.io/badge/Firefox-Extension-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white" />
<img src="https://img.shields.io/badge/Manifest-v3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" />
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

> **You always validate manually.** The extension fills the answer — clicking *Valider* is up to you.

---

## 📁 File structure

```
chocolatine-helper/
├── manifest.json   — Extension manifest (MV3)
├── content.js      — Injects page.js into the page context
└── page.js         — Core logic (runs in page scope, accesses `q[]`)
```

---

## 🚀 Installation (Firefox)

1. **Clone or download** this repository
```
git clone https://github.com/yourname/chocolatine-helper.git
```

2. Open Firefox and go to **`about:debugging`**

3. Click **"This Firefox"** → **"Load Temporary Add-on..."**

4. Select the **`manifest.json`** file from the cloned folder

5. Navigate to [raisintine.fr/chocolatine](https://raisintine.fr/chocolatine) — the extension activates automatically

> ⚠️ Temporary add-ons are removed when Firefox restarts. To persist, you need a signed extension or Firefox Developer Edition with `xpinstall.signatures.required` set to `false`.

---

## ⚙️ How it works

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

The extension uses a `pending` + `solved` set to ensure each question is only processed **once**, even though the MutationObserver can fire dozens of times per DOM insertion.

---

## 🛠️ Development

The extension is plain vanilla JS — no build step required.

After editing `page.js`, just click **"Reload"** on the `about:debugging` page to apply changes.

```
about:debugging → This Firefox → Chocolatine Helper → Reload
```

---

## ⚠️ Disclaimer

This extension is for educational and personal use. Use it responsibly.

---

<div align="center">
  Made with ☕ and a deep dislike of doing flashcards manually
</div>
