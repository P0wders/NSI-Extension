(async () => {

const solved = new Set();

function sleep(ms){
    return new Promise(r => setTimeout(r, ms));
}

async function solveQuestion(){

    const qid = Object.keys(q).pop();
    if(!qid || solved.has(qid)) return;

    solved.add(qid);

    const res = await fetch("/chocolatine/serveur.php",{
        method:"POST",
        headers:{
            "Content-Type":"application/x-www-form-urlencoded"
        },
        body:new URLSearchParams({
            target:"reponse",
            op:"reponse",
            n:qid,
            r_JSON:'["test"]',
            mode:"1",
            duree:"1",
            user:"1"
        })
    });

    const json = await res.json();
    const data = json.data || json;

    console.log("SERVER:",data);

    /* ---------------- TEXT QUESTIONS ---------------- */

    if(data.reponses_liste){

        let answer;

        if(data.reponses_type && data.reponses_type[0] === "regex"){
            answer = data.reponses_exemple[0];
        }
        else{
            answer = data.reponses_liste.map(a => a[0]).join("");
        }

        const input = document.querySelector(`#reponse-1-${qid}`);

        if(input){
            input.value = answer;
            q[qid].reponses[0] = answer;
            q[qid].valider_reponse();
        }

        return;
    }

    /* ---------------- GROUP / DRAG QUESTIONS ---------------- */

    if(Array.isArray(data.correction[0])){

        for(let g=1; g<data.correction.length; g++){

            const zone = document.querySelector(`#elements-groupe-${g}-${qid}`);

            for(const letter of data.correction[g]){

                const el = document.querySelector(`#rep-${letter}-${qid}`);

                if(el && zone){
                    zone.appendChild(el);
                }

            }

        }

        document.querySelector(`#btn-valider-${qid}`)?.click();

        return;
    }

    /* ---------------- QCM ---------------- */

    if(data.correction){

        let answers = data.correction;

        /* handle shuffled questions */
        if(data.mix){

            const reverseMix = {};

            for(const k in data.mix){
                reverseMix[data.mix[k]] = k;
            }

            answers = answers.map(a => data.mix[reverseMix[a]] || a);
        }

        for(const letter of answers){

            const el =
                document.querySelector(`#checkbox-${letter}-${qid}`) ||
                document.querySelector(`#btnradio-${letter}-${qid}`);

            if(el) el.click();

        }

        document.querySelector(`#btn-valider-${qid}`)?.click();
    }
}

/* detect new questions */

new MutationObserver(solveQuestion).observe(document.body,{
    childList:true,
    subtree:true
});

/* run once */

solveQuestion();

})();
