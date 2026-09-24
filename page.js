// Update notice: content.js compares the installed version with the one on
// GitHub and fires this event when they differ.
window.addEventListener("chocolatine-helper-update", (e) => {
    const { local, remote } = JSON.parse(e.detail);
    const url = "https://github.com/P0wders/NSI-Extension";
    const tps = 30;                                // seconds on screen
    let tries = 0;
    (function show(){
        // alertify is loaded by the site and may not be ready yet
        if(!window.alertify){
            if(++tries < 50) setTimeout(show, 200);
            return;
        }
        alertify.set('notifier', 'position', 'bottom-right');
        const n = alertify.warning(
            `🍫 <b>New version available!</b><br>Version ${remote} is out (you have ${local}), click here to see what's new.` +
            `<div class='alertify-progress-bar' style='background-color:#FFC107;animation:progressBar ${tps}s linear;'></div>`,
            tps,
            (isClicked) => { if (isClicked) window.open(url, "_blank", "noopener"); }
        );
        n.element.style.cursor = "pointer";
    })();
});

(async () => {

const solved = new Set();
const pending = new Set();
let solving = false;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// Strip the blank edges and the common leading indentation of a code block —
// a plain trim() would only unindent the first line and break the alignment.
function dedent(code){
    const lines = code.replace(/\r\n?/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
    const indents = lines.filter(l => l.trim()).map(l => l.match(/^[ \t]*/)[0].length);
    const min = indents.length ? Math.min(...indents) : 0;
    return lines.map(l => l.slice(min)).join("\n");
}

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

// The page also reveals each expected answer inside the question text itself:
//   <code class="aff-reponse aff-reponse-1-219">mutateur</code>
// As long as an answer is not revealed the element still holds the placeholder
// ("Réponse 2"), which must not be typed into the input.
function getRevealedAnswer(qid, inputIndex){
    const el = document.querySelector(`.aff-reponse-${inputIndex}-${qid}`);
    if(!el) return null;
    const text = (el.innerText || el.textContent || "").trim();
    if(!text) return null;
    if(/^R[ée]ponse\s*\d*$/i.test(text)) return null;
    const input = document.querySelector(`#reponse-${inputIndex}-${qid}`);
    if(input && text === (input.placeholder || "").trim()) return null;
    return text;
}

async function waitForQ(qid){
    for(let i = 0; i < 50; i++){
        if(window.q && window.q[qid]) return true;
        await sleep(100);
    }
    return false;
}

// Mirror the page's own logic: the focused question (param.qn_focus) wins,
// falling back to the current question (param.qn). Nothing is sent when both are 0.
function getFocusedQid(fallbackQid){
    const p = window.param;
    if(!p) return fallbackQid;
    const n = p.qn_focus !== 0 ? p.qn_focus : p.qn;
    if(n === 0 || n === undefined || n === null) return fallbackQid;
    return +n;
}

function getQuestionMode(n){
    return (window.q && window.q[n] && window.q[n].mode) || 1;
}

function countInputs(qid){
    let count = 0;
    while(document.querySelector(`#reponse-${count+1}-${qid}`)) count++;
    return count || 1;
}

function isPythonQuestion(qid){
    return !!document.querySelector(`#qIdePy-${qid}`);
}

// Preferred writer: goes through window.pythonIDE (the page's own editor registry).
// _pythonIdeSkipLockedGuard disables the locked-editor guard for this one setValue,
// syncEditorRowGuard keeps the page's row guard in sync, and refreshing q[n].last_code
// keeps the nocp "big jump" check from reverting the write.
function writeViaPythonIDE(qid, code){
    const ideId = `qIdePy-${qid}`;
    const editor = window.pythonIDE?.editors?.get(ideId);
    if(!editor) return false;

    editor._pythonIdeSkipLockedGuard = true;
    editor.setValue(code, 1);          // 1 = cursor at end
    editor._pythonIdeSkipLockedGuard = false;
    window.pythonIDE.syncEditorRowGuard?.(ideId, code);

    // Keep the nocp check from seeing a big jump and reverting it
    if(window.q?.[qid]){
        window.q[qid].last_code = code;
        window.q[qid].valider_reponse();  // re-runs valide_sans / valide_taille and enables "Valider"
    }
    return true;
}

async function writeToEditor(qid, code){
    if(writeViaPythonIDE(qid, code)){
        console.log('Code written into editor (pythonIDE)!');
        return;
    }

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

// Placeholder left in a skeleton the student has to complete. Two shapes:
//   - a whole line: "..." or "... à compléter ..."
//   - embedded in a line: "return ... à compléter ..."
const BLANK_RE = /^\s*\.\.\.(?:\s*(?:à|a)\s*compl[ée]ter\s*\.\.\.)?\s*$/i;
const EMBEDDED_BLANK_RE = /\.\.\.(?:\s*(?:à|a)\s*compl[ée]ter\s*\.\.\.)?/i;
function lineHasBlank(line){ return BLANK_RE.test(line) || EMBEDDED_BLANK_RE.test(line); }
function codeHasBlank(code){ return code.split(String.fromCharCode(10)).some(lineHasBlank); }

function getInitialCode(qid){
    const el = document.querySelector('#qIdePy-' + qid + '-ide-python-intial-inner-HTML');
    if(!el) return "";
    return (el.textContent || "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
}

const normLine = line => line.trim().replace(/\s+/g, ' ');

// Split code into its def blocks: {name, indent, bodyStart, bodyEnd, body}.
// A block ends at the first non-blank line indented at or below the def itself.
function indexDefs(code){
    const lines = code.split('\n');
    const defs = [];
    let current = null;

    const close = end => {
        if(!current) return;
        while(end > current.bodyStart && !lines[end-1].trim()) end--;
        current.bodyEnd = end;
        current.body = lines.slice(current.bodyStart, end);
        current = null;
    };

    for(let i = 0; i < lines.length; i++){
        const header = lines[i].match(/^([ \t]*)def\s+([A-Za-z_]\w*)\s*\(/);
        if(header){
            close(i);
            current = {name: header[2], indent: header[1].length, bodyStart: i + 1};
            defs.push(current);
            continue;
        }
        if(current && lines[i].trim() && lines[i].match(/^[ \t]*/)[0].length <= current.indent){
            close(i);
        }
    }
    close(lines.length);
    return defs;
}

// Produce the body of one skeleton method with its blanks replaced by the
// matching lines of the solution. Returns null when nothing could be filled.
function mergeBody(skelBody, solBody){
    const out = [];
    let filled = false;

    // Same number of lines: the solution is the skeleton with the blanks completed,
    // so line k answers line k. This is the usual shape of these exercises.
    if(skelBody.length === solBody.length){
        for(let i = 0; i < skelBody.length; i++){
            const line = skelBody[i];
            if(!lineHasBlank(line)){ out.push(line); continue; }
            const replacement = solBody[i].trim();
            if(!replacement){ out.push(line); continue; }
            const indent = line.match(/^[ \t]*/)[0];
            if(BLANK_RE.test(line)){
                out.push(indent + replacement);
            } else {
                // Embedded blank ("return ... à compléter ..."): keep the code
                // before the marker and graft on the solution's completion.
                const m = line.match(new RegExp('^(.*?)(' + EMBEDDED_BLANK_RE.source + ')(.*)$', 'i'));
                const head = m[1], tail = m[3];
                const headTrim = head.trim();
                let completion = replacement;
                if(headTrim && replacement.startsWith(headTrim)){
                    completion = replacement.slice(headTrim.length);
                } else if(headTrim){
                    // Head may end mid-statement — align on its last token.
                    const tok = headTrim.split(/\s+/).pop();
                    const k = replacement.indexOf(tok);
                    if(k !== -1) completion = replacement.slice(k + tok.length);
                }
                out.push(head + (/\s$/.test(head) ? completion.replace(/^\s+/, '') : completion) + tail);
            }
            filled = true;
        }
        return filled ? out : null;
    }

    // Otherwise anchor on the lines the two versions share and take whatever sits
    // between them in the solution — this covers a blank filled by several lines.
    let j = 0;
    for(let i = 0; i < skelBody.length; i++){
        const line = skelBody[i];
        if(!lineHasBlank(line)){
            out.push(line);
            const k = solBody.findIndex((l, idx) => idx >= j && normLine(l) === normLine(line));
            if(k !== -1) j = k + 1;
            continue;
        }

        const anchor = skelBody.slice(i + 1).find(l => l.trim() && !lineHasBlank(l));
        let end = solBody.length;
        if(anchor){
            const k = solBody.findIndex((l, idx) => idx >= j && normLine(l) === normLine(anchor));
            if(k === -1){ out.push(line); continue; }   // lost the alignment: keep the blank
            end = k;
        }

        const chunk = solBody.slice(j, end).filter(l => l.trim());
        if(!chunk.length){ out.push(line); continue; }

        const blankIndent = line.match(/^[ \t]*/)[0];
        const chunkBase = Math.min(...chunk.map(l => l.match(/^[ \t]*/)[0].length));
        chunk.forEach(l => out.push(blankIndent + l.slice(chunkBase)));
        j = end;
        filled = true;
    }
    return filled ? out : null;
}

// The example answer often comes from another variant of the same question, where
// the attribute goes by a different name (self.contenu vs self.valeurs). When the
// solution uses exactly one unknown name and exactly one of the skeleton's own
// attributes is left untouched, the mapping between them is unambiguous.
function remapAttributes(skeleton, solution){
    const attrs   = new Set([...skeleton.matchAll(/self\.(\w+)\s*=(?!=)/g)].map(m => m[1]));
    const methods = new Set([...skeleton.matchAll(/def\s+(\w+)\s*\(/g)].map(m => m[1]));
    const used    = new Set([...solution.matchAll(/self\.(\w+)/g)].map(m => m[1]));

    const unknown = [...used].filter(name => !attrs.has(name) && !methods.has(name));
    if(unknown.length !== 1) return solution;

    // Prefer the attribute the solution never mentions; failing that — the example
    // may use both names at once — the only one holding a collection.
    let target = [...attrs].filter(name => !used.has(name));
    if(target.length !== 1){
        target = [...skeleton.matchAll(/self\.(\w+)\s*=\s*(?:\[\s*\]|\{\s*\}|\(\s*\)|list\(\)|dict\(\)|set\(\))/g)]
            .map(m => m[1]);
        target = [...new Set(target)];
    }
    if(target.length !== 1) return solution;

    console.log('Solution uses self.' + unknown[0] + ', skeleton declares self.' + target[0] + ' — renaming');
    return solution.replace(new RegExp('self\\.' + unknown[0] + '\\b', 'g'), 'self.' + target[0]);
}

// "Fill in the blanks" question: keep the given skeleton and only complete the
// "... à compléter ..." lines. Overwriting the editor with the server's example
// would drop the surrounding class and rename its attributes, which fails the tests.
function fillBlanks(skeleton, solution){
    if(!codeHasBlank(skeleton)) return null;

    solution = remapAttributes(skeleton, solution);
    const lines   = skeleton.split('\n');
    const solDefs = indexDefs(solution);
    let filled = false;

    // Last def first, so an earlier splice never shifts a later def's line numbers
    for(const def of indexDefs(skeleton).reverse()){
        if(!def.body.some(lineHasBlank)) continue;
        const match = solDefs.find(d => d.name === def.name);
        if(!match) continue;
        const merged = mergeBody(def.body, match.body);
        if(!merged) continue;
        lines.splice(def.bodyStart, def.bodyEnd - def.bodyStart, ...merged);
        filled = true;
    }

    // A skeleton with a single blank and a solution that is just the missing
    // expression (no def to match on) is still worth completing.
    if(!filled && !solDefs.length){
        const blanks = lines.filter(lineHasBlank).length;
        const body   = solution.trim();
        if(blanks === 1 && body && !body.includes('\n')){
            const i = lines.findIndex(lineHasBlank);
            lines[i] = lines[i].match(/^[ \t]*/)[0] + body;
            filled = true;
        }
    }

    return filled ? lines.join('\n') : null;
}

// The solution can come back in several places depending on the question and on
// which attempt revealed it:
//   - explication         : usually HTML, with the code inside <py> / <py pre>
//   - reponses_exemples   : array of raw Python (no markup) — sent on the last attempt
//   - reponses_exemple    : singular variant used by the text questions
// Returns the first one that actually holds code.
function extractPythonSolution(data){
    if(!data) return null;

    const sources = [];
    if(data.explication) sources.push(data.explication);
    for(const key of ["reponses_exemples", "reponses_exemple", "solution", "correction"]){
        const value = data[key];
        if(Array.isArray(value)) sources.push(...value.filter(v => typeof v === "string" && v.trim()));
        else if(typeof value === "string" && value.trim()) sources.push(value);
    }

    for(const source of sources){
        let code = source.match(/<py\s+pre>([\s\S]*?)<\/py>/)?.[1]
                || source.match(/<py>([\s\S]*?)<\/py>/)?.[1]
                || source.match(/<(?:pre|code)[^>]*>([\s\S]*?)<\/(?:pre|code)>/i)?.[1];

        // Raw code with no markup around it (reponses_exemples) is usable as-is
        if(code === undefined && !/<[a-zA-Z][^>]*>/.test(source)) code = source;
        if(code === undefined) continue;

        code = dedent(decodeHTMLEntities(code));
        const looksLikeCode = code && (
            code.includes('=') || code.includes(':') ||
            code.includes('(') || code.includes('return')
        );
        if(looksLikeCode) return code;
    }
    return null;
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

    const n0 = getFocusedQid(qid);
    const qMode = getQuestionMode(n0);

    let testsJson;
    if(typeof serveur === "function"){
        testsJson = await serveur("question-python", {op:"request_tests", n:qid, code:dummyCode, mode:qMode});
    } else {
        const fdT = new FormData();
        fdT.append('target', 'question-python');
        fdT.append('op', 'request_tests');
        fdT.append('n', qid);
        fdT.append('code', dummyCode);
        fdT.append('mode', String(qMode));
        testsJson = await fetch('/chocolatine/serveur.php', { method: 'POST', body: fdT }).then(r => r.json());
    }

    if(!testsJson?.data?.calls){
        console.log('request_tests failed:', testsJson);
        return;
    }

    const nbTests = testsJson.data.calls.length;
    console.log('Number of tests:', nbTests);

    let code = null;
    let explication = null;
    let delay = 500;

    while(!code){
        await sleep(delay);

        let result;
        if(typeof serveur === "function"){
            // r:"0" burns one attempt, same as the old empty r_JSON submission
            result = await serveur("reponse", {op:"reponse", n:+n0, r:"0", mode:qMode, duree:1, user:1});
        } else {
            const fd = new FormData();
            fd.append('target', 'reponse');
            if(typeof get_csrf_token === "function") fd.append('csrf_token', get_csrf_token());
            fd.append('op', 'reponse');
            fd.append('n', qid);
            fd.append('r_JSON', JSON.stringify(Array(nbTests).fill([''])));
            fd.append('mode', String(qMode));
            fd.append('duree', '10');
            fd.append('user', '1');
            result = await fetch('serveur.php', { method: 'POST', body: fd }).then(r => r.json());
        }

        if(!result.ok){
            const secs = Array.isArray(result.notifier) && +result.notifier[2] > 0 ? +result.notifier[2] : 0;
            delay = secs ? secs * 1000 + 200 : Math.min(delay * 2, 5000);
            console.log('Request refused, retrying in ' + delay + 'ms...');
            continue;
        }

        if(result.data?.explication) explication = result.data.explication;

        // The solution may arrive as <py> markup in explication or as raw code
        // in reponses_exemples, depending on the question and the attempt.
        code = extractPythonSolution(result.data);
        if(code) break;

        if(!result.data?.reste_tentative){
            console.log('Server returned no solution:', result.data);
            break;
        }
        delay = 500;
    }

    if(!code){
        // No direct code — try hint-based fix on pre-filled code
        const initialCode = getInitialCode(qid).trim();
        const hint = (explication || "").replace(/<[^>]+>/g, '').trim();

        if(!hint){
            console.log('No solution and no hint returned — nothing to write.');
            return;
        }

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

    const initial = getInitialCode(qid);

    // Fill-in-the-blanks question: complete the skeleton instead of replacing it
    const completed = fillBlanks(initial, code);
    if(completed){
        console.log('Completed the skeleton in place:\n', completed);
        await writeToEditor(qid, completed);
        return;
    }
    if(codeHasBlank(initial)){
        console.log('Skeleton has blanks but none could be matched to the solution — writing it whole');
    }

    // If solution doesn't contain a function definition,
    // prepend the initial first line (e.g. "def f(x):" or "tab = ") as context
    let finalCode = code;
    if(!/^\s*def\s+/m.test(code)){
        const initialCode = initial;
        const firstLine = initialCode.split('\n')[0];
        if(firstLine){
            // When that line opens a block, the whole solution is its body: every
            // line has to be indented, not just the first, or Python won't parse it.
            const body = firstLine.trimEnd().endsWith(':')
                ? code.split('\n').map(line => line.trim() ? '    ' + line : line).join('\n')
                : code;
            finalCode = firstLine + '\n' + body;
        }
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

    // The server now expects the focused question number and its real mode,
    // via the page's own serveur() helper:
    //   n    = param.qn_focus !== 0 ? param.qn_focus : param.qn
    //   mode = q[n].mode
    const n = getFocusedQid(qid);
    const mode = getQuestionMode(n);

    // The server mirrors the answers we post: reponses_liste / reponses_type /
    // reponses_exemple come back with exactly as many entries as it decoded. A
    // 2-input question therefore has to be probed with 2 dummy values.
    const nbInputs = countInputs(qid);

    // serveur() (app.js) encodes the payload itself: an array value is posted as
    // <key>_JSON, a scalar as <key>, and a key already ending in _JSON is
    // JSON.stringify'd a *second* time. Passing r_JSON: JSON.stringify([...])
    // therefore reaches the server as the string '["0","0"]' — one answer, not two.
    async function submitViaServeur(){
        return await serveur("reponse", {
            op:"reponse", n:+n, mode:mode, duree:1, user:1,
            r: nbInputs > 1 ? Array(nbInputs).fill("0") : "0"
        });
    }

    // Fallback encoding: repeated r[] fields, which is how PHP itself builds an
    // array out of a POST. Used when the r_JSON array came back under-decoded.
    async function submitViaFormData(){
        const fd = new FormData();
        fd.append('target', 'reponse');
        if(typeof get_csrf_token === "function") fd.append('csrf_token', get_csrf_token());
        fd.append('op', 'reponse');
        fd.append('n', String(n));
        fd.append('mode', String(mode));
        fd.append('duree', '1');
        fd.append('user', '1');
        if(nbInputs > 1) Array(nbInputs).fill("0").forEach(v => fd.append('r[]', v));
        else             fd.append('r', '0');

        const json = await fetch('serveur.php', { method:'POST', body: fd }).then(r => r.json());
        // Keep the page in sync exactly as serveur() would have
        if(json && typeof apply_csrf_from_response === "function") apply_csrf_from_response(json);
        if(json && json.injecter && typeof inject_all === "function") inject_all(json.injecter);
        return json;
    }

    // {ok:false, notifier:["danger","<b>Débit de requête trop élevé.</b>", 3]} means
    // we posted too fast — wait the number of seconds the server asks for and retry.
    async function submitWithRetry(send, tries){
        let res = null;
        for(let i = 0; i < (tries || 4); i++){
            res = await send();
            if(!res || res.ok !== false) return res;
            const secs = Array.isArray(res.notifier) && +res.notifier[2] > 0 ? +res.notifier[2] : 2;
            console.log('Rate limited, retrying in ' + secs + 's...');
            await sleep(secs * 1000 + 200);
        }
        return res;
    }

    const send = typeof serveur === "function" ? submitViaServeur : submitViaFormData;
    let res  = await submitWithRetry(send);
    let data = (res && res.data) || res || {};

    // Server decoded fewer answers than we sent: try the r[] encoding instead
    if(nbInputs > 1 && (data.reponses_liste || []).length < nbInputs && send !== submitViaFormData){
        console.log('Only ' + (data.reponses_liste || []).length + '/' + nbInputs +
                    ' answers decoded — retrying with repeated r[] fields');
        await sleep(400);
        const res2  = await submitWithRetry(submitViaFormData);
        const data2 = (res2 && res2.data) || res2 || {};
        if((data2.reponses_liste || []).length > (data.reponses_liste || []).length){
            res = res2;
            data = data2;
        }
    }

    console.log("SERVER:", data);

    if(res && res.ok === false && !data.reponses_liste){
        console.log('Request rejected by the server, falling back to the DOM');
    }

    if(data.reponses_liste || document.querySelector('#reponse-1-' + qid)){
        const listes   = data.reponses_liste   || [];
        const nb = Math.max(listes.length, nbInputs);
        for(let i = 0; i < nb; i++){
            let answer = null;
            const types    = data.reponses_type    || [];
            const exemples = data.reponses_exemple || data.reponses_exemples || [];
            const type    = types[i]    || "";
            const example = exemples[i] || "";
            const liste   = listes[i]   || [];
            const pattern = liste[0] || "";

            if(type.includes("regex")){
                answer = extractRegexAnswer(example, pattern);
            } else if(type.includes("liste")){
                answer = pattern;
            } else if(liste.length || example){
                const wrapperMatch = example.match(/<(xml|js|css|html|code|pre|sql|py|php)>([\s\S]*?)<\/\1>/i);
                if(wrapperMatch){
                    answer = decodeHTMLEntities(wrapperMatch[2].trim());
                } else if(example && !/<[a-zA-Z]/.test(example)){
                    answer = decodeHTMLEntities(example.trim());
                } else {
                    answer = liste.join("");
                    answer = answer.replace(/<([a-zA-Z][^>]*)>([\s\S]*?)<\/\1>/g, "$2").trim();
                    answer = decodeHTMLEntities(answer);
                }
            }

            // Fallbacks for any input the server didn't correct: the hidden
            // "Réponse attendue" div, then the answer revealed in the question text.
            if(!answer) answer = getDOMAnswer(qid, i + 1);
            if(!answer) answer = getRevealedAnswer(qid, i + 1);

            const input = document.querySelector('#reponse-' + (i+1) + '-' + qid);
            if(input){
                input.value = answer || "";
                input.dispatchEvent(new Event('input', {bubbles:true}));
                if(window.q[qid].reponses) window.q[qid].reponses[i] = input.value;
                console.log('TEXT input ' + (i+1) + '/' + nb + ' [' + type + ']:', JSON.stringify(input.value));
            } else {
                console.log('TEXT input ' + (i+1) + '/' + nb + ': #reponse-' + (i+1) + '-' + qid + ' not found');
            }
        }
        await sleep(100);
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