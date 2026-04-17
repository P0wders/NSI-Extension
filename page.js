(async () => {

const solved = new Set();
const pending = new Set();
let solving = false;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function decodeHTMLEntities(str){
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
}

function extractRegexAnswer(example, pattern){
    if(example && !/<[a-zA-Z]/.test(example)) return decodeHTMLEntities(example.trim());
    const wrapperMatch = example.match(/<(xml|js|css|html|code|pre|sql|py|php)>([\s\S]*?)<\/\1>/i);
    if(wrapperMatch) return decodeHTMLEntities(wrapperMatch[2].replace(/<[^>]+>/g, "").trim());
    try {
        let p = pattern.replace(/^\^/, "").replace(/\$$/, "");
        const groupMatch = p.match(/^\(([^)]+)\)[?*]?$/);
        if(groupMatch) return groupMatch[1].split("|")[0];
        p = p.replace(/\([^)]*\)\?/g, "");
        p = p.replace(/\(([^)|]*)\|?[^)]*\)/g, "$1");
        p = p.replace(/\\(.)/g, "$1");
        p = p.replace(/[?*+]/g, "");
        p = p.replace(/[<>]/g, "");
        return p.trim();
    } catch(e) { return ""; }
}

function getDOMAnswer(qid, inputIndex){
    const el = document.querySelector(`#message-reponse-attendue-${inputIndex}-${qid}`);
    if(!el) return null;
    const text = el.innerText || el.textContent || "";
    return text.replace(/^R[ée]ponses?\s+attendues?\s*:\s*/i, "").trim() || null;
}

async function waitForQ(qid){
    for(let i = 0; i < 50; i++){
        if(window.q && window.q[qid]) return true;
        await sleep(100);
    }
    return false;
}

function countInputs(qid){
    let count = 0;
    while(document.querySelector(`#reponse-${count+1}-${qid}`)) count++;
    return count || 1;
}

function isPythonQuestion(qid){
    return !!document.querySelector(`#qIdePy-${qid}`);
}

async function writeToEditor(qid, code){
    const editorEl = document.querySelector(`#qIdePy-${qid}-ide-python-editor`);
    if(!editorEl){ console.log('Editor element not found'); return; }

    const aceEditor = ace.edit(editorEl);
    const session = aceEditor.getSession();

    const listeners = session._eventRegistry?.change?.slice() || [];
    listeners.forEach(l => session.off('change', l));

    aceEditor.setValue(code, -1);
    aceEditor.clearSelection();

    await sleep(100);
    listeners.forEach(l => session.on('change', l));

    console.log('Code written into editor!');

    if(window.q?.[qid]?.valider_reponse){
        window.q[qid].valider_reponse();
    }
}

function applyHintFix(code, hint){
    const h = hint.toLowerCase();
    let lines = code.split('\n');

    if(h.includes('int(') || (h.includes('convertir') && h.includes('entier'))){
        lines = lines.map(line => {
            return line.replace(/^(\s*\w+\s*=\s*)(input\s*\((.+)\))/, '$1int($2)');
        });
    }

    if(h.includes('float(') || (h.includes('convertir') && h.includes('float'))){
        lines = lines.map(line => {
            return line.replace(/^(\s*\w+\s*=\s*)(input\s*\((.+)\))/, '$1float($2)');
        });
    }

    if(h.includes('str(') || (h.includes('convertir') && h.includes('cha'))){
        lines = lines.map(line => {
            return line.replace(/^(\s*\w+\s*=\s*)(\d+)$/, '$1str($2)');
        });
    }

    if(h.includes('indentation') || h.includes('indenté')){
        let insideBlock = false;
        lines = lines.map(line => {
            if(/^\s*(def |if |for |while |else:|elif )/.test(line)){
                insideBlock = true;
                return line;
            }
            if(insideBlock && line.trim() !== '' && !/^\s/.test(line)){
                return '    ' + line;
            }
            return line;
        });
    }

    if(h.includes('deux-points') || h.includes('manque') && h.includes(':')){
        lines = lines.map(line => {
            if(/^\s*(def |if |for |while |else|elif )/.test(line) && !line.trimEnd().endsWith(':')){
                return line.trimEnd() + ':';
            }
            return line;
        });
    }

    return lines.join('\n');
}

