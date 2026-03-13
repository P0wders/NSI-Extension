(async () => {

const solved = new Set();
const pending = new Set();
let solving = false;

/* ---------------- sleep ---------------- */

function sleep(ms){
    return new Promise(r => setTimeout(r, ms));
}

/* ---------------- wait for q[qid] ---------------- */

async function waitForQ(qid){
    for(let i = 0; i < 50; i++){
        if(q[qid]) return true;
        await sleep(100);
    }
    return false;
}

/* ---------------- solve question ---------------- */

async function solveQuestion(qid){

    // Deduplicate: if already solved or already queued, bail immediately
    if(solved.has(qid) || pending.has(qid)) return;
    pending.add(qid);

    // Wait for the page to initialize q[qid]
    const ready = await waitForQ(qid);
    if(!ready){
        console.log("solveQuestion: q[" + qid + "] never initialized");
        pending.delete(qid);
        return;
    }

    // If another question is mid-solve, wait for it
    while(solving) await sleep(100);

    // Check again after waiting — might have been solved while we waited
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

    const res = await fetch("/chocolatine/serveur.php",{
        method:"POST",
        headers:{ "Content-Type":"application/x-www-form-urlencoded" },
        body:new URLSearchParams({
            target:"reponse", op:"reponse", n:qid,
            r_JSON:'["test"]', mode:"1", duree:"1", user:"1"
        })
    });

    const json = await res.json();
    const data = json.data || json;
    console.log("SERVER:", data);

    /* ---------------- TEXT QUESTIONS ---------------- */

    if(data.reponses_liste){
        let answer;
        if(data.reponses_type && data.reponses_type[0].includes("regex")){
            answer = data.reponses_exemple[0];
        } else {
            answer = data.reponses_liste.map(a => a[0]).join("");
        }
        answer = answer.replace(/<[^>]+>/g,"").trim();
        const input = document.querySelector(`#reponse-1-${qid}`);
        if(input){
            input.value = answer;
            q[qid].reponses[0] = answer;
            q[qid].valider_reponse();
        }
        return;
    }

    /* ---------------- GROUP / DRAG ---------------- */

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
