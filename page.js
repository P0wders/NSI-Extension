(async () => {

const solved = new Set();
const pending = new Set();
let solving = false;

/* ---------------- sleep ---------------- */

function sleep(ms){
    return new Promise(r => setTimeout(r, ms));
}

/* ---------------- decode HTML entities ---------------- */

function decodeHTMLEntities(str){
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
}

/* ---------------- extract answer from regex question ---------------- */
// Priority order:
// 1. Example has no HTML/custom tags at all → it IS the answer, use it directly.
// 2. Example contains a known code wrapper tag (<xml>, <js>, <css>, <html>, etc.)
//    → extract the first such block's content.
// 3. Fallback: parse the regex pattern to extract the first literal match.

function extractRegexAnswer(example, pattern){

    // 1. Plain example (no tags at all) → use as-is
    if(example && !/<[a-zA-Z]/.test(example)){
        return decodeHTMLEntities(example.trim());
    }

    // 2. Known code wrapper tags (any lowercase tag that wraps a code answer)
    const wrapperMatch = example.match(/<(xml|js|css|html|code|pre|sql|py|php)>([\s\S]*?)<\/\1>/i);
    if(wrapperMatch){
        const raw = wrapperMatch[2].replace(/<[^>]+>/g, "").trim();
        return decodeHTMLEntities(raw);
    }

    // 3. Parse the regex pattern
    try {
        let p = pattern.replace(/^\^/, "").replace(/\$$/, "");

        // Whole pattern is a simple alternation group: (a|b|c) → pick "a"
        const groupMatch = p.match(/^\(([^)]+)\)[?*]?$/);
        if(groupMatch){
            return groupMatch[1].split("|")[0];
        }

        // General cleanup
        p = p.replace(/\([^)]*\)\?/g, "");                  // remove optional groups
        p = p.replace(/\(([^)|]*)\|?[^)]*\)/g, "$1");       // keep first alt of groups
        p = p.replace(/\\(.)/g, "$1");                       // unescape
        p = p.replace(/[?*+]/g, "");                         // remove quantifiers
        p = p.replace(/[<>]/g, "");                          // remove leftover angle brackets

        return p.trim();
    } catch(e) {
        return "";
    }
}

/* ---------------- read expected answer from DOM ---------------- */
// The #message-reponse-attendue-N-{qid} element contains text like:
// "Réponse attendue : href="www.wikipedia.org""
// Strip the prefix and return the bare answer.

function getDOMAnswer(qid, inputIndex){
    const el = document.querySelector(`#message-reponse-attendue-${inputIndex}-${qid}`);
    if(!el) return null;
    const text = el.innerText || el.textContent || "";
    // Remove leading label ("Réponse attendue :" or "Réponses attendues :")
    const cleaned = text.replace(/^R[ée]ponses?\s+attendues?\s*:\s*/i, "").trim();
    return cleaned || null;
}

/* ---------------- wait for q[qid] ---------------- */

async function waitForQ(qid){
    for(let i = 0; i < 50; i++){
        if(q[qid]) return true;
        await sleep(100);
    }
    return false;
}

/* ---------------- count text inputs for a question ---------------- */

function countInputs(qid){
    let count = 0;
    while(document.querySelector(`#reponse-${count+1}-${qid}`)) count++;
    return count || 1;
}

/* ---------------- solve question ---------------- */

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
        await _solve(qid);
    } catch(e) {
        console.log("solveQuestion error:", e);
    } finally {
        solving = false;
    }
}

async function _solve(qid){

    /* continue if already validated */
    const continuer = document.querySelector(`#btn-continuer-${qid}`);
    if(continuer && !continuer.classList.contains("d-none")){
        continuer.click();
        return;
    }

    await sleep(300);

    const nbInputs = countInputs(qid);
    const testArray = JSON.stringify(Array(nbInputs).fill("test"));

    const res = await fetch("/chocolatine/serveur.php",{
        method:"POST",
        headers:{ "Content-Type":"application/x-www-form-urlencoded" },
        body:new URLSearchParams({
            target:"reponse", op:"reponse", n:qid,
            r_JSON: testArray, mode:"1", duree:"1", user:"1"
        })
    });

    const json = await res.json();
    const data = json.data || json;
    console.log("SERVER:", data);

    /* ---------------- TEXT QUESTIONS ---------------- */

    if(data.reponses_liste){
        for(let i = 0; i < data.reponses_liste.length; i++){
            let answer;
            const type    = (data.reponses_type    && data.reponses_type[i])    || "";
            const example = (data.reponses_exemple && data.reponses_exemple[i]) || "";
            const pattern = (data.reponses_liste[i] || [])[0] || "";

            if(type.includes("regex")){
                answer = extractRegexAnswer(example, pattern);
                // If regex parsing produced a bad answer, fall back to the DOM label
                if(!answer){
                    answer = getDOMAnswer(qid, i + 1) || "";
                }
            } else if(type.includes("liste")){
                // Any one value accepted, pick the first
                answer = pattern;
            } else {
                // If the example has a known code wrapper (<xml>, <js>, etc.),
                // extract its content directly — the answer may itself contain HTML tags.
                const wrapperMatch = example.match(/<(xml|js|css|html|code|pre|sql|py|php)>([\s\S]*?)<\/\1>/i);
                if(wrapperMatch){
                    answer = decodeHTMLEntities(wrapperMatch[2].trim());
                } else {
                    answer = (data.reponses_liste[i] || []).join("");
                    // Only strip paired HTML tags (e.g. <b>foo</b>), not bare tags that ARE the answer
                    answer = answer.replace(/<([a-zA-Z][^>]*)>([\s\S]*?)<\/\1>/g, "$2").trim();
                    answer = decodeHTMLEntities(answer);
                }
            }

            const input = document.querySelector(`#reponse-${i+1}-${qid}`);
            if(input){
                input.value = answer;
                if(q[qid].reponses) q[qid].reponses[i] = answer;
                console.log(`TEXT input ${i+1} [${type}]:`, answer);
            }
        }
        q[qid].valider_reponse();
        return;
    }

    /* ---------------- GROUP / DRAG (2D correction) ---------------- */

    if(Array.isArray(data.correction) && Array.isArray(data.correction[0])){
        for(let g=1; g<data.correction.length; g++){
            const zone = document.querySelector(`#elements-groupe-${g}-${qid}`);
            for(const letter of data.correction[g]){
                const el = document.querySelector(`#rep-${letter}-${qid}`);
                if(el && zone) zone.appendChild(el);
            }
        }
        return;
    }

    /* ---------------- MATCH QUESTIONS ---------------- */

    if(data.mix && Object.keys(data.mix).some(k => k.endsWith("2"))){
        for(const key in data.mix){
            const value     = data.mix[key];
            const keyLetter = key.replace("2","");
            const valueEl   = document.querySelector(`#rep-${value}-${qid}`);
            const keyEl     = document.querySelector(`#rep-${keyLetter}-${qid}`);
            if(!valueEl || !keyEl) continue;
            const keyZone  = keyEl.closest(`.drop-zone-for-value${qid}`);
            if(!keyZone) continue;
            const cadMatch = keyZone.id.match(/^cad-(\d+)-(\d+)-/);
            if(!cadMatch) continue;
            const targetZone = cadMatch[1] === "1"
                ? document.querySelector(`#cad-2-${cadMatch[2]}-${qid}`)
                : keyZone;
            if(targetZone){
                targetZone.appendChild(valueEl);
                console.log(`MATCH: moved #rep-${value}-${qid} -> #${targetZone.id}`);
            }
        }
        await sleep(200);
        return;
    }

    /* ---------------- ORDERING (flat correction array + cad-N slots) ---------------- */

    if(Array.isArray(data.correction) && data.correction.length > 0
        && document.querySelector(`#cad-0-${qid}`)){

        for(let i = 0; i < data.correction.length; i++){
            const letter = data.correction[i];
            const slot   = document.querySelector(`#cad-${i}-${qid}`);
            const el     = document.querySelector(`#rep-${letter}-${qid}`);
            if(slot && el){
                slot.appendChild(el);
                console.log(`ORDER: moved #rep-${letter}-${qid} -> #cad-${i}-${qid}`);
            }
        }
        await sleep(200);
        q[qid].valider_reponse();
        return;
    }

    /* ---------------- QCM ---------------- */

    if(data.correction){

        const allInputs = Array.from(document.querySelectorAll(
            `#cadre-formulaire-${qid} input.btn-check`
        ));
        const isMulti = allInputs.some(el => el.type === "checkbox");

        for(const letter of data.correction){
            let el = document.querySelector(`#checkbox-${letter}-${qid}`)
                  || document.querySelector(`#btnradio-${letter}-${qid}`);

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

        if(isMulti && typeof q[qid]?.valider_reponse === "function"){
            q[qid].valider_reponse();
        }

        // User must click Valider manually
    }
}

/* ---------------- watch for new questions ---------------- */

new MutationObserver((mutations)=>{
    for(const m of mutations){
        for(const node of m.addedNodes){
            if(node.nodeType !== 1) continue;

            let qid = null;

            if(node.id && node.id.startsWith("cadre-formulaire-")){
                qid = node.id.replace("cadre-formulaire-","");
            } else {
                const inner = node.querySelector && node.querySelector('[id^="cadre-formulaire-"]');
                if(inner) qid = inner.id.replace("cadre-formulaire-","");
            }

            if(qid){
                console.log("NEW QUESTION detected:", qid);
                solveQuestion(qid);
            }
        }
    }
}).observe(document.body,{childList:true,subtree:true});

/* run once for question already on page */
const firstQid = Object.keys(q).pop();
if(firstQid) solveQuestion(firstQid);

})();