async function solvePython(qid){
    console.log('Solving Python IDE question:', qid);

    const qObj = window.q?.[qid];
    const valideAvec = qObj?.valide_avec ||
        document.body.innerHTML.match(/"valide_avec"\s*:\s*"([^"]*)"/)?.[1] || '';
    const valideTaille = parseInt(qObj?.valide_taille ||
        document.body.innerHTML.match(/"valide_taille"\s*:\s*(\d+)/)?.[1] || '0');

    let dummyCode;
    if(valideTaille === 1){
        if(valideAvec.includes('for'))        dummyCode = '[_ for _ in []]';
        else if(valideAvec.includes('while')) dummyCode = 'x = 0';
        else if(valideAvec.includes('def'))   dummyCode = 'def _(): pass';
        else                                  dummyCode = 'pass';
    } else {
        dummyCode = '# dummy\n';
        if(valideAvec){
            valideAvec.split(/[,;|\s]+/).filter(Boolean).forEach(kw => {
                if(kw === 'while')      dummyCode += 'while False:\n    pass\n';
                else if(kw === 'for')   dummyCode += 'for _ in []:\n    pass\n';
                else if(kw === 'def')   dummyCode += 'def _():\n    pass\n';
                else if(kw === 'if')    dummyCode += 'if False:\n    pass\n';
                else                    dummyCode += '# ' + kw + '\n';
            });
        }
    }

    const fdT = new FormData();
    fdT.append('target', 'question-python');
    fdT.append('op', 'request_tests');
    fdT.append('n', qid);
    fdT.append('code', dummyCode);
    fdT.append('mode', '1');

    const testsJson = await fetch('/chocolatine/serveur.php', { method: 'POST', body: fdT }).then(r => r.json());

    if(!testsJson?.data?.calls){
        console.log('request_tests failed:', testsJson);
        return;
    }

    const nbTests = testsJson.data.calls.length;
    console.log('Number of tests:', nbTests);

    let explication = null;
    let delay = 500;

    while(!explication){
        await sleep(delay);

        const fd = new FormData();
        fd.append('target', 'reponse');
        fd.append('op', 'reponse');
        fd.append('n', qid);
        fd.append('r_JSON', JSON.stringify(Array(nbTests).fill([''])));
        fd.append('mode', '1');
        fd.append('duree', '10');
        fd.append('user', '1');

        const result = await fetch('/chocolatine/serveur.php', { method: 'POST', body: fd }).then(r => r.json());

        if(!result.ok){
            delay = Math.min(delay * 2, 5000);
            console.log('Rate limited, retrying in ' + delay + 'ms...');
            continue;
        }

        if(result.data?.explication){
            explication = result.data.explication;
        } else if(!result.data?.reste_tentative){
            console.log('Could not retrieve solution');
            break;
        } else {
            delay = 500;
        }
    }

    if(!explication) return;

    let code = explication.match(/<py\s+pre>([\s\S]*?)<\/py>/)?.[1]?.trim()
            || explication.match(/<py>([\s\S]*?)<\/py>/)?.[1]?.trim();

    const looksLikeCode = code && (
        code.includes('=') || code.includes(':') ||
        code.includes('(') || code.includes('return')
    );

    if(!looksLikeCode){
        // No direct code — try hint-based fix on pre-filled code
        const initialCode = document.querySelector('#qIdePy-' + qid + '-ide-python-intial-inner-HTML')?.innerText?.trim();
        const hint = explication.replace(/<[^>]+>/g, '').trim();

        if(!initialCode){
            console.log('No code solution and no initial code found.');
            return;
        }

        const fixed = applyHintFix(initialCode, hint);
        if(fixed === initialCode){
            console.log('Could not auto-fix — manual editing required.');
            console.log('Hint:', hint);
            return;
        }

        console.log('Auto-fixed code:\n', fixed);
        await writeToEditor(qid, fixed);
        return;
    }

    // If solution doesn't contain a function definition,
    // prepend the initial first line (e.g. "tab = ") as context
    let finalCode = code;
    if(!/^\s*def\s+/m.test(code)){
        const initialCode = document.querySelector('#qIdePy-' + qid + '-ide-python-intial-inner-HTML')?.innerText || '';
        const firstLine = initialCode.split('\n')[0];
        if(firstLine) finalCode = firstLine + '\n    ' + code.trim();
    }

    console.log('Final solution:\n', finalCode);
    await writeToEditor(qid, finalCode);
}

