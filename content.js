(async () => {
    // Load index.json
    const response = await fetch(chrome.runtime.getURL('index.json'));
    const index = await response.json();

    // Helper: wait for element
    const waitForElement = (selector) => new Promise(resolve => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        const observer = new MutationObserver((mutations, obs) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const found = node.matches(selector) ? node : node.querySelector(selector);
                    if (found) {
                        obs.disconnect();
                        resolve(found);
                        return;
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });

    // Utility: safe replace all (works in older envs)
    const replaceAllSafe = (str, find, repl) => {
        if (find === '') return str;
        return str.split(find).join(repl);
    };

    // Python-like slice function
    const pySlice = (s, startRaw, endRaw, stepRaw) => {
        const chars = Array.from(s);
        const len = chars.length;

        // parse start/end/step (empty string => undefined)
        const start = (startRaw === '' || startRaw === undefined || startRaw === null) ? undefined : parseInt(startRaw, 10);
        const end = (endRaw === '' || endRaw === undefined || endRaw === null) ? undefined : parseInt(endRaw, 10);
        let step = (stepRaw === '' || stepRaw === undefined || stepRaw === null) ? undefined : parseInt(stepRaw, 10);

        if (step === 0) return ''; // invalid in Python but we'll return empty

        if (step === undefined) step = 1;

        // normalize negative indices for start/end relative to len
        const normalizeIndex = (i, forStepPositive) => {
            if (i === undefined) return undefined;
            if (i < 0) return i + len;
            return i;
        };

        if (step > 0) {
            let sidx = start !== undefined ? normalizeIndex(start, true) : 0;
            let eidx = end !== undefined ? normalizeIndex(end, true) : len;

            // clamp
            if (sidx < 0) sidx = 0;
            if (sidx > len) sidx = len;
            if (eidx < 0) eidx = 0;
            if (eidx > len) eidx = len;

            let out = [];
            for (let i = sidx; i < eidx; i += step) {
                out.push(chars[i]);
            }
            return out.join('');
        } else { // step < 0
            // Defaults: start -> len-1, end -> -1
            let sidx = start !== undefined ? normalizeIndex(start, false) : (len - 1);
            let eidx = end !== undefined ? normalizeIndex(end, false) : -1;

            // When normalized indices are out of bounds, we still allow them as Python does
            // Example: start could be >= len, it will skip until condition false
            let out = [];
            for (let i = sidx; i > eidx; i += step) {
                // only push valid indices between 0 and len-1
                if (i >= 0 && i < len) out.push(chars[i]);
            }
            return out.join('');
        }
    };

    // --- SMART ANSWER LOOKUP ---
    const getSmartAnswer = (questionText, codeSnippet) => {
        // direct from index.json if present
        if (index[questionText] !== undefined) return index[questionText];

        // ---------- nested loops (tab[x][y]) ----------
        if (codeSnippet) {
            // match patterns like: for x in range(len(tab)): \n for y in range(len(tab[x])):
            const nestedMatch = codeSnippet.match(/for\s+(\w+)\s+in\s+range\(\s*len\(\s*tab\s*\)\s*\)\s*:\s*[\r\n\s]*for\s+(\w+)\s+in\s+range\(\s*len\(\s*tab\[\s*\1\s*\]\s*\)\s*\)\s*:/);
            if (nestedMatch) {
                const outer = nestedMatch[1];
                const inner = nestedMatch[2];
                return [`tab[${outer}][${inner}]`];
            }
        }

        // ---------- dictionary: read / update / country ----------
        const dictCountryMatch = questionText.match(/pays de (\w+)/i);
        const dictReadMatch = questionText.match(/renvoie l'?age de (\w+)/i);
        const dictUpdateMatch = questionText.match(/corriger l'?age de (\w+) par la valeur (\d+)/i);
        if (dictCountryMatch && codeSnippet) {
            return `base["${dictCountryMatch[1]}"]["pays"]`;
        }
        if (dictReadMatch && codeSnippet) {
            return `base["${dictReadMatch[1]}"]["age"]`;
        }
        if (dictUpdateMatch && codeSnippet) {
            return `base["${dictUpdateMatch[1]}"]["age"] = ${dictUpdateMatch[2]}`;
        }

        // ---------- list indexed literal like [[...]][i][j] ----------
        // Try to find a literal array either in code snippet or in the question text
        const listMatch = questionText.match(/\[\[(?:[^\]]+)\]\]\s*\[(\-?\d+)\]\s*\[(\-?\d+)\]/);
        if (listMatch) {
            const outer = parseInt(listMatch[1], 10);
            const inner = parseInt(listMatch[2], 10);
            // try to extract actual array literal from codeSnippet (prefer) or from question
            const arraySource = (codeSnippet && codeSnippet.match(/\[\s*\[.*?\]\s*(?:,\s*\[.*?\]\s*)+\]/s)) || questionText.match(/\[\s*\[.*?\]\s*(?:,\s*\[.*?\]\s*)+\]/s);
            if (arraySource) {
                try {
                    // normalize quotes to JSON style then parse
                    let arrText = arraySource[0].replace(/'/g, '"');
                    // remove whitespace-newline issues
                    arrText = arrText.replace(/\n/g, ' ');
                    const arr = JSON.parse(arrText);
                    if (arr && arr[outer] && (inner in arr[outer])) return arr[outer][inner];
                } catch (e) {
                    // parsing failed -> fall through to null
                }
            }
        }

        // ---------- f-string detection ----------
        // Example questions:
        // "Donner la chaîne de caractères formatée (f-string) générant ce résultat : "Bonjour Salsabil !" sachant que prenom = "Salsabil" ?"
        const fStringQ = questionText.match(/(f-?string|fstring|chaine de caractères formatée)/i);
        if (fStringQ) {
            // capture greeting (Bonjour, Salut, etc.) from the desired output (first quoted phrase)
            const greetMatch = questionText.match(/"(.*?)\s[\wÀ-ÖØ-öø-ÿ]+ !"/); // "Bonjour Salsabil !"
            const greet = greetMatch ? greetMatch[1] : 'Bonjour';
            // variable name: "sachant que prenom = "Salsabil"" or "sachant que personne = "Mohamed""
            const varMatch = questionText.match(/sachant que\s+(\w+)\s*=/i);
            const variable = varMatch ? varMatch[1] : 'nom';
            return `f"${greet} {${variable}} !"`;
        }

        // ---------- string.replace detection ----------
        // Matches patterns like: 'sot'.replace('o','au') (single or double quotes)
        const replaceMatch = questionText.match(/['"]([^'"]+)['"]\.replace\(\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
        if (replaceMatch) {
            const original = replaceMatch[1];
            const search = replaceMatch[2];
            const replacement = replaceMatch[3];
            const result = replaceAllSafe(original, search, replacement);
            return result;
        }

        // ---------- slicing: "Bonjour"[start:end:step] ----------
        const sliceMatch = questionText.match(/["']([^"']+)["']\s*\[\s*(-?\d*)\s*:\s*(-?\d*)\s*:?(-?\d*)\s*\]/);
        if (sliceMatch) {
            const str = sliceMatch[1];
            const startRaw = sliceMatch[2] === undefined ? undefined : sliceMatch[2];
            const endRaw = sliceMatch[3] === undefined ? undefined : sliceMatch[3];
            const stepRaw = sliceMatch[4] === undefined ? undefined : sliceMatch[4];
            // If group matched empty strings, pass undefined semantics
            const startArg = (startRaw === '') ? undefined : startRaw;
            const endArg = (endRaw === '') ? undefined : endRaw;
            const stepArg = (stepRaw === '') ? undefined : stepRaw;
            try {
                return pySlice(str, startArg, endArg, stepArg);
            } catch (e) {
                return null;
            }
        }

        // ---------- simple indexing "abc"[i] ----------
        const indexMatch = questionText.match(/["']([^"']+)["']\s*\[\s*(-?\d+)\s*\]/);
        if (indexMatch) {
            const str = indexMatch[1];
            const idx = parseInt(indexMatch[2], 10);
            // normalize negative index
            const realIdx = idx < 0 ? idx + str.length : idx;
            if (realIdx >= 0 && realIdx < str.length) return str[realIdx];
            return '';
        }

        // ---------- assignment detection (a = "NSI") ----------
        const assignMatch = questionText.match(/affectant à la variable\s+(\w+)\s+la chaîne de caractères\s+"([^"]+)"/i)
            || questionText.match(/affectant à la variable\s+(\w+)\s+la chaîne\s+"([^"]+)"/i);
        if (assignMatch) {
            const variable = assignMatch[1];
            const value = assignMatch[2];
            return `${variable} = "${value}"`;
        }

        // ---------- len() detection ----------
        // pattern: Sachant que x = "Modestie", que renvoie len(x) ?
        const lenQuestion = questionText.match(/sachant que\s+(\w+)\s*=\s*["']([^"']+)["'],?\s*que renvoie l'instruction\s*len\(\s*(\w+)\s*\)/i);
        if (lenQuestion) {
            const declaredVar = lenQuestion[1];
            const strValue = lenQuestion[2];
            const lenVar = lenQuestion[3];
            if (declaredVar === lenVar) return String(Array.from(strValue).length);
        }

        return null;
    };

    // --- HIGHLIGHT MCQ ANSWERS ---
    const highlightAnswers = (questionText) => {
        let correctAnswers = getSmartAnswer(questionText);
        if (!correctAnswers) correctAnswers = [];
        correctAnswers = Array.isArray(correctAnswers) ? correctAnswers : [correctAnswers];

        const labels = document.querySelectorAll('#choix label.choix');
        if (!labels || labels.length === 0) return;

        if (correctAnswers.length === 0) {
            labels.forEach(label => {
                const answerDiv = label.querySelector('.mixer');
                if (!answerDiv) return;
                answerDiv.style.color = 'orange';
                label.style.borderColor = 'orange';
            });
            return;
        }

        labels.forEach(label => {
            const answerDiv = label.querySelector('.mixer');
            if (!answerDiv) return;
            const text = answerDiv.textContent.trim();
            const input = document.getElementById(label.getAttribute('for'));
            // If the correctAnswers items are not exact label text, attempt fuzzy compare
            const isCorrect = correctAnswers.some(ans => {
                if (ans === null || ans === undefined) return false;
                // stringify non-strings
                const ansStr = (typeof ans === 'string') ? ans : String(ans);
                return ansStr.trim() === text.trim();
            });
            if (isCorrect) {
                answerDiv.style.color = '#28a745';
                label.style.borderColor = '#28a745';
                if (input && !input.checked) input.click();
            } else {
                answerDiv.style.color = '#dc3545';
                label.style.borderColor = '#dc3545';
            }
        });
    };

    // --- FILL TEXT INPUTS ---
    const fillTextInputs = (questionText, codeSnippet) => {
        const answers = getSmartAnswer(questionText, codeSnippet);
        if (!answers && answers !== 0) return;
        const correctAnswers = Array.isArray(answers) ? answers : [answers];

        const inputs = document.querySelectorAll('input.form-control.reponse');
        if (!inputs || inputs.length === 0) return;

        inputs.forEach((input, i) => {
            if (correctAnswers[i] !== undefined) {
                input.value = correctAnswers[i];
                input.dispatchEvent(new Event('input', { bubbles: true }));
                // call validation triggers if present
                try { if (typeof input.onkeyup === 'function') input.onkeyup(); } catch (e) {}
                try { if (typeof input.onmouseenter === 'function') input.onmouseenter(); } catch (e) {}
            }
        });
    };

    // --- ADD FUSION NUMBERS ---
    const addFusionNumbers = (qElem) => {
        const questionText = qElem.textContent.trim();
        const answerMap = index[questionText];
        if (!answerMap) return;

        // determine numeric id from element id like texte-question-15
        const idParts = qElem.id ? qElem.id.split('-') : [];
        const qid = idParts.length >= 3 ? idParts[2] : null;
        if (!qid) return;

        const leftElems = [...qElem.closest('div[id^="cadre-formulaire"]').querySelectorAll(`.elem1-${qid}`)];
        const rightElems = [...qElem.closest('div[id^="cadre-formulaire"]').querySelectorAll(`.elem2-${qid}`)];

        let order = 1;
        leftElems.forEach(leftEl => {
            const leftText = leftEl.querySelector('.mixer')?.textContent.trim();
            if (!leftText || !answerMap[leftText]) return;

            const correctRightText = answerMap[leftText];

            const rightMatch = rightElems.find(rightEl => {
                const textEl = rightEl.querySelector('.mixer');
                return textEl && textEl.textContent.trim() === correctRightText;
            });

            if (rightMatch) {
                const textEl = rightMatch.querySelector('.mixer');
                const oldSpan = textEl.querySelector('.order-number');
                if (oldSpan) oldSpan.remove();

                const span = document.createElement('span');
                span.className = 'order-number';
                span.textContent = `${order}. `;
                span.style.fontWeight = 'bold';
                span.style.color = 'blue';
                textEl.prepend(span);

                order++;
            }
        });
    };

    // --- INJECT CSS ---
    const style = document.createElement('style');
    style.textContent = `
    #choix input[type="checkbox"]:checked + label.choix,
    #choix input[type="radio"]:checked + label.choix {
        background-color: #28a74656 !important;
        border-color: #28a745 !important;
    }
    #choix input[type="checkbox"]:checked + label.choix .mixer,
    #choix input[type="radio"]:checked + label.choix .mixer {
        color: #28a745 !important;
    }
    .order-number {
        font-weight: bold;
        color: blue;
        margin-right: 4px;
    }
    `;
    document.head.appendChild(style);

    // --- AUTO-CLICK START BUTTON (keeps behavior to open question overlay) ---
    document.querySelectorAll('[id^="question_overlay_btn-"]').forEach(btn => {
        if (btn.offsetParent !== null) btn.click();
    });

    // --- PROCESS QUESTION ---
    const processQuestion = (qElem) => {
        const questionText = qElem.textContent.trim();
        const codeEl = qElem.closest('div[id^="cadre-formulaire"]')?.querySelector('pre code.language-python');
        const codeSnippet = codeEl ? codeEl.textContent : null;

        console.log("Question detected:", questionText);

        highlightAnswers(questionText);
        fillTextInputs(questionText, codeSnippet);
        addFusionNumbers(qElem);
    };

    // --- FIRST QUESTION ---
    const questionElement = await waitForElement('.mixer[id^="texte-question"]');
    processQuestion(questionElement);

    // --- OBSERVE NEW QUESTIONS ---
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                const q = node.matches('.mixer[id^="texte-question"]')
                    ? node
                    : node.querySelector('.mixer[id^="texte-question"]');
                if (q) processQuestion(q);
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
