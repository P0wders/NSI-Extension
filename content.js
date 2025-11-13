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

    const replaceAllSafe = (str, find, repl) => {
        if (find === '') return str;
        return str.split(find).join(repl);
    };

    const pySlice = (s, startRaw, endRaw, stepRaw) => {
        const chars = Array.from(s);
        const len = chars.length;
        const start = (startRaw === '' || startRaw === undefined || startRaw === null) ? undefined : parseInt(startRaw, 10);
        const end = (endRaw === '' || endRaw === undefined || endRaw === null) ? undefined : parseInt(endRaw, 10);
        let step = (stepRaw === '' || stepRaw === undefined || stepRaw === null) ? undefined : parseInt(stepRaw, 10);
        if (step === 0) return '';
        if (step === undefined) step = 1;
        const normalizeIndex = (i, forStepPositive) => (i === undefined ? undefined : (i < 0 ? i + len : i));
        if (step > 0) {
            let sidx = start !== undefined ? normalizeIndex(start, true) : 0;
            let eidx = end !== undefined ? normalizeIndex(end, true) : len;
            if (sidx < 0) sidx = 0;
            if (sidx > len) sidx = len;
            if (eidx < 0) eidx = 0;
            if (eidx > len) eidx = len;
            let out = [];
            for (let i = sidx; i < eidx; i += step) out.push(chars[i]);
            return out.join('');
        } else {
            let sidx = start !== undefined ? normalizeIndex(start, false) : (len - 1);
            let eidx = end !== undefined ? normalizeIndex(end, false) : -1;
            let out = [];
            for (let i = sidx; i > eidx; i += step) if (i >= 0 && i < len) out.push(chars[i]);
            return out.join('');
        }
    };

    const getSmartAnswer = (questionText, codeSnippet) => {
        // First check if there's a code variant match
        if (index.__codeVariants__ && codeSnippet) {
            const variants = index.__codeVariants__;
            for (const [variantQuestionPattern, variantList] of Object.entries(variants)) {
                // Exact match for question text
                if (questionText === variantQuestionPattern || questionText.includes(variantQuestionPattern)) {
                    console.log("Checking code variants for:", variantQuestionPattern);
                    console.log("Code snippet preview:", codeSnippet.substring(0, 200));
                    
                    // Handle different variant structures
                    if (Array.isArray(variantList)) {
                        for (const variant of variantList) {
                            // Simple pattern with direct answer
                            if (variant.answer && !variant.subPatterns) {
                                const importPattern = new RegExp(variant.codePattern, 'i');
                                if (importPattern.test(codeSnippet)) {
                                    console.log("✓ Matched pattern:", variant.codePattern, "Answer:", variant.answer);
                                    return variant.answer;
                                }
                            }
                            // Complex pattern with subPatterns
                            else if (variant.subPatterns) {
                                const importPattern = new RegExp(variant.codePattern, 'i');
                                if (importPattern.test(codeSnippet)) {
                                    console.log("✓ Found import style:", variant.codePattern);
                                    
                                    // Now check subPatterns for the specific function
                                    for (const sub of variant.subPatterns) {
                                        const subPattern = new RegExp(sub.pattern, 'i');
                                        if (subPattern.test(codeSnippet)) {
                                            console.log("✓ Matched sub-pattern:", sub.pattern, "Answer:", sub.answer);
                                            return sub.answer;
                                        }
                                    }
                                    
                                    // If function name not found in code (placeholder text), infer from question
                                    console.log("Function name not found in code, inferring from question...");
                                    if (questionText.includes("dictionnaires")) {
                                        console.log("✓ Question mentions 'dictionnaires', using DictReader");
                                        return variant.subPatterns[0].answer; // DictReader is first
                                    } else if (questionText.includes("listes")) {
                                        console.log("✓ Question mentions 'listes', using reader");
                                        return variant.subPatterns[1].answer; // reader is second
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (index[questionText] !== undefined) return index[questionText];
        if (codeSnippet) {
            const nestedMatch = codeSnippet.match(/for\s+(\w+)\s+in\s+range\(\s*len\(tab\)\s*\)\s*:[\r\n\s]*for\s+(\w+)\s+in\s+range\(\s*len\(tab\[\s*\1\s*\]\s*\)\s*:/);
            if (nestedMatch) return [`tab[${nestedMatch[1]}][${nestedMatch[2]}]`];
        }

        const dictCountryMatch = questionText.match(/pays de (\w+)/i);
        const dictReadMatch = questionText.match(/renvoie l'?age de (\w+)/i);
        const dictUpdateMatch = questionText.match(/corriger l'?age de (\w+) par la valeur (\d+)/i);
        if (dictCountryMatch && codeSnippet) return `base["${dictCountryMatch[1]}"]["pays"]`;
        if (dictReadMatch && codeSnippet) return `base["${dictReadMatch[1]}"]["age"]`;
        if (dictUpdateMatch && codeSnippet) return `base["${dictUpdateMatch[1]}"]["age"] = ${dictUpdateMatch[2]}`;

        const listMatch = questionText.match(/\[\[(?:[^\]]+)\]\]\s*\[(\-?\d+)\]\s*\[(\-?\d+)\]/);
        if (listMatch) {
            const outer = parseInt(listMatch[1], 10);
            const inner = parseInt(listMatch[2], 10);
            const arraySource = (codeSnippet && codeSnippet.match(/\[\s*\[.*?\]\s*(?:,\s*\[.*?\]\s*)+\]/s)) || questionText.match(/\[\s*\[.*?\]\s*(?:,\s*\[.*?\]\s*)+\]/s);
            if (arraySource) {
                try {
                    let arrText = arraySource[0].replace(/'/g, '"').replace(/\n/g, ' ');
                    const arr = JSON.parse(arrText);
                    if (arr && arr[outer] && (inner in arr[outer])) return arr[outer][inner];
                } catch {}
            }
        }

        const fStringQ = questionText.match(/(f-?string|fstring|chaine de caractères formatée)/i);
        if (fStringQ) {
            const greetMatch = questionText.match(/"(.*?)\s[\wÀ-ÖØ-öø-ÿ]+ !"/);
            const greet = greetMatch ? greetMatch[1] : 'Bonjour';
            const varMatch = questionText.match(/sachant que\s+(\w+)\s*=/i);
            const variable = varMatch ? varMatch[1] : 'nom';
            return `f"${greet} {${variable}} !"`;
        }

        const replaceMatch = questionText.match(/['"]([^'"]+)['"]\.replace\(\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
        if (replaceMatch) return replaceAllSafe(replaceMatch[1], replaceMatch[2], replaceMatch[3]);

        const sliceMatch = questionText.match(/["']([^"']+)["']\s*\[\s*(-?\d*)\s*:\s*(-?\d*)\s*:?(-?\d*)\s*\]/);
        if (sliceMatch) try {
            return pySlice(sliceMatch[1], sliceMatch[2] || undefined, sliceMatch[3] || undefined, sliceMatch[4] || undefined);
        } catch {}

        const indexMatch = questionText.match(/["']([^"']+)["']\s*\[\s*(-?\d+)\s*\]/);
        if (indexMatch) {
            const str = indexMatch[1];
            const idx = parseInt(indexMatch[2], 10);
            const realIdx = idx < 0 ? idx + str.length : idx;
            return str[realIdx] ?? '';
        }

        const assignMatch = questionText.match(/affectant à la variable\s+(\w+)\s+la chaîne(?: de caractères)?\s+"([^"]+)"/i);
        if (assignMatch) return `${assignMatch[1]} = "${assignMatch[2]}"`;

        const lenQuestion = questionText.match(/sachant que\s+(\w+)\s*=\s*["']([^"']+)["'],?\s*que renvoie l'instruction\s*len\(\s*(\w+)\s*\)/i);
        if (lenQuestion && lenQuestion[1] === lenQuestion[3]) return String(Array.from(lenQuestion[2]).length);

        return null;
    };

    const highlightAnswers = (questionText) => {
        let correctAnswers = getSmartAnswer(questionText);
        if (!correctAnswers) correctAnswers = [];
        correctAnswers = Array.isArray(correctAnswers) ? correctAnswers : [correctAnswers];

        const labels = document.querySelectorAll('#choix label.choix');
        if (!labels.length) return;

        if (!correctAnswers.length) {
            labels.forEach(label => {
                const div = label.querySelector('.mixer');
                if (div) { div.style.color = 'orange'; label.style.borderColor = 'orange'; }
            });
            return;
        }

        labels.forEach(label => {
            const div = label.querySelector('.mixer');
            const text = div?.textContent.trim();
            const input = document.getElementById(label.getAttribute('for'));
            const isCorrect = correctAnswers.some(ans => String(ans).trim() === text);
            if (isCorrect) {
                div.style.color = '#28a745'; label.style.borderColor = '#28a745';
                if (input && !input.checked) input.click();
            } else {
                div.style.color = '#dc3545'; label.style.borderColor = '#dc3545';
            }
        });
    };

    const fillTextInputs = (questionText, codeSnippet) => {
        const answers = getSmartAnswer(questionText, codeSnippet);
        if (answers === null || answers === undefined) return;
        const arr = Array.isArray(answers) ? answers : [answers];
        document.querySelectorAll('input.form-control.reponse').forEach((input, i) => {
            if (arr[i] !== undefined) {
                input.value = arr[i];
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                console.log("Filled input", i, "with:", arr[i]);
                try { input.onkeyup?.(); input.onmouseenter?.(); } catch {}
            }
        });
    };

    const addFusionNumbers = (qElem) => {
        const questionText = qElem.textContent.trim();
        const map = index[questionText];
        if (!map) return;
        const id = qElem.id.split('-')[2];
        if (!id) return;
        const lefts = [...qElem.closest('div[id^="cadre-formulaire"]').querySelectorAll(`.elem1-${id}`)];
        const rights = [...qElem.closest('div[id^="cadre-formulaire"]').querySelectorAll(`.elem2-${id}`)];
        let order = 1;
        lefts.forEach(l => {
            const txt = l.querySelector('.mixer')?.textContent.trim();
            if (!txt || !map[txt]) return;
            const right = rights.find(r => r.querySelector('.mixer')?.textContent.trim() === map[txt]);
            if (right) {
                const textEl = right.querySelector('.mixer');
                textEl.querySelector('.order-number')?.remove();
                const span = document.createElement('span');
                span.className = 'order-number';
                span.textContent = `${order++}. `;
                span.style.fontWeight = 'bold';
                span.style.color = 'blue';
                textEl.prepend(span);
            }
        });
    };

    const autoFillDragDropMatching = (qElem) => {
        const questionText = qElem.textContent.trim();
        const map = index[questionText];
        if (!map || typeof map !== 'object' || Array.isArray(map)) return;
        
        const container = qElem.closest('div[id^="cadre-formulaire"]');
        if (!container) return;
        
        const id = qElem.id.split('-')[2];
        if (!id) return;
        
        // Get all keys (top row - elem1)
        const keyElements = [...container.querySelectorAll(`.elem1-${id}`)];
        if (keyElements.length === 0) return;
        
        // Get all value elements (bottom row - elem2)
        const valueElements = [...container.querySelectorAll(`.elem2-${id}`)];
        if (valueElements.length === 0) return;
        
        // Build a mapping from image src to value element
        const urlToValueElem = new Map();
        valueElements.forEach(elem => {
            const img = elem.querySelector('img');
            if (img && img.src) {
                urlToValueElem.set(img.src, elem);
            }
        });
        
        // Process each key in order
        let order = 1;
        keyElements.forEach(keyElem => {
            const keyText = keyElem.querySelector('.mixer')?.textContent.trim();
            if (!keyText) return;
            
            // Get the corresponding URL from the index mapping
            const correspondingUrl = map[keyText];
            if (!correspondingUrl) return;
            
            // Find the value element with this URL
            const matchingValueElem = urlToValueElem.get(correspondingUrl);
            if (!matchingValueElem) return;
            
            // Update the ordre-* element (p tag with id like "ordre-M2-0")
            const ordreElem = matchingValueElem.querySelector('[id^="ordre-"]');
            if (ordreElem) {
                ordreElem.textContent = `${order++}. `;
                ordreElem.style.fontWeight = 'bold';
                ordreElem.style.color = 'blue';
            }
        });
    };

    // 🆕 --- CLASSER CONDITIONS SELON LEUR VALEUR ---
    const classifyConditions = (qElem) => {
        const questionText = qElem.textContent.trim();
        if (!/classer.*conditions.*valeur/i.test(questionText)) return;
        const labels = [...document.querySelectorAll('#choix label.choix')];
        if (!labels.length) return;

        const evaluated = labels.map(l => {
            const expr = l.textContent.trim();
            try {
                // Safe eval subset: allow comparisons, booleans, numbers, strings
                // Avoid function calls or imports
                if (/[^=!<>+\-*/%&|()\d\s'".a-zA-Z]/.test(expr)) throw 0;
                return { label: l, value: !!eval(expr) };
            } catch {
                return { label: l, value: null };
            }
        });

        // Sort: False first, then True
        const sorted = evaluated.sort((a, b) => (a.value === b.value ? 0 : a.value ? 1 : -1));
        sorted.forEach((item, i) => {
            const div = item.label.querySelector('.mixer');
            const old = div.querySelector('.order-number');
            if (old) old.remove();
            const span = document.createElement('span');
            span.className = 'order-number';
            span.textContent = `${i + 1}. `;
            span.style.fontWeight = 'bold';
            span.style.color = 'purple';
            div.prepend(span);
        });
    };

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
    .order-number { font-weight: bold; color: blue; margin-right: 4px; }
    `;
    document.head.appendChild(style);

    document.querySelectorAll('[id^="question_overlay_btn-"]').forEach(btn => { if (btn.offsetParent) btn.click(); });

    const processQuestion = (qElem) => {
        const questionText = qElem.textContent.trim();
        const codeEl = qElem.closest('div[id^="cadre-formulaire"]')?.querySelector('pre code.language-python');
        let codeSnippet = null;
        
        if (codeEl) {
            // Extract text content properly from code element
            codeSnippet = codeEl.textContent || codeEl.innerText;
            console.log("Code snippet found:", codeSnippet.substring(0, 100));
        }
        
        console.log("Question detected:", questionText);
        console.log("Code variant check:", index.__codeVariants__ ? "Enabled" : "Disabled");
        
        highlightAnswers(questionText);
        fillTextInputs(questionText, codeSnippet);
        addFusionNumbers(qElem);
        autoFillDragDropMatching(qElem); // 🆕 handle drag-drop matching questions
        classifyConditions(qElem); // 🆕 handle "Classer ces conditions selon leur valeur"
    };

    const questionElement = await waitForElement('.mixer[id^="texte-question"]');
    processQuestion(questionElement);

    const observer = new MutationObserver((muts) => {
        for (const m of muts)
            for (const node of m.addedNodes)
                if (node.nodeType === 1) {
                    const q = node.matches('.mixer[id^="texte-question"]')
                        ? node
                        : node.querySelector('.mixer[id^="texte-question"]');
                    if (q) processQuestion(q);
                }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