async function solveQuestion(qid){
    if(solved.has(qid) || pending.has(qid)) return;
    pending.add(qid);

    const ready = await waitForQ(qid);
    if(!ready){
        console.log("solveQuestion: q[" + qid + "] never initialized");
        pending.delete(qid);
        return;
    }

    while(solving) await sleep(100);

    if(solved.has(qid)){
        pending.delete(qid);
        return;
    }

    solving = true;
    solved.add(qid);
    pending.delete(qid);

    try {
        if(isPythonQuestion(qid)){
            await solvePython(qid);
        } else {
            await _solve(qid);
        }
    } catch(e){
        console.log("solveQuestion error:", e);
    } finally {
        solving = false;
    }
}

async function _solve(qid){

    const continuer = document.querySelector('#btn-continuer-' + qid);
    if(continuer && !continuer.classList.contains("d-none")){
        continuer.click();
        return;
    }

    await sleep(300);

    // Detect evaluation mode (mode:2) from page param
    const evalMode = (typeof window.param !== 'undefined' && window.param.mode === 2);

    let res;
    if(evalMode){
        // Evaluation mode: use FormData with r=test and mode=2
        const fd = new FormData();
        fd.append('target', 'reponse');
        fd.append('op', 'reponse');
        fd.append('n', qid);
        fd.append('r', 'test');
        fd.append('mode', '2');
        fd.append('duree', '1');
        fd.append('user', '1');
        res = await fetch("/chocolatine/serveur.php", { method:"POST", body: fd });
    } else {
        const nbInputs = countInputs(qid);
        const testArray = JSON.stringify(Array(nbInputs).fill("test"));
        res = await fetch("/chocolatine/serveur.php",{
            method:"POST",
            headers:{ "Content-Type":"application/x-www-form-urlencoded" },
            body:new URLSearchParams({
                target:"reponse", op:"reponse", n:qid,
                r_JSON: testArray, mode:"1", duree:"1", user:"1"
            })
        });
    }

    const json = await res.json();
    const data = json.data || json;
    console.log("SERVER:", data);

    if(data.reponses_liste){
        for(let i = 0; i < data.reponses_liste.length; i++){
            let answer;
            const type    = (data.reponses_type    && data.reponses_type[i])    || "";
            const example = (data.reponses_exemple && data.reponses_exemple[i]) || "";
            const pattern = (data.reponses_liste[i] || [])[0] || "";

            if(type.includes("regex")){
                answer = extractRegexAnswer(example, pattern);
                if(!answer) answer = getDOMAnswer(qid, i + 1) || "";
            } else if(type.includes("liste")){
                answer = pattern;
            } else {
                const wrapperMatch = example.match(/<(xml|js|css|html|code|pre|sql|py|php)>([\s\S]*?)<\/\1>/i);
                if(wrapperMatch){
                    answer = decodeHTMLEntities(wrapperMatch[2].trim());
                } else {
                    answer = (data.reponses_liste[i] || []).join("");
                    answer = answer.replace(/<([a-zA-Z][^>]*)>([\s\S]*?)<\/\1>/g, "$2").trim();
                    answer = decodeHTMLEntities(answer);
                }
            }

            const input = document.querySelector('#reponse-' + (i+1) + '-' + qid);
            if(input){
                input.value = answer;
                if(window.q[qid].reponses) window.q[qid].reponses[i] = answer;
                console.log('TEXT input ' + (i+1) + ' [' + type + ']:', answer);
            }
        }
        window.q[qid].valider_reponse();
        return;
    }

    if(Array.isArray(data.correction) && Array.isArray(data.correction[0])){
        for(let g=1; g<data.correction.length; g++){
            const zone = document.querySelector('#elements-groupe-' + g + '-' + qid);
            for(const letter of data.correction[g]){
                const el = document.querySelector('#rep-' + letter + '-' + qid);
                if(el && zone) zone.appendChild(el);
            }
        }
        return;
    }

    if(data.mix && Object.keys(data.mix).some(k => k.endsWith("2"))){
        for(const key in data.mix){
            const value     = data.mix[key];
            const keyLetter = key.replace("2","");
            const valueEl   = document.querySelector('#rep-' + value + '-' + qid);
            const keyEl     = document.querySelector('#rep-' + keyLetter + '-' + qid);
            if(!valueEl || !keyEl) continue;
            const keyZone  = keyEl.closest('.drop-zone-for-value' + qid);
            if(!keyZone) continue;
            const cadMatch = keyZone.id.match(/^cad-(\d+)-(\d+)-/);
            if(!cadMatch) continue;
            const targetZone = cadMatch[1] === "1"
                ? document.querySelector('#cad-2-' + cadMatch[2] + '-' + qid)
                : keyZone;
            if(targetZone){
                targetZone.appendChild(valueEl);
                console.log('MATCH: moved #rep-' + value + '-' + qid + ' -> #' + targetZone.id);
            }
        }
        await sleep(200);
        return;
    }

    if(Array.isArray(data.correction) && data.correction.length > 0
        && document.querySelector('#cad-0-' + qid)){
        for(let i = 0; i < data.correction.length; i++){
            const letter = data.correction[i];
            const slot   = document.querySelector('#cad-' + i + '-' + qid);
            const el     = document.querySelector('#rep-' + letter + '-' + qid);
            if(slot && el){
                slot.appendChild(el);
                console.log('ORDER: moved #rep-' + letter + '-' + qid + ' -> #cad-' + i + '-' + qid);
            }
        }
        await sleep(200);
        window.q[qid].valider_reponse();
        return;
    }

    if(data.correction){
        const allInputs = Array.from(document.querySelectorAll(
            '#cadre-formulaire-' + qid + ' input.btn-check'
        ));
        const isMulti = allInputs.some(el => el.type === "checkbox");

        for(const letter of data.correction){
            let el = document.querySelector('#checkbox-' + letter + '-' + qid)
                  || document.querySelector('#btnradio-' + letter + '-' + qid);

            if(!el && data.choix_mix){
                const idx = data.choix_mix.indexOf(letter);
                if(idx !== -1) el = allInputs[idx] || null;
            }

            if(!el){ console.log("QCM: no element for", letter); continue; }

            if(isMulti){
                el.checked = true;
                el.dispatchEvent(new Event("change", {bubbles:true}));
            } else {
                el.click();
            }
            console.log("QCM CLICK:", el.id);
        }

        if(isMulti && typeof window.q[qid]?.valider_reponse === "function"){
            window.q[qid].valider_reponse();
        }
    }
}

// Single observer handling both training (DOM injection) and evaluation (class toggle) modes
new MutationObserver((mutations) => {
    for(const m of mutations){

        // Training mode: new #cadre-formulaire-{id} injected into DOM
        if(m.type === 'childList'){
            for(const node of m.addedNodes){
                if(node.nodeType !== 1) continue;
                let qid = null;
                if(node.id && node.id.startsWith('cadre-formulaire-')){
                    qid = node.id.replace('cadre-formulaire-', '');
                } else {
                    const inner = node.querySelector && node.querySelector('[id^="cadre-formulaire-"]');
                    if(inner) qid = inner.id.replace('cadre-formulaire-', '');
                }
                if(qid){
                    console.log('NEW QUESTION detected:', qid);
                    solveQuestion(qid);
                }
            }
        }

        // Evaluation mode: #block-{id} loses d-none class → question becomes visible
        if(m.type === 'attributes' && m.attributeName === 'class'){
            const node = m.target;
            if(node.id && node.id.startsWith('block-') && !node.classList.contains('d-none')){
                const qid = node.id.replace('block-', '');
                if(document.getElementById('cadre-formulaire-' + qid)){
                    console.log('BLOCK visible:', qid);
                    solveQuestion(qid);
                }
            }
        }
    }
}).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
});

// Training mode: solve question already on page at load time
const firstQid = window.q ? Object.keys(window.q).pop() : null;
if(firstQid) solveQuestion(firstQid);

// Evaluation mode: solve any already-visible block on page load
document.querySelectorAll('[id^="block-"]').forEach(block => {
    if(!block.classList.contains('d-none')){
        const qid = block.id.replace('block-', '');
        if(document.getElementById('cadre-formulaire-' + qid)){
            solveQuestion(qid);
        }
    }
});

})();