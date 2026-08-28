document.addEventListener("DOMContentLoaded", () => {
    const bouton = document.getElementById("btnExtraire");
    if (bouton) {
        bouton.addEventListener("click", extraireLabos);
    }
});

function extraireLabos() {
    const texte = document.getElementById("inputRapport").value;
    const resultat = processRapport(texte);
    document.getElementById("resultats").textContent = resultat;
    copierPressePapiers(resultat);
}

function normaliserValeur(val) {
    if (val === null || val === undefined) return null;
    const nettoyee = String(val).replace(/[\s\u00a0]/g, "").replace(",", ".").trim();
    if (!nettoyee) return null;
    return nettoyee.replace(/^0+(?=\d)/, "");
}

function nombreRegex() {
    return "([<>]?(?:=)?\\d+(?:[.,]\\d+)?)(?!\\s*\\/)";
}

function extraire(texte, regex) {
    const match = texte.match(regex);
    return match && match[1] ? normaliserValeur(match[1]) : null;
}

function extractValue(text, pattern, options = {}) {
    const { factor = 1, percentage = false, percentIfFraction = false } = options;
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
    const match = text.match(regex);

    if (!match || !match[1]) return null;

    let rawValue = match[1].replace(",", ".").replace(/[^\d.<>]/g, "").trim();
    const hasComparator = /^[<>]=?/.test(rawValue);
    rawValue = rawValue.replace(/^[<>]=?/, "");

    let value = parseFloat(rawValue);
    if (Number.isNaN(value)) return null;

    value *= factor;

    if (percentIfFraction) {
        let isFraction = false;
        if (value > 0 && value <= 1) {
            value *= 100;
            isFraction = true;
        }
        const fixedValue = isFraction || value % 1 !== 0 ? value.toFixed(1) : value.toFixed(0);
        return `${fixedValue}%`;
    }

    if (percentage) {
        return `${match[1].replace(",", ".")}%`;
    }

    const decimalPlaces = rawValue.includes(".") ? rawValue.split(".")[1].length : 0;
    const output = decimalPlaces > 0 || value % 1 !== 0
        ? value.toFixed(decimalPlaces > 2 ? 2 : decimalPlaces)
        : value.toString();

    return hasComparator ? `${match[1].trim().match(/^[<>]=?/)?.[0] || ""}${output}` : output;
}

function extractValueNearAnchor(text, anchorPattern, linesToSearch = 5) {
    const lines = text.split(/\r?\n/);
    const regex = anchorPattern instanceof RegExp ? anchorPattern : new RegExp(anchorPattern, "i");

    for (let i = 0; i < lines.length; i++) {
        if (!regex.test(lines[i])) continue;

        const sameLine = lines[i].match(/([<>]?(?:=)?\d+(?:[.,]\d+)?)/);
        if (sameLine && sameLine[1]) {
            return normaliserValeur(sameLine[1]);
        }

        const start = Math.max(0, i - linesToSearch);
        const end = Math.min(lines.length - 1, i + linesToSearch);

        for (let k = start; k <= end; k++) {
            if (k === i) continue;
            const line = lines[k].trim();
            if (/Idéal|Optimal|Contrôle|Chef|Page|Rapport|Légende|unité|Référence|Limite|^\s*$/i.test(line)) {
                continue;
            }
            const match = line.match(/^([<>]?(?:=)?\d+(?:[.,]\d+)?)(?:\s*[LHB])?(?:\s+\S+.*)?$/i);
            if (match && match[1]) {
                return normaliserValeur(match[1]);
            }
        }
    }

    return null;
}

function fb(paramRx, uniteRx) {
    return new RegExp(
        paramRx + "\\s+" + nombreRegex() + "\\s+(?:<=|>=)?\\s*[\\d,. -]+\\s*" + uniteRx,
        "i"
    );
}

function extraireParUnite(texte, paramRegex, uniteRegex, fallbackRegex, formatB_regex) {
    const numSimple = nombreRegex();
    const numAvecFlag = "(?:[HLBA]\\s*)?([<>]?(?:=)?\\d+(?:[.,]\\d+)?)";
    const param = "(?:" + paramRegex + ")";
    const regexValeurPuisReference = new RegExp(
        param + "\\s+" + numAvecFlag + "\\s+(?:<=|>=)?\\s*\\d+(?:[.,]\\d+)?\\s*-\\s*\\d+(?:[.,]\\d+)?\\s+" + uniteRegex,
        "i"
    );

    const regexA = new RegExp(
        param + "\\s+" + uniteRegex + "[^\\n]*?AUTO[VHBCAX\\/]*\\s*" + numSimple,
        "i"
    );
    const mA = texte.match(regexA);
    if (mA) return normaliserValeur(mA[1]);

    if (formatB_regex) {
        const mB = texte.match(formatB_regex);
        if (mB && mB[1]) return normaliserValeur(mB[1]);
    }

    const mRef = texte.match(regexValeurPuisReference);
    if (mRef) return normaliserValeur(mRef[1]);

    const regexC = new RegExp(
        param + "\\s+" + uniteRegex +
        "\\s+[A-Z]{2,}\\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?\\s*" + numSimple,
        "i"
    );
    const mC = texte.match(regexC);
    if (mC) return normaliserValeur(mC[1]);

    const regexD = new RegExp(
        param + "\\s+" + numAvecFlag + "\\s+" + uniteRegex,
        "i"
    );
    const mD = texte.match(regexD);
    if (mD) return normaliserValeur(mD[1]);

 const regexE = new RegExp(
    param + "[^\\n\\d]{0,40}?" + numAvecFlag + "[^\\n]*?\\s" + uniteRegex,
    "i"
);
    const mE = texte.match(regexE);
    if (mE) return normaliserValeur(mE[1]);

    if (fallbackRegex) return extraire(texte, fallbackRegex);
    return null;
}

function extraireFormatCompactRef(texte, paramRegex, uniteRegex) {
    const rx = new RegExp(
        "(?:^|\\n)\\s*(?:[<>]=?\\s*)?\\d+[.,]?\\d*(?:\\s*-\\s*\\d+[.,]?\\d*)?\\s*(?:" +
        paramRegex +
        ")\\s+(?:" +
        uniteRegex +
        ")\\s+AUTO[VHBCAX\\/]*\\s*" +
        nombreRegex(),
        "i"
    );
    const m = texte.match(rx);
    return m ? normaliserValeur(m[1]) : null;
}

/* CORRECTION : le segment "code labo" utilisait \d{3,}? (lazy), ce qui pouvait
   laisser un ou plusieurs chiffres du code déborder dans le groupe de capture
   de la valeur (ex. "CAT032414,6" -> capturait "414,6" au lieu de "14,6" pour le
   DVE). Les codes labo observés dans ce format sont systématiquement composés
   de lettres suivies d'EXACTEMENT 4 chiffres (ex. CAT0324), optionnellement
   suivis d'un drapeau (AH, CB, etc.). Fixer la longueur à \d{4} élimine
   l'ambiguïté entre la fin du code et le début de la valeur. */
function extraireFormatRefCodeValeur(texte, paramRegex, uniteRegex) {
    const rx = new RegExp(
        "(?:^|\\n)\\s*(?:[<>]=?\\s*)?\\d+[.,]?\\d*(?:\\s*-\\s*(?:[<>]=?\\s*)?\\d+[.,]?\\d*)?\\s*(?:" +
        paramRegex +
        ")\\s+(?:" +
        uniteRegex +
        ")\\s+[A-Z]{2,}\\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?(" +
        "[<>]?(?:=)?\\d+(?:[.,]\\d+)?" +
        ")\\s+20\\d{2}\\/",
        "i"
    );
    const m = texte.match(rx);
    return m ? normaliserValeur(m[1]) : null;
}

function extraireFormatCisssInverse(texte, paramRegex, uniteRegex = null) {
    const param = new RegExp("(?:" + paramRegex + ")\\s*$", "i");
    const valeur = "([<>]?(?:=)?\\d+(?:[.,]\\d+)?)";
    const prefixe = uniteRegex
        ? "^\\s*(?:[A-Z]\\s*){0,2}(?:" + uniteRegex + ")\\s*" + valeur
        : "^\\s*(?:[A-Z]\\s*){0,2}" + valeur;
    const valeurSurLigne = new RegExp(prefixe, "i");

    for (const ligneBrute of texte.split(/\r?\n/)) {
        const ligne = ligneBrute.trim();
        if (!param.test(ligne)) continue;

        const sansParam = ligne.replace(param, "").trim();
        const match = sansParam.match(valeurSurLigne);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return null;
}

/* NOUVEAU : format "Nom U/L CODEXXah<valeur> AAAA/" avec un préfixe de type ">60" isolé
   juste avant la ligne du paramètre (ex: DFGe IUCPQ). On matche directement
   code-labo + valeur + date, sans dépendre de ce qui précède. */
function extraireFormatCodeValeurDate(texte, paramRegex, uniteRegex) {
    const rx = new RegExp(
        "(?:" + paramRegex + ")\\s+(?:" + uniteRegex + ")\\s+[A-Z]{2,}\\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\\d+(?:[.,]\\d+)?)\\s+20\\d{2}\\/",
        "i"
    );
    const m = texte.match(rx);
    return m ? normaliserValeur(m[1]) : null;
}

function extraireDFGe(texte) {
    // AUTOV/AUTOH… avec valeur collée (ex: AUTOV112) — doit être testé avant les patterns
    // qui consomment des chiffres du code labo (compactCourt).
    let mAuto = texte.match(/DFG\s*Estim[ée]\/1,73m2\s*\(pr[ée]dite\)\s*mL\/min\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (mAuto) return normaliserValeur(mAuto[1]);

    // NOUVEAU : format compact avec code labo à 2 lettres seulement (ex: CHTES01AB) devant la valeur,
    // suivi de la date - couvre les codes labo plus courts (2 lettres + chiffres) que compactCode4/compact
    let compactCourt = texte.match(/DFG\s*Estim[ée]\/1,73m2\s*\(pr[ée]dite\)\s*mL\/min\s+[A-Z]{2,}\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (compactCourt) return normaliserValeur(compactCourt[1]);

    let sansCodeAvantUnite = texte.match(/DFG\s*Estim[ée]\/1,73m2\s*\(pr[ée]dite\)\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mL\/min/i);
    if (sansCodeAvantUnite) return normaliserValeur(sansCodeAvantUnite[1]);

    let compactCode4 = texte.match(/DFG\s*Estim[ée]\/1,73m2\s*\(pr[ée]dite\)\s*mL\/min\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d{1,3}(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (compactCode4) return normaliserValeur(compactCode4[1]);

    let compact = texte.match(/DFG\s*Estim[ée]\/1,73m2\s*\(pr[ée]dite\)\s*mL\/min\s+[A-Z]{2,}\d{3,}?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (compact) return normaliserValeur(compact[1]);

    let m = texte.match(/DFG\s*Estim[ée][^\n]*?mL\/min(?:\/1[.,]73m[²2])?\s+[A-Z]{2,}\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/DFG\s*Estim[ée][^\n]*?mL\/min\s+AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/DFG\s*Estim[ée][^\n]*?\s+([\d,.]+)\s+mL\/min/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/DFGe\s*\(CKD-EPI\)[^\d]*([0-9,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    return extractValueNearAnchor(texte, /DFGe\s*\(CKD-EPI\)|DFG\s*Estim[ée]/i, 6);
}

function extraireHb(texte) {
    const patterns = [
        /(?:^|\n)\s*(?:[<>]=?\s*)?\d+(?:[.,]\d+)?\s*-\s*(?:[<>]=?\s*)?\d+(?:[.,]\d+)?Hb\s+g\/L\s+[A-Z]{2,}\d{3,4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i,
        /(?<!moyenne )\bHb\b\s*(?:[HLB]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b/i,
        /H[ée]moglobine\s*(?:[HLB]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b/i,
        /(?<!moyenne )\bHb\b[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i,
        /H[ée]moglobine[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    const lignes = texte.split(/\r?\n/);
    for (const ligne of lignes) {
        const propre = ligne.trim();
        if (!propre) continue;

        let match = propre.match(/^(?:Hb|H[ée]moglobine)\s+(?:[HLBA]\s+)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b/i);
        if (match && match[1]) return normaliserValeur(match[1]);

        match = propre.match(/^([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b[\s\S]*?(?:Hb|H[ée]moglobine)\b/i);
        if (match && match[1]) return normaliserValeur(match[1]);

        match = propre.match(/^[A-Z]?\s*g\/L\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)[\s\S]*?(?:Hb|H[ée]moglobine)\b/i);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return null;
}

function extraireVGM(texte) {
    const patterns = [
        /(?:^|\n)\s*(?:[<>]=?\s*)?\d+(?:[.,]\d+)?\s*-\s*(?:[<>]=?\s*)?\d+(?:[.,]\d+)?VGM\s+fL\s+[A-Z]{2,}\d{3,4}(?:AB|AH|AN|CB|CH|XB|XH)?(\d{2,3}(?:[.,]\d+)?)\s+20\d{2}\//i,
        /\bVGM\b\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*fL\b/i,
        /Volume glob\.\s*moyen\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*fL\b/i,
        /\bVGM\b[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return extractValueNearAnchor(texte, /\bVGM\b|Volume glob\.\s*moyen/i, 6);
}

function extraireValeurSurLigne(texte, paramRegex, uniteRegex) {
    const lignes = texte.split(/\r?\n/);
    const paramPattern = `(?:${paramRegex})`;

    for (const ligneBrute of lignes) {
        const ligne = ligneBrute.trim();
        if (!ligne) continue;
        if (!new RegExp(paramPattern, "i").test(ligne)) continue;

        const match = ligne.match(new RegExp(
            paramPattern + "\\s+(?:[HLBA]\\s*)?([<>]?(?:=)?\\d+(?:[.,]\\d+)?)\\b[\\s\\S]{0,40}?" + uniteRegex,
            "i"
        ));
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return null;
}

function extraireCreatinine(texte) {
    let matchCompactCode4 = texte.match(/Cr[ée]atinine\s+umol\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d{1,3}(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (matchCompactCode4 && matchCompactCode4[1]) return normaliserValeur(matchCompactCode4[1]);

    let matchAuto = texte.match(/Cr[ée]atinine\s+umol\/L\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d{1,3}(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (matchAuto && matchAuto[1]) return normaliserValeur(matchAuto[1]);

    let matchCompact = texte.match(/Cr[ée]atinine\s+umol\/L\s+[A-Z]{2,}\d{3,}?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (matchCompact && matchCompact[1]) return normaliserValeur(matchCompact[1]);

    const lignes = texte.split(/\r?\n/);
    for (const ligneBrute of lignes) {
        const ligne = ligneBrute.trim();
        if (!/Cr[ée]atinine|CREATININE/i.test(ligne)) continue;
        if (/\bmiction\b|urinaire|urine|mg\/mmolCRE/i.test(ligne)) continue;

        let match = ligne.match(/(?:Cr[ée]atinine|CREATININE)\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*[uµμ](?:mol|M)\/L\b/i);
        if (match && match[1]) return normaliserValeur(match[1]);

        match = ligne.match(/(?:Cr[ée]atinine|CREATININE)\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:<=|>=)?\s*[\d,. -]+\s*[uµμ](?:mol|M)\/L\b/i);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    const patterns = [
        /Cr[ée]atinine\s*[uµμ](?:mol|M)\/L\s+[A-Z]{2,}\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i,
        /Cr[ée]atinine\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*[uµμ](?:mol|M)\/L\b/i,
        /CREATININE\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*[uµμ](?:mol|M)\/L\b/i,
        /Cr[ée]atinine\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:<=|>=)?\s*[\d,. -]+\s*[uµμ](?:mol|M)\/L\b/i,
        /Cr[ée]atinine[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) {
            const contexte = texte.substring(Math.max(0, (match.index || 0) - 80), Math.min(texte.length, (match.index || 0) + 160));
            if (/\bmiction\b|urinaire|urine|mg\/mmolCRE/i.test(contexte)) continue;
            return normaliserValeur(match[1]);
        }
    }

    return null;
}

function extraireHemolysePotassium(texte) {
    const lignePotassium = texte.match(/Potassium[^\n]*/i);
    const zoneRecherche = lignePotassium
        ? texte.substring(
            Math.max(0, (lignePotassium.index || 0) - 250),
            Math.min(texte.length, (lignePotassium.index || 0) + lignePotassium[0].length + 250)
        )
        : texte;

    let match = zoneRecherche.match(/r[ée]sultat\s+surestim[ée]\s*(?:(\d)\+|(\+{1,3}))/i);
    if (match && match[1]) {
        const niveau = parseInt(match[1], 10);
        if (!Number.isNaN(niveau) && niveau > 0) return "+".repeat(Math.min(niveau, 3));
    }
    if (match && match[2]) return match[2];

    match = zoneRecherche.match(/h[ée]molyse\s*(\d)\+/i);
    if (!match || !match[1]) return "";

    const niveau = parseInt(match[1], 10);
    if (Number.isNaN(niveau) || niveau <= 0) return "";
    return "+".repeat(Math.min(niveau, 3));
}

function extraireCT(texte) {
    let m = texte.match(/<=?\s*[\d,.]+\s*Cholest[ée]rol\s+mmol\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cholest[ée]rol(?!\s+(?:HDL|LDL|non|total\/C-HDL))\s+([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:<=|>=)?\s*[\d,. -]+\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cholest[ée]rol\s+total\s*[HB]?\s*([\d,.]+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cholest[ée]rol(?!\s+(?:HDL|LDL|non|total))\s+mmol\/L[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cholest[ée]rol\s*total[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cholest[ée]rol(?!\s*-\s*(?:HDL|LDL)|\s+(?:HDL|LDL|non-HDL|non HDL|total\/C-HDL))\s+([\d,.]+)\s+[\d,. -]*\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireApoB(texte) {
    let m = texte.match(/Apolipoprot[ée]ine\s+B\s+g\/L\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:Apolipoprot[ée]ines?\s*B|Apo\s*B)\s*(?:[HBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:<=|>=)?\s*[\d,. -]+\s*g\/L\b/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:Apolipoprot[ée]ines?\s*B|Apolipoprot[ée]ine\s*B)(?:\s*-\s*100)?\s*(?:[HBA]\s*)?([\d,.]+)\s+(?:[\d,. -]+\s+)?g\/L\b/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:Apolipoprot[ée]ine\s*B-?100|Apo\s*B)\s*(?:[HB]\s*)?([\d,.]+)(?:\s*g\/L)?/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/APOLIPOPROTEINES?\s*B\s+(?:[HBA]\s*)?(\d+[.,]\d+|\d+)\b/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireLpA(texte) {
    let m = texte.match(/Lipoprot[ée]ines?\s*a\s*\(Lpa\)\s*nmol\/L\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Lipoprot[ée]ines?\s*a\s*\(Lpa\)\s*nmol\/L\s+[A-Z]{2,}\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:Lipoprot[ée]ines?\s*a\s*\(Lpa\)|Lp\s*\(a\))\s*(?:[HBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:<=|>=)?\s*[\d,. -]+\s*nmol\/L\b/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:Lipoprot[ée]ines?\s*a\s*\(Lpa\)|Lp\s*\(a\))\s*(?:[HBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*nmol\/L\b/i);
    if (m) return normaliserValeur(m[1]);

    return extraireFormatCisssInverse(texte, "Lipoprot[ée]ines?\\s*a\\s*\\(Lpa\\)|Lp\\s*\\(a\\)", "nmol\\/L");
}

function extraireA1c(texte) {
    // Si le labo indique explicitement que l'HbA1c n'est pas mesurable, on laisse
    // la fructosamine (si présente) fournir l'estimation via processRapport.
    if (/HbA1c\s+non\s+mesurable|HbA1c[^\n]*non\s+mesurable/i.test(texte)) {
        return null;
    }

    let m = texte.match(/HBA1c\s*[HB]?\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (!m) m = texte.match(/HbA1c\s+%[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (!m) m = texte.match(/HbA1c\s+[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (!m) m = texte.match(/HbA1c\s+([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+[\d,. -]+\s*%/i);
    if (!m) m = texte.match(/HBA1c[^\n]*?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*%/i);

    let valeur = m && m[1] ? normaliserValeur(m[1]) : null;
    if (!valeur) {
        const lignes = texte.split(/\r?\n/);
        for (let i = 0; i < lignes.length; i++) {
            if (!/HbA1c|HbA1C|glyqu[ée]e/i.test(lignes[i])) continue;

            const start = Math.max(0, i - 6);
            const end = Math.min(lignes.length - 1, i + 6);
            for (let k = start; k <= end; k++) {
                if (k === i) continue;

                const ligne = lignes[k].trim();
                if (/Idéal|Optimal|Contrôle|Chef|Page|Rapport|Légende|^\s*$/i.test(ligne)) continue;

                const match = ligne.match(/^([<>]?(?:=)?\d+(?:[.,]\d+)?)(?:\s*[HLB])?(?:\s+\S+.*)?$/i);
                if (match && match[1]) {
                    valeur = normaliserValeur(match[1]);
                    break;
                }
            }

            if (valeur) break;
        }
    }
    if (!valeur) return null;

    const valeurA1c = String(valeur).replace(/^([<>]=?)?\./, (_, comparateur = "") => `${comparateur}0.`);
    return extractValue(valeurA1c, /^([<>]?(?:=)?\d+(?:[.,]\d+)?)$/, { percentIfFraction: true });
}

/* Fructosamine (umol/L). Format typique: "Fructosamine umol/L AUTOVAH435 2026/..." */
function extraireFructosamine(texte) {
    let m = texte.match(/Fructosamine\s+[uµμ]?mol\/L\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Fructosamine\s+[uµμ]?mol\/L\s+[A-Z]{2,}\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Fructosamine\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+[uµμ]?mol\/L/i);
    if (m) return normaliserValeur(m[1]);

    return extraireParUnite(texte, "Fructosamine", "[uµμ]?mol\\/L", /Fructosamine[^\d-]*([\d,.]+)/i);
}

/* Conversion Fructosamine (umol/L) → HbA1c (%) : HbA1c = 0.017 × fructosamine + 1.61 */
function fructosamineVersHbA1c(val) {
    if (val === null || val === undefined) return null;
    const n = parseFloat(String(val).replace(",", "."));
    if (Number.isNaN(n)) return null;
    const a1c = 0.017 * n + 1.61;
    return `${a1c.toFixed(1)}%`;
}

function extraireProlactine(texte) {
    return extraireFormatCisssInverse(texte, "Prolactine", "[uµμ]g\\/L") ||
        extractValue(texte, /Prolactine\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:(?:<=|>=)?\s*[\d,. -]+\s+)?[uµμ]g\/L/i);
}

/* AJOUT : format "Testostérone nmol/L AUTOVAH52,2 2026/..." (valeur collée
   directement après AUTOV + drapeau, sans espace) rencontré dans ce rapport,
   en plus du format CISSS inversé déjà géré et du format valeur-avant-unité. */
function extraireTestosterone(texte) {
    let m = texte.match(/Testost[ée]rone\s+nmol\/L\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    return extraireFormatCisssInverse(texte, "TESTOSTERONE\\s+TOTALE|Testost[ée]rone", "nmol\\/L") ||
        extractValue(texte, /Testost[ée]rone(?:\s+totale)?\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:(?:<=|>=)?\s*[\d,. -]+\s+)?nmol\/L/i);
}

function extraireDHEA(texte) {
    return extraireFormatCisssInverse(texte, "DHEA-?S", "[uµμ]mol\\/L") ||
        extractValue(texte, /DHEA-?S\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:(?:<=|>=)?\s*[\d,. -]+\s+)?[uµμ]mol\/L/i);
}

/* NOUVEAU : Estradiol (pmol/L), format "Estradiol pmol/L AUTOV294 2026/...". */
function extraireEstradiol(texte) {
    let m = texte.match(/Estradiol\s+pmol\/L\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    return extraireFormatCisssInverse(texte, "Estradiol", "pmol\\/L") ||
        extractValue(texte, /Estradiol\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:(?:<=|>=)?\s*[\d,. -]+\s+)?pmol\/L/i);
}

/* NOUVEAU : SHBG (nmol/L), format "SHBG nmol/L AUTOV104 2026/...". */
function extraireSHBG(texte) {
    let m = texte.match(/SHBG\s+nmol\/L\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    return extraireFormatCisssInverse(texte, "SHBG", "nmol\\/L") ||
        extractValue(texte, /SHBG\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:(?:<=|>=)?\s*[\d,. -]+\s+)?nmol\/L/i);
}

function extractRacValue(text) {
    let sameLine = text.match(/(\d+[.,]\d+)\s+[HLB]?\s*[HLB]?\s*<?\d+[.,]?\d*\s+mg\/mmol\s+cr[ée]atinine\s+Microalbumine\s*\(\s*ratio\s*\)/i);
    if (sameLine && sameLine[1]) return normaliserValeur(sameLine[1]);

    sameLine = text.match(/Microalbumine\s*\(\s*ratio\s*\)[\s\S]{0,150}?(\d+[.,]\d+)/i);
    if (sameLine && sameLine[1]) return normaliserValeur(sameLine[1]);

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (!/Microalbumine\s*\(\s*ratio\s*\)/i.test(lines[i])) continue;

        const lineMatch = lines[i].match(/(\d+[.,]\d+)/);
        if (lineMatch) return normaliserValeur(lineMatch[1]);

        for (let j = 1; j <= 10; j++) {
            if (i - j < 0) continue;
            const line = lines[i - j].trim();
            if (/[<>]/.test(line) || /mg\/mmol|cr[ée]atinine|Idéal|Optimal|Contrôle|Référence|Limite/i.test(line)) {
                continue;
            }
            const match = line.match(/^([0-9]+(?:[.,][0-9]+)?)(?:\s*[LHB]\s*)?$/i);
            if (match) return normaliserValeur(match[1]);
        }
        break;
    }

    return null;
}

function extraireRAC(texte) {
    if (/Impossibilit[ée] d'effectuer le calcul/i.test(texte) &&
        /Microalbumine\/Cr[ée]at|Microalbumine\/Cr[ée]at; Ur|Microalbumine\/Créat/i.test(texte)) {
        return "négatif";
    }

    // Fonction locale : les RAC <2,0 mg/mmol sont rapportés simplement comme "-"
    const normaliserRAC = (valeur) => {
        if (!valeur) return null;

        const v = String(valeur)
            .replace(/\s/g, "")
            .replace(",", ".");

        // Toute valeur explicitement <2,0 est considérée comme négative
        if (/^<\s*2(?:\.0+)?$/i.test(v)) {
            return "-";
        }

        // Si le laboratoire rapporte <2,xx, conserver "-" pour le seuil analytique
        // du RAC dans ce format de rapport.
        if (/^<\s*2\./i.test(v)) {
            return "-";
        }

        return normaliserValeur(v);
    };

    let m = texte.match(
        /Microalbumine\/Cr[ée]at\s*;\s*Ur[\s\S]{0,120}?creat[\s\S]{0,40}?(?:AUTO[VHBCAX\/]*\s*)?(?:AH|AB|AN|CB|CH|XB|XH)?\s*(<\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/i
    );
    if (m) return normaliserRAC(m[1]);

    m = texte.match(
        /Microalbumine\s*\/\s*Cr[ée]at[^\n]*?AUTO[VHBCAX]*\s*(<\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/i
    );
    if (m) return normaliserRAC(m[1]);

    m = texte.match(
        /Microalbumine\s*\/\s*Cr[ée]at[\s\S]*?AUTO[VHBCAX]*\s*(<\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/i
    );
    if (m) return normaliserRAC(m[1]);

    // Format Pharmacie André Villeneuve / rapport consolidé :
    // "Microalbumine (miction) <2,00 mg/mmolCRE"
    m = texte.match(
        /Microalbumine\s*\(miction\)[\s\S]{0,80}?(<\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*mg\/mmolCRE/i
    );
    if (m) return normaliserRAC(m[1]);

    m = texte.match(
        /Microalbumine\s*\/?\s*Cr[ée]at\s*;?\s*Ur[\s\S]{0,120}?(<\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:AH|AB|AN|CB|CH|XB|XH)?\s*(?:mg\/mmol|AUTOV|20\d{2}\/\d{2}\/\d{2})/i
    );
    if (m) return normaliserRAC(m[1]);

    // Autres formats déjà supportés
    m = texte.match(
        /(\d+[.,]\d+)\s+[HLB]?\s*[HLB]?\s*<?\d+[.,]?\d*\s+mg\/mmol\s+cr[ée]atinine\s+Microalbumine\s*\(\s*ratio\s*\)/i
    );
    if (m && m[1]) return normaliserRAC(m[1]);

    m = texte.match(
        /Microalbumine\s*\(\s*ratio\s*\)[\s\S]{0,150}?(<\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/i
    );
    if (m && m[1]) return normaliserRAC(m[1]);

    return null;
}

function extraireTSAT(texte) {
    const valeurInverse = extraireFormatCisssInverse(texte, "SATURATION\\s+FER");
    if (valeurInverse) {
        return extractValue(valeurInverse, /^([<>]?(?:=)?\d+(?:[.,]\d+)?)$/, { percentIfFraction: true });
    }

    let m = texte.match(/Saturation\s+en\s+fer[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (!m) m = texte.match(/Saturation\s+en\s+fer\s+([\d,.]+)\s*%/i);
    if (!m) m = texte.match(/SATURATION\s+FER\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)(?:\s+(?:<=|>=)?\s*[\d,.]+\s*-\s*[\d,.]+)?/i);
    if (!m) m = texte.match(/Indice de saturation[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (!m) m = texte.match(/Indice de saturation[^\d-]*([\d,.]+)\s*%?/i);

    if (m) {
        return extractValue(m[1], /^([<>]?(?:=)?\d+(?:[.,]\d+)?)$/, { percentIfFraction: true });
    }

    return null;
}

function extraireLiStrict(texte) {
    // Format Hôpital de l'Enfant-Jésus :
    // "Lithium mmol/L AUTOV0,59 2026/06/15 17:44"
    let m = texte.match(
        /Lithium\s+mmol\/L\s+AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i
    );
    if (m) return normaliserValeur(m[1]);

    // Format avec code labo entre l'unité et la valeur :
    // "Lithium mmol/L CA1030,59 2026/06/15..."
    m = texte.match(
        /Lithium\s+mmol\/L\s+[A-Z]{2,}\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i
    );
    if (m) return normaliserValeur(m[1]);

    // Format classique :
    // "Lithium sérique 0,59 mmol/L"
    m = texte.match(
        /Lithium\s+s[ée]rique\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mmol\/L/i
    );
    if (m) return normaliserValeur(m[1]);

    // Format simple :
    // "Lithium 0,59 mmol/L"
    m = texte.match(
        /\bLithium\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mmol\/L/i
    );
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireMg(texte) {
    let m = texte.match(/Magn[ée]sium\s+mmol\/L\s+[A-Z]{3,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d]+[.,]\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Magn[ée]sium\s+mmol\/L[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Magn[ée]sium\s+([\d,.]+)\s+[\d,. -]+\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Magn[ée]sium[^\d-]*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/MAGNESIUM\s+(\d+[.,]\d+|\d+)\s/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireAlbumine(texte) {
    const valeurInverse = extraireFormatCisssInverse(texte, "ALBUMINE|Albumine", "g\\/L");
    if (valeurInverse) return valeurInverse;

    let matchCompact = texte.match(/Albumine\s+g\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (matchCompact && matchCompact[1]) return normaliserValeur(matchCompact[1]);

    matchCompact = texte.match(/Albumine\s+g\/L[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (matchCompact && matchCompact[1]) return normaliserValeur(matchCompact[1]);

    const lignes = texte.split(/\r?\n/);
    for (const ligneBrute of lignes) {
        const ligne = ligneBrute.trim();
        if (!/ALBUMINE|Albumine/i.test(ligne)) continue;

        const match = ligne.match(/(?:ALBUMINE|Albumine)\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*g\/L\b/i) ||
            ligne.match(/(?:ALBUMINE|Albumine)\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:<=|>=)?\s*[\d,. -]+\s*g\/L\b/i);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return extraireParUnite(texte, "Albumine", "g\\/L", /Albumine[^\d-]*([\d,.]+)\s*g\/L/i, fb("Albumine", "g\\/L"));
}

function extraireGGT(texte) {
    return extractValue(texte, /GAMMA\s+GT\s+([<>]?(?:=)?\d+(?:[.,]\d+)?)/i) ||
        extractValue(texte, /GGT\s+U\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i) ||
        extractValue(texte, /GGT\s+U\/L[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i) ||
        extraireFormatCisssInverse(texte, "GAMMA\\s+GT|GGT", "U\\/L") ||
        extraireParUnite(texte, "(?:Glutamyltransf[ée]rase\\s*\\(GGT\\)|GGT)", "U\\/L", /GGT[^\d-]*([\d,.]+)/i, fb("GGT", "U\\/L"));
}

function extrairePTH(texte) {
    return extraireFormatCisssInverse(texte, "PTH\\s*I-84|PTH intacte|Parathormone", "ng\\/L") ||
        extraireValeurSurLigne(texte, "PTH\\s*I-84|PTH intacte|Parathormone", "ng\\/L") ||
        extractValue(texte, /PTH\s*intacte\s*ng\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i) ||
        extractValue(texte, /PTH\s*intacte\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*ng\/L/i) ||
        extractValue(texte, /PTH\s*I-84\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*ng\/L/i) ||
        extractValue(texte, /Parathormone[\s\S]{0,80}?(\d+[.,]\d+|\d+)\s*ng\/L/i);
}

function extraireAcideUrique(texte) {
    const patterns = [
        /ACIDE URIQUE\s+(\d+[.,]?\d*)\s*[BH]?\s*\d+-\d+\s*umol\/L/i,
        /ACIDE URIQUE\s+(\d+[.,]?\d*)\s*[BH]?/i,
        /A\.\s*URIQUE\s+(\d+[.,]?\d*)\s*[BH]?/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    // Format AUTOV avec indicateur collé : "Urate umol/L AUTOVAH712 ..."
    let mUrate = texte.match(/Urate\s+umol\/L\s+AUTO[VHBCAX\/]*(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (mUrate) return normaliserValeur(mUrate[1]);

    // NOUVEAU : format "Urate umol/L CODEXXah<valeur> AAAA/" (ex: rapport IUCPQ)
    mUrate = texte.match(/Urate\s+umol\/L\s+[A-Z]{2,}\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (mUrate) return normaliserValeur(mUrate[1]);

    return extraireParUnite(
        texte,
        "(?:Acide urique|Urate)",
        "(?:umol|mmol)\\/L",
        /(?:Acide urique|Urate)[^\d-]*([\d,.]+)/i,
        fb("(?:Acide urique|Urate)", "(?:umol|mmol)\\/L")
    );
}

function extraireVitB12(texte) {
    // Format Hôpital de l'Enfant-Jésus :
    // "Vitamine B12 H >1 475 pmol/L ( >135 )"
    // → retourne ">1475"
    let m = texte.match(
        /Vitamine\s+B-?12\s+(?:[HLBA]\s+)?([<>]=?)\s*(\d[\d\s.,]*)\s*pmol\/L/i
    );
    if (m && m[1] && m[2]) {
        const valeur = m[2].replace(/[\s\u00A0]/g, "").replace(",", ".");
        return `${m[1]}${valeur}`;
    }

    let matchInverse = texte.match(/>=?\s*[\d,.]+\s*Vitamine B12\s+pmol\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (matchInverse && matchInverse[1]) return normaliserValeur(matchInverse[1]);

    const lignes = texte.split(/\r?\n/);
    for (let i = 0; i < lignes.length; i++) {
        if (!/VITAMINE B-?12|Vitamine B12/i.test(lignes[i])) continue;

        const memeLigne = lignes[i].match(
            /(?:VITAMINE B-?12|Vitamine B12)\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*pmol\/L/i
        ) || lignes[i].match(
            /(?:VITAMINE B-?12|Vitamine B12)\s+pmol\/L[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i
        );
        if (memeLigne && memeLigne[1]) return normaliserValeur(memeLigne[1]);

        for (let j = 1; j <= 10; j++) {
            const index = i - j;
            if (index < 0) break;
            const ligne = lignes[index].trim();
            if (!ligne) continue;
            if (/Normal|Déficient|neurologique|h[ée]matologique|Page|Rapport|Légende/i.test(ligne)) continue;
            if (/:/.test(ligne)) continue;

            const match = ligne.match(/^([<>]?(?:=)?\d+(?:[.,]\d+)?)(?:\s*[HLBA])?\s*pmol\/L\b/i);
            if (match && match[1]) return normaliserValeur(match[1]);
        }
    }

    const patterns = [
        />=?\s*[\d,.]+\s*Vitamine B12\s+pmol\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i,
        /VITAMINE B-12\s*(\d+[.,]?\d*)\s*pmol\/L/i,
        /(\d+[.,]?\d*)\s*pmol\/L[\s\S]{0,500}?VITAMINE B-12/i,
        /VITAMINE B-12[\s\S]{0,500}(\d+[.,]?\d*)\s*pmol\/L/i,
        /Vitamine B12\s+pmol\/L[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i,
        /Vitamine B12\s+pmol\/L[^\n]*?[A-Z]{3,}[A-Z0-9]*?(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d]{2,5}(?:[.,]\d+)?)/i,
        /Vitamine B12\s+([\d,.]+)\s+(?:<=|>=)?\s*[\d,. -]+\s*pmol\/L/i,
        /Vitamine B12[^\d-]*([\d,.]+)\s*pmol\/L/i
    ];

    for (const pattern of patterns) {
        const match = texte.match(pattern);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    return null;
}

function extraireVitD(texte) {
    let match = texte.match(/(\d+[.,]?\d*)\s*nmol\/L[\s\S]{0,250}?25\s*OH[- ]?VITAMINE\s*D/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/25\s*OH[- ]?VITAMINE\s*D\s+(\d+[.,]?\d*)\s*nmol\/L/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/25\s*OH[- ]?VITAMINE\s*D\s+(\d+[.,]?\d*)/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/25\s*[- ]?OH\s*[- ]?VITAMINED?\s+(\d+[.,]?\d*)/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/Vitamine\s*D\s*25\s*(?:\(\s*OH\s*\)|OH)[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/Vitamine\s*D\s*25\s*(?:\(\s*OH\s*\)|OH)\s+([\d,.]+)\s*nmol\/L/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    match = texte.match(/Vitamine D 25\(OH\)[^\d-]*([\d,.]+)\s*nmol\/L/i);
    if (match && match[1]) return normaliserValeur(match[1]);

    return extractValueNearAnchor(texte, /25\s*OH[- ]?VITAMINE\s*D|Vitamine\s*D\s*25/i, 10);
}

function extraireRNI(texte) {
    let m = texte.match(/\bRNI\b[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bRNI\b[^\n]*?[A-Z]{3,}[A-Z0-9]*?(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d]+[.,]\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bRNI\b\s+([\d,.]+)\b/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCaIonise(texte) {
    let m = texte.match(/Calcium ion pH 7,4\s*mmol\/L\s+[A-Z]{2,}\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d]+[.,]\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Calcium ion pH 7,4\s*mmol\/L[^\n]*?AUTO[VHBCAX]*\s*([\d]+[.,]\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Calcium\s+ionis[ée]\s+(\d+[.,]\d+|\d+)\s*(?:mmol\/L|L\b)?/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/CALCIUM IONIS[ÉE]\s+MESUR[ÉE][\s\S]{0,120}?Calcium ionis[ée]\s+(\d+[.,]\d+|\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Calcium\s+ion(?:is[ée])?\s+pH\s*7[,\.]4\s+([\d]+[.,]\d+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Calcium\s+ion(?:is[ée])?(?![^\n]*pH)[^\n]*?([\d]+[.,]\d+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ca\s*ionis[ée].*?([\d]+[.,]\d+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCaCorrige(texte) {
    let m = texte.match(/Ca\+\+\s*corrig[ée]\s*pH\s*7[,.]4\s+(\d+[.,]\d+|\d+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ca\+\+\s*corrig[ée]\s*pH\s*7[,.]4[^\d]*([\d]+[.,]\d+)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireUree(texte) {
    let compactCode4 = texte.match(/Ur[ée]e\s+mmol\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d{1,3}(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (compactCode4) return normaliserValeur(compactCode4[1]);

    // NOUVEAU : code labo à 2 chiffres seulement (ex: AH1)
    let compactCourt = texte.match(/Ur[ée]e\s+mmol\/L\s+[A-Z]{2,}\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (compactCourt) return normaliserValeur(compactCourt[1]);

    let compact = texte.match(/Ur[ée]e\s+mmol\/L\s+[A-Z]{2,}\d{3,}?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (compact) return normaliserValeur(compact[1]);

    let m = texte.match(/Ur[ée]e\s*mmol\/L\s+[A-Z]{2,}\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ur[ée]e\s+(?:[HLBA]\s*)?([\d,.]+)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ur[ée]e\s+([\d,.]+)\s+[\d,. -]+\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Ur[ée]e[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

/* CORRECTION : même correctif que extraireFormatRefCodeValeur — le code labo
   fait exactement 4 chiffres, ce qui évite que la valeur DVE (14,6) devienne
   414,6 en empruntant un chiffre du code (CAT0324). */
function extraireDVE(texte) {
    return extraireFormatRefCodeValeur(texte, "DVE|Indice dist\\. érythrocytaire", "%") ||
        extraireFormatCisssInverse(texte, "DVE|Indice dist\\. érythrocytaire", "%") ||
        extraireValeurSurLigne(texte, "DVE|Indice dist\\. érythrocytaire", "%") ||
        extraireParUnite(texte, "DVE|Indice dist\\. érythrocytaire", "%", /Indice dist\. érythrocytaire\s+(\d+[.,]\d+|\d+)\s/i, fb("DVE|Indice dist\\. érythrocytaire", "%")) ||
        extraireFormatCompactRef(texte, "DVE|Indice dist\\. érythrocytaire", "%") ||
        extractValue(texte, /\bDVE\b\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*%/i);
}

function extrairePhosphate(texte) {
    const compact = texte.match(/Phosph(?:ate|ore)\s+mmol\/L\s+[A-Z]{2,}\d{3,}?(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (compact) return normaliserValeur(compact[1]);

    return extractValue(texte, /Phosph(?:ate|ore)\s+mmol\/L[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i) ||
        extraireFormatCisssInverse(texte, "Phosph(?:ate|ore)|PHOSPHORE", "mmol\\/L") ||
        extraireValeurSurLigne(texte, "Phosph(?:ate|ore)|PHOSPHORE", "mmol\\/L") ||
        extraireParUnite(texte, "Phosph(?:ore|ate)|PHOSPHORE", "mmol\\/L", /PHOSPHORE\s+(\d+[.,]\d+|\d+)\s/i, fb("Phosph(?:ore|ate)|PHOSPHORE", "mmol\\/L")) ||
        extractValue(texte, /Phosph(?:ate|ore)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /PHOSPHORE\s+(\d+[.,]\d+|\d+)\s/i);
}

function extrairePotassium(texte) {
    return extraireFormatCisssInverse(texte, "Potassium|POTASSIUM", "mmol\\/L") ||
        extractValue(texte, /Potassium\s+mmol\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d{1,3}(?:[.,]\d+)?)\s+20\d{2}\//i) ||
        extraireValeurSurLigne(texte, "Potassium|POTASSIUM", "mmol\\/L") ||
        extractValue(texte, /Potassium\s+mmol\/L\s+[A-Z]{2,}\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)/i) ||
        extractValue(texte, /Potassium\s+mmol\/L[^\n]*?AUTO[VHBCAX\/]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i) ||
        extractValue(texte, /Potassium\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s+(?:<=|>=)?\s*[\d,. -]+\s*mmol\/L/i) ||
        extraireParUnite(texte, "Potassium|POTASSIUM", "mmol\\/L", /POTASSIUM\s+(\d+[.,]\d+|\d+)\s/i, fb("Potassium|POTASSIUM", "mmol\\/L")) ||
        extraireFormatCompactRef(texte, "Potassium|POTASSIUM", "mmol\\/L") ||
        extractValue(texte, /POTASSIUM\s+(\d+[.,]\d+|\d+)\s/i);
}

function extraireSodium(texte) {
    return extraireFormatCisssInverse(texte, "Sodium|SODIUM", "mmol\\/L") ||
        extractValue(texte, /Sodium\s+mmol\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d{1,3}(?:[.,]\d+)?)\s+20\d{2}\//i) ||
        extractValue(texte, /Sodium\s+mmol\/L\s+[A-Z]{2,}\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)/i) ||
        extraireParUnite(texte, "Sodium|SODIUM", "mmol\\/L", /SODIUM\s+(\d+)\s/i, fb("Sodium|SODIUM", "mmol\\/L")) ||
        extraireFormatCompactRef(texte, "Sodium|SODIUM", "mmol\\/L") ||
        extractValue(texte, /SODIUM\s+(\d+)\s/i);
}

function extraireChlorure(texte) {
    return extraireFormatCisssInverse(texte, "Chlor(?:ure|e)|CHLORURE", "mmol\\/L") ||
        extractValue(texte, /Chlor(?:ure|e)\s+mmol\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d{1,3}(?:[.,]\d+)?)\s+20\d{2}\//i) ||
        extractValue(texte, /Chlor(?:ure|e)\s+mmol\/L\s+[A-Z]{2,}\d{3,}?(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i) ||
        extractValue(texte, /Chlor(?:ure|e)\s+mmol\/L\s+[A-Z]{2,}\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)/i) ||
        extraireParUnite(texte, "Chlor(?:ure|e)|CHLORURE", "mmol\\/L", /CHLORURE\s+(\d+)\s/i, fb("Chlor(?:ure|e)|CHLORURE", "mmol\\/L")) ||
        extraireFormatCompactRef(texte, "Chlor(?:ure|e)|CHLORURE", "mmol\\/L") ||
        extractValue(texte, /Chlor(?:ure|e)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /CHLORURE\s+(\d+)\s/i);
}

function extraireALT(texte) {
    return extractValue(texte, /(?:^|\n)\s*(?:[<>]=?\s*)?\d+(?:[.,]\d+)?\s*ALT\s+U\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i) ||
        extraireFormatRefCodeValeur(texte, "ALT|ALT\\s*\\(GPT\\)", "U\\/L") ||
        extraireFormatCisssInverse(texte, "ALT|ALT\\s*\\(GPT\\)", "U\\/L") ||
        extraireValeurSurLigne(texte, "ALT|ALT\\s*\\(GPT\\)", "U\\/L") ||
        extraireParUnite(texte, "ALT|ALT\\s*\\(GPT\\)", "U\\/L", /ALT\s+\(GPT\)\s+(\d+)\s/i, fb("ALT|ALT\\s*\\(GPT\\)", "U\\/L")) ||
        extraireFormatCompactRef(texte, "ALT|ALT\\s*\\(GPT\\)", "U\\/L") ||
        extractValue(texte, /\bALT\b\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*U\/L/i) ||
        extractValue(texte, /ALT\s+\(GPT\)\s+(\d+)\s/i);
}

function extrairePhosphataseAlcaline(texte) {
    return extractValue(texte, /(?:^|\n)\s*(?:[<>]=?\s*)?\d+(?:[.,]\d+)?\s*-\s*(?:[<>]=?\s*)?\d+(?:[.,]\d+)?Phosphatase alcaline(?:\s*\(PA\))?\s+U\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i) ||
        extraireFormatRefCodeValeur(texte, "Phosphatase alcaline(?:\\s*\\([^)]*\\))?|Phosphatase alcaline\\s*\\(PA\\)|PHOSPHATASE ALCALINE", "U\\/L") ||
        extraireFormatCisssInverse(texte, "Phosphatase alcaline(?:\\s*\\([^)]*\\))?|PHOSPHATASE ALCALINE", "U\\/L") ||
        extractValue(texte, /Phosphatase alcaline(?:\s*\([^)]*\))?\s*U\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i) ||
        extraireValeurSurLigne(texte, "Phosphatase alcaline(?:\\s*\\([^)]*\\))?|PHOSPHATASE ALCALINE", "U\\/L") ||
        extraireParUnite(texte, "Phosphatase alcaline(?:\\s*\\([^)]*\\))?|PHOSPHATASE ALCALINE", "U\\/L", /PHOSPHATASE ALCALINE\s+(\d+)\s/i, fb("Phosphatase alcaline|PHOSPHATASE ALCALINE", "U\\/L")) ||
        extractValue(texte, /Phosphatase alcaline(?:\s*\([^)]*\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*U\/L/i);
}

function extraireLDH(texte) {
    return extractValue(texte, /Lactate d[ée]shydrog[ée]nase\s+U\/L\s+AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i) ||
        extraireValeurSurLigne(texte, "Lactate d[ée]shydrog[ée]nase(?:\\s*\\(LDH\\))?|LD\\s*\\(LDH\\)", "U\\/L") ||
        extraireParUnite(texte, "Lactate d[ée]shydrog[ée]nase(?:\\s*\\(LDH\\))?|LD\\s*\\(LDH\\)", "U\\/L", /LD\s+\(LDH\)\s+(\d+)\s/i, fb("Lactate d[ée]shydrog[ée]nase|LD\\s*\\(LDH\\)", "U\\/L")) ||
        extractValue(texte, /Lactate d[ée]shydrog[ée]nase\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*U\/L/i);
}

function extraireBilirubineTotale(texte) {
    return extractValue(texte, /(?:^|\n)\s*(?:[<>]=?\s*)?\d+(?:[.,]\d+)?\s*Bilirubine tot(?:ale)?\s+(?:u|µ|μ)mol\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+20\d{2}\//i) ||
        extraireFormatRefCodeValeur(texte, "Bilirubine tot(?:ale)?|BILIRUBINE TOTALE", "(?:u|µ|μ)mol\\/L") ||
        extraireFormatCisssInverse(texte, "Bilirubine tot(?:ale)?|BILIRUBINE TOTALE", "(?:u|µ|μ)mol\\/L") ||
        extractValue(texte, /Bilirubine tot(?:ale)?\s*(?:u|µ|μ)mol\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i) ||
        extraireValeurSurLigne(texte, "Bilirubine tot(?:ale)?|BILIRUBINE TOTALE", "(?:u|µ|μ)mol\\/L") ||
        extractValue(texte, /BILIRUBINE TOTALE\s+(\d+[.,]\d+|\d+)\s/i) ||
        extractValue(texte, /Bilirubine tot(?:ale)?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*(?:u|µ|μ)mol\/L/i);
}

function extraireLipase(texte) {
    return extraireValeurSurLigne(texte, "Lipase", "U\\/L") ||
        extractValue(texte, /Lipase\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*U\/L/i);
}

function extraireCTX(texte) {
    let m = texte.match(/C\s*Telopeptide\s+([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*ng\/ml/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/C\s*Telopeptide[^\n]*?AUTO[VHBCAX]*\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    return extraireParUnite(texte, "C\\s*Telopeptide", "ng\\/ml", /C\s*Telopeptide[^\d-]*([\d,.]+)/i, fb("C\\s*Telopeptide", "ng\\/ml"));
}

function extraireNTproBNP(texte) {
    const valeurAvecMilliers = "([<>]?(?:=)?(?:\\d{1,3}(?:[\\s\\u00a0]\\d{3})+|\\d+)(?:[.,]\\d+)?)";

    // NOUVEAU : code labo à 2 chiffres (ex: AH2375) - avant la variante 4 chiffres
    let mCourt = texte.match(new RegExp("NT-?proBNP\\s+ng\\/L\\s+[A-Z]{2,}\\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?" + valeurAvecMilliers + "\\s+20\\d{2}\\/", "i"));
    if (mCourt) return normaliserValeur(extractValue(mCourt[1], /^([<>]?(?:=)?\d+(?:[.,]\d+)?)$/) || mCourt[1]);

    return extractValue(texte, new RegExp("NT-?proBNP\\s+ng\\/L\\s+[A-Z]{2,}\\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?" + valeurAvecMilliers + "\\s+20\\d{2}\\/", "i")) ||
        extractValue(texte, new RegExp("NT-?proBNP\\s+ng\\/L\\s+[A-Z]{2,}\\d{2,}(?:AB|AH|AN|CB|CH|XB|XH)?" + valeurAvecMilliers + "\\s+20\\d{2}\\/", "i")) ||
        extractValue(texte, new RegExp("NT-?proBNP\\s+(?:[HLBA]\\s*)?" + valeurAvecMilliers + "\\s*ng\\/L", "i")) ||
        extractValue(texte, new RegExp("NT-?proBNP\\s+" + valeurAvecMilliers + "\\s+(?:AH|AB|AN|CB|CH|XB|XH)?\\s*ng\\/L", "i")) ||
        extraireParUnite(texte, "NT-?proBNP", "ng\\/L", new RegExp("NT-?proBNP[^\\d-]*" + valeurAvecMilliers + "\\s*ng\\/L", "i")) ||
        extraireValeurSurLigne(texte, "NT-?proBNP", "ng\\/L") ||
        extractValue(texte, new RegExp("NT-?proBNP\\s+(?:[HLBA]\\s*)?" + valeurAvecMilliers + "\\b", "i"));
}

function extraireCK(texte) {
    let m = texte.match(/Cr[ée]atine\s+kinase[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Cr[ée]atine\s+kinase\s+([\d,.]+)\s+(?:<=|>=)?\s*[\d,. -]+\s*U\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bCK\b[^\n]*?AUTO[VHBCAX]*\s*([\d,.]+)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bCK\b\s+([\d,.]+)\s+(?:<=|>=)?\s*[\d,. -]+\s*U\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireGB(texte) {
    let m = texte.match(/\bGB\b\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*10\*9\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Globules blancs[^\n]*?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*10\*9\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireLymphocytesAbs(texte) {
    const lignes = texte.split(/\r?\n/);

    for (const ligne of lignes) {
        if (!/Lymphocytes/i.test(ligne)) continue;

        const match = ligne.match(/Lymphocytes\s+(?:[HLBA]\s*)?[\d.,]+\s*\([^)]+\)\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
        if (match && match[1]) return normaliserValeur(match[1]);
    }

    let m = texte.match(/Lymphocytes[^\n]*?\b(?:absolu|absolue|abs)\b[^\d]*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCRP(texte) {
    let m = texte.match(/Prot[ée]ine C r[ée]active\s*mg\/L\s+[A-Z]{2,}\d{4}(?:AB|AH|AN|CB|CH|XB|XH)?([<>]?(?:=)?\d{1,3}(?:[.,]\d+)?)\s+20\d{2}\//i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Prot[ée]ine C r[ée]active\s*mg\/L\s+[A-Z]{2,}\d{3,}(?:AB|AH|AN|CB|CH|XB|XH)?\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Prot[ée]ine C r[ée]active\s*\(CRP\)\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mg\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bCRP\b\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mg\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireGlucose(texte) {
    let m = texte.match(/Glucose(?:\s+non\s+[àa]\s+jeun)?\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*mmol\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/\bGLUCOSE\b\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireTroponine(texte) {
    let m = texte.match(/Troponine\s+I\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*ng\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/Troponine[^\n]*?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*ng\/L/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireBNP(texte) {
    let m = texte.match(/(?:^|[^\w])BNP\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*ng\/L/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/(?:^|[^\w])BNP\s*(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)(?!\s*roBNP)/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireTG(texte) {
    return extraireFormatCisssInverse(texte, "Triglyc[ée]rides|TRIGLYCERIDES", "mmol\\/L") ||
        extractValue(texte, /<=?\s*[\d,.]+\s*Triglyc[ée]rides\s+mmol\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i) ||
        extractValue(texte, /Triglyc[ée]rides\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:<=|>=)?\s*[\d,. -]+\s*mmol\/L/i) ||
        extraireParUnite(texte, "Triglyc[ée]rides|TRIGLYCERIDES", "mmol\\/L", /TRIGLYCERIDES\s+(\d+[.,]\d+|\d+)\s/i, fb("Triglyc[ée]rides|TRIGLYCERIDES", "mmol\\/L")) ||
        extractValue(texte, /Triglyc[ée]rides\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /TRIGLYCERIDES\s+(\d+[.,]\d+|\d+)\s/i);
}

function extraireHDL(texte) {
    return extraireFormatCisssInverse(texte, "Cholest[ée]rol\\s+HDL|HDL\\s+CHOLESTEROL", "mmol\\/L") ||
        extractValue(texte, />=?\s*[\d,.]+\s*Cholest[ée]rol\s+HDL\s+mmol\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i) ||
        extractValue(texte, /Cholest[ée]rol\s+HDL\s+(?:[HLBA]\s*)?([<>]?(?:=)?\d+(?:[.,]\d+)?)\s+(?:<=|>=)?\s*[\d,. -]+\s*mmol\/L/i) ||
        extraireParUnite(texte, "Cholest[ée]rol(?:-|\\s+)HDL(?:\\s*\\(direct\\))?|HDL CHOLESTEROL", "mmol\\/L", /HDL CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i) ||
        extractValue(texte, /Cholest[ée]rol-HDL\s*\(direct\)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /Cholest[ée]rol(?:-|\\s+)HDL(?:\\s*\\(direct\\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /HDL CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i);
}

function extraireLDL(texte) {
    return extraireFormatCisssInverse(texte, "Cholest[ée]rol\\s+LDL|LDL\\s+CHOLESTEROL", "mmol\\/L") ||
        extractValue(texte, /Cholest[ée]rol LDL\s+\(calcul[ée]\)\s+mmol\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i) ||
        extractValue(texte, /Cholest[ée]rol(?:-|\s+)LDL(?:\s*\(calc(?:ul[ée])?\.?\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /LDL CHOLESTEROL\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)(?:\s+[HLBA])?\s+(?:[<>]=?\s*)?[\d,.]+(?:\s*-\s*[\d,.]+)?\s*mmol\/L/i) ||
        extraireParUnite(texte, "Cholest[ée]rol(?:-|\\s+)LDL(?:\\s*\\(calc\\.\\))?|LDL CHOLESTEROL", "mmol\\/L", /LDL CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i) ||
        extractValue(texte, /Cholest[ée]rol-LDL\s*\(calc\.\)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /Cholest[ée]rol(?:-|\\s+)LDL(?:\\s*\\(calc(?:ul[ée])?\\.?\\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /LDL CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i);
}

function extraireNonHDL(texte) {
    return extraireFormatCisssInverse(texte, "Cholest[ée]rol\\s+non\\s+HDL|CHOLESTEROL\\s+non-HDL", "mmol\\/L") ||
        extractValue(texte, /Cholest[ée]rol\s+non\s+HDL\s+mmol\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i) ||
        extractValue(texte, /Cholest[ée]rol\s+non(?:-|\s)HDL(?:\s*\(calc\.\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extraireParUnite(texte, "Cholest[ée]rol\\s+non(?:-|\\s)HDL(?:\\s*\\(calc\\.\\))?|CHOLESTEROL non-HDL", "mmol\\/L", /CHOLESTEROL non-HDL\s+(\d+[.,]\d+|\d+)\s/i) ||
        extractValue(texte, /Cholest[ée]rol\s+non-HDL\s*\(calc\.\)\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /Cholest[ée]rol\s+non(?:-|\\s)HDL(?:\\s*\\(calc\\.\\))?\s+(?:[HLBA]\s*)?(\d+[.,]\d+|\d+)\s*mmol\/L/i) ||
        extractValue(texte, /CHOLESTEROL non-HDL\s+(\d+[.,]\d+|\d+)\s/i);
}

function extrairePSA(texte) {
    return extraireFormatCisssInverse(texte, "PSA", "ug\\/L") ||
        extractValue(texte, /PSA\s+ug\/L\s+AUTO[VHBCAX]*\s*([\d,.]+)/i) ||
        extractValue(texte, /PSA\s+(\d+[.,]\d+|\d+)\s*ug\/L/i) ||
        extractValue(texte, /PSA\s+(\d+[.,]\d+|\d+)\s/i);
}

function extraireComplement(texte, type) {
    const regex = new RegExp(`Compl[ée]ment\\s+${type}\\s*(?:[HLBA]\\s*)?([<>]?(?:=)?\\d+(?:[.,]\\d+)?)\\s*g\\/L`, "i");
    const match = texte.match(regex);
    return match && match[1] ? normaliserValeur(match[1]) : null;
}

function extraireAntiADN(texte) {
    let m = texte.match(/Anti-ADN\s*\(anti-DS-DNA\)\s*:\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*UI\/mL/i);
    if (m) return normaliserValeur(m[1]);

    m = texte.match(/anti-DS-DNA[^\d]*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*UI\/mL/i);
    if (m) return normaliserValeur(m[1]);

    return null;
}

function extraireCrithidia(texte) {
    const m = texte.match(/Crithidia\s+luciliae\s*:\s*(positif|n[ée]gatif|[ée]quivoque)/i);
    return m && m[1] ? m[1].toLowerCase() : null;
}

function extraireAntiENA(texte) {
    const m = texte.match(/Ac\s+anti-ENA\s*\(d[ée]pistage\)\s*([<>]?(?:=)?\d+(?:[.,]\d+)?)\s*Ratio/i);
    return m && m[1] ? normaliserValeur(m[1]) : null;
}

function normaliserAntibiotique(nom) {
    const map = {
        "Nitrofurantoine": "Nitrofurantoïne",
        "Fosfomycine": "Fosfomycine",
        "Ampicilline": "Ampicilline",
        "Amoxicilline+clavulanate": "Amoxicilline-clavulanate",
        "Amoxicilline": "Amoxicilline",
        "Piperacilline+tazobactam": "Pipéracilline-tazobactam",
        "Pip-tazo": "Pip-tazo",
        "Cefalexine": "Céfalexine",
        "Cephalexine": "Céphalexine",
        "Cefuroxime": "Céfuroxime",
        "Cefuroxime oral": "Céfuroxime",
        "Céfuroxime oral": "Céfuroxime",
        "Cefuroxime IV": "Céfuroxime",
        "Ceftriaxone": "Ceftriaxone",
        "Ceftazidime": "Ceftazidime",
        "Cefixime": "Cefixime",
        "Cefepime": "Céfépime",
        "Ertapenem": "Ertapénem",
        "Imipenem": "Imipénem",
        "Meropenem": "Méropénem",
        "Trimethoprime+sulfamethoxazole": "TMP-SMX",
        "TMP-SMX": "TMP-SMX",
        "Gentamicine": "Gentamicine",
        "Tobramycine": "Tobramycine",
        "Ciprofloxacine": "Ciprofloxacine",
        "Vancomycine": "Vancomycine",
        "Vancomycine (IV)": "Vancomycine",
        "Penicilline": "Pénicilline"
    };

    return map[nom] || nom;
}

function normaliserOrganisme(nom) {
    const map = {
        "Enterococcus faecalis": "E. faecalis",
        "Escherichia coli": "E. coli",
        "Klebsiella pneumoniae": "K. pneumoniae",
        "Pseudomonas aeruginosa": "P. aeruginosa",
        "Proteus mirabilis": "P. mirabilis",
        "Staphylococcus aureus": "S. aureus",
        "Staphylococcus saprophyticus": "S. saprophyticus",
        "Enterobacter cloacae": "E. cloacae",
        "Citrobacter freundii": "C. freundii",
        "Klebsiella oxytoca": "K. oxytoca",
        "Serratia marcescens": "S. marcescens",
        "Morganella morganii": "M. morganii"
    };

    return map[nom] || nom;
}

function extraireDateCulture(texte) {
    const m = texte.match(/Urine\s*;\s*Culture\s+FINAL\s+(\d{4}\/\d{2}\/\d{2})/i)
        || texte.match(/URINE\s*\(culture\)\s*\*?\s*FINAL\s+(\d{2,4}\/\d{2}\/\d{2})/i);
    if (!m) return null;
    let d = m[1];
    if (d.length === 8) d = `20${d}`;
    return d;
}

/* Nettoie le libellé d'un organisme: retire la quantification (UFC/L, 10eN),
   les commentaires et la ponctuation résiduelle. Retourne null si le texte ne
   ressemble pas à un nom d'organisme. */
function nettoyerNomOrganisme(brut) {
    const nom = String(brut || "")
        .split(/\s+(?:Sensible|Interm[ée]diaire|R[ée]sistant)\b/i)[0]
        // quantification, avant ou après le nom: ">= 10e7 UFC/L", "entre 10e6 et 10e7 UFC/L"
        .replace(/\b(?:entre|environ|et)\b/gi, " ")
        .replace(/[<>=\u2265\u2264]+/g, " ")
        .replace(/\b\d+(?:[.,]\d+)?\s*[x\u00d7]\s*10e\d\b/gi, " ")
        .replace(/\b10e\d\b/gi, " ")
        .replace(/\b(?:UFC|CFU)\s*\/\s*[mM]?[Ll]\b/gi, " ")
        .replace(/\s+/g, " ")
        .replace(/[\s.:;,\-]+$/, "")
        .trim();

    if (nom.length < 4) return null;
    if (/\d/.test(nom)) return null;
    if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.()\-\s]*$/.test(nom)) return null;

    return nom;
}

/* Associe un numéro d'organisme (01, 02, ...) à son nom. Gère les formats:
     (01) Escherichia coli >= 10e7 UFC/L
     Organisme 01: Escherichia coli
     ORG: 01 - Escherichia coli
     ORG# 01 Escherichia coli */
function extraireOrganismesParNumero(texte) {
    const organismes = {};

    const motifs = [
        /^\(\s*0?(\d{1,2})\s*\)\s*(.+)$/,
        /^(?:Organisme|ORGANISME|ORG)\s*#?\s*[:\-]?\s*0?(\d{1,2})\s*[:\-.]?\s*(.+)$/i
    ];

    for (const ligne of texte.split(/\r?\n/)) {
        const ligneTrim = ligne.trim();
        if (!ligneTrim) continue;

        for (const motif of motifs) {
            const m = ligneTrim.match(motif);
            if (!m) continue;

            const nom = nettoyerNomOrganisme(m[2]);
            if (!nom) break;

            const key = m[1].padStart(2, "0");
            if (!organismes[key]) organismes[key] = normaliserOrganisme(nom);
            break;
        }
    }

    return organismes;
}

/* Analyse une ligne d'antibiogramme: retourne le nom de l'antibiotique et les
   statuts trouvés avec leur position (colonne) dans la ligne brute. Gère la
   valeur de CMI facultative et le code de méthode en fin de ligne (ex. D1). */
function analyserLigneAntibiogramme(ligneBrute) {
    const ligne = ligneBrute.replace(/\s+$/, "");
    if (!ligne.trim() || /^\s*CMI\b/i.test(ligne)) return null;

    const m = ligne.match(/^(\s*\*{0,4}\s*)([A-Za-zÀ-ÿ0-9()+\-\/.,\s]+?)\*{0,3}((?:\s+(?:[<>=\u2265\u2264]{1,2}\s*)?\d+(?:[.,]\d+)?)?)((?:\s+(?:S|R|I|SDD|NS))+)(?:\s+D\d+)?\s*$/i);
    if (!m) return null;

    const nom = normaliserAntibiotique(m[2].trim().replace(/\*+$/, "").trim());
    if (!nom) return null;

    const debutStatuts = m[1].length + m[2].length + m[3].length;
    const statuts = [...ligne.substring(debutStatuts).matchAll(/\b(S|R|I|SDD|NS)\b/gi)]
        .map(s => ({ statut: s[1].toUpperCase(), pos: debutStatuts + s.index }));

    if (statuts.length === 0) return null;

    return { nom, statuts };
}

/* Gabarit des colonnes de statuts: positions de la ligne la plus complète du bloc. */
function gabaritColonnes(lignes) {
    let gabarit = [];
    for (const ligne of lignes) {
        if (ligne.statuts.length > gabarit.length) gabarit = ligne.statuts.map(s => s.pos);
    }
    return gabarit;
}

/* Vrai si les colonnes du gabarit sont réellement espacées (mise en page du
   rapport conservée). Si le texte collé a perdu l'alignement, les statuts sont
   collés les uns aux autres et l'information de colonne est inutilisable. */
function colonnesAlignees(gabarit) {
    if (gabarit.length <= 1) return true;
    for (let i = 1; i < gabarit.length; i++) {
        if (gabarit[i] - gabarit[i - 1] < 6) return false;
    }
    return true;
}

/* Affecte des positions à des colonnes de référence en conservant l'ordre
   (affectation croissante minimisant l'écart total). Retourne un index de
   colonne par position. */
function affecterColonnes(positions, colonnes) {
    if (positions.length === 0) return [];
    if (colonnes.length === 0 || positions.length >= colonnes.length) return positions.map((p, i) => i);

    const INF = Infinity;
    const cout = [];
    const choix = [];
    for (let i = 0; i <= positions.length; i++) {
        cout.push(new Array(colonnes.length + 1).fill(INF));
        choix.push(new Array(colonnes.length + 1).fill(-1));
    }
    for (let j = 0; j <= colonnes.length; j++) cout[positions.length][j] = 0;

    for (let i = positions.length - 1; i >= 0; i--) {
        for (let j = colonnes.length - 1; j >= 0; j--) {
            for (let k = j; k <= colonnes.length - (positions.length - i); k++) {
                const suite = cout[i + 1][k + 1];
                if (suite === INF) continue;
                const total = Math.abs(positions[i] - colonnes[k]) + suite;
                if (total < cout[i][j]) {
                    cout[i][j] = total;
                    choix[i][j] = k;
                }
            }
        }
    }

    const affectation = [];
    let j = 0;
    for (let i = 0; i < positions.length; i++) {
        const k = choix[i][j];
        if (k < 0) return positions.map((p, idx) => idx);
        affectation.push(k);
        j = k + 1;
    }
    return affectation;
}

/* Associe chaque colonne du gabarit à un numéro d'organisme. Les statuts sont
   décalés à droite des entêtes ORG#NN: on retient le décalage global qui aligne
   le mieux le gabarit sur les entêtes. */
function associerColonnesOrganismes(gabarit, entetes) {
    if (entetes.length === 0) return gabarit.map((p, i) => String(i + 1).padStart(2, "0"));
    if (gabarit.length >= entetes.length) return entetes.map(e => e.no);

    const positionsEntetes = entetes.map(e => e.pos);
    let meilleur = null;

    for (const p of gabarit) {
        for (const q of positionsEntetes) {
            const positions = gabarit.map(x => x - (p - q));
            const affectation = affecterColonnes(positions, positionsEntetes);
            const cout = affectation.reduce((somme, idx, i) => somme + Math.abs(positions[i] - positionsEntetes[idx]), 0);
            if (!meilleur || cout < meilleur.cout) meilleur = { cout, affectation };
        }
    }

    return meilleur ? meilleur.affectation.map(idx => entetes[idx].no) : entetes.map(e => e.no);
}

/* Groupe taxonomique d'un organisme, utilisé pour savoir quels antibiotiques le
   laboratoire rapporte pour lui. */
function groupeOrganisme(nom) {
    const n = String(nom || "").toLowerCase();

    if (/enterococcus|e\.\s*faecalis|e\.\s*faecium/.test(n)) return "enterocoque";
    if (/staphylococcus|s\.\s*aureus|s\.\s*saprophyticus|s\.\s*epidermidis/.test(n)) return "staphylocoque";
    if (/streptococcus|s\.\s*agalactiae/.test(n)) return "streptocoque";
    if (/pseudomonas|p\.\s*aeruginosa/.test(n)) return "pseudomonas";
    if (/escherichia|e\.\s*coli/.test(n)) return "ecoli";
    if (/klebsiella|k\.\s*pneumoniae|k\.\s*oxytoca/.test(n)) return "klebsiella";
    if (/proteus|p\.\s*mirabilis/.test(n)) return "proteus";
    if (/enterobacter|citrobacter|serratia|morganella|e\.\s*cloacae|c\.\s*freundii|s\.\s*marcescens|m\.\s*morganii/.test(n)) return "enterobacterie";

    return null;
}

/* Groupes d'organismes pour lesquels le laboratoire rapporte chaque antibiotique.
   Sert à rattacher les résultats à la bonne colonne quand le texte collé a perdu
   l'alignement du tableau (ex. « TMP-SMX S S » n'est pas rapporté pour les
   entérocoques: les deux résultats sont donc ceux des bacilles Gram négatif). */
function groupesTestesPourAntibiotique(antibiotique) {
    const entero = ["ecoli", "klebsiella", "proteus", "enterobacterie"];
    const table = {
        "Nitrofurantoïne": ["enterocoque", "staphylocoque", "ecoli", "klebsiella", "enterobacterie"],
        "Fosfomycine": ["ecoli"],
        "Pénicilline": ["enterocoque", "staphylocoque", "streptocoque"],
        "Amoxicilline": ["enterocoque", "ecoli", "proteus", "streptocoque"],
        "Amoxicilline-clavulanate": entero.concat(["staphylocoque"]),
        "Ampicilline": entero.concat(["enterocoque"]),
        "Vancomycine": ["enterocoque", "staphylocoque", "streptocoque"],
        "TMP-SMX": entero.concat(["staphylocoque"]),
        "Céphalexine": entero,
        "Céfalexine": entero,
        "Céfuroxime": entero,
        "Cefixime": entero,
        "Céfixime": entero,
        "Ceftriaxone": entero,
        "Ceftazidime": entero.concat(["pseudomonas"]),
        "Céfépime": entero.concat(["pseudomonas"]),
        "Pip-tazo": entero.concat(["pseudomonas"]),
        "Pipéracilline-tazobactam": entero.concat(["pseudomonas"]),
        "Ertapénem": entero,
        "Imipénem": entero.concat(["pseudomonas"]),
        "Méropénem": entero.concat(["pseudomonas"]),
        "Méropénème": entero.concat(["pseudomonas"]),
        "Gentamicine": entero.concat(["pseudomonas", "staphylocoque"]),
        "Tobramycine": entero.concat(["pseudomonas"]),
        "Ciprofloxacine": entero.concat(["pseudomonas"])
    };

    return table[antibiotique] || null;
}

/* Organismes (numéros de colonne) auxquels un antibiotique peut appartenir.
   Retourne null si la table ne permet pas de conclure. */
function organismesCandidats(antibiotique, entetes, organismes) {
    const groupes = groupesTestesPourAntibiotique(antibiotique);
    if (!groupes) return null;

    const candidats = [];
    for (const entete of entetes) {
        const groupe = groupeOrganisme(organismes[entete.no]);
        if (!groupe) return null;
        if (groupes.includes(groupe)) candidats.push(entete.no);
    }

    return candidats;
}

/* Extrait, pour chaque colonne ORG#NN d'un tableau d'antibiogramme, la liste des
   antibiotiques testés avec leur statut S/I/R. Les statuts sont attribués selon
   leur position horizontale quand la mise en page est conservée, sinon selon le
   panel d'antibiotiques rapporté pour chaque organisme. Un résultat qui reste
   ambigu n'est attribué à aucun organisme. */
function extraireTableauAntibiogramme(texte, organismes = {}) {
    const resultatsParOrg = {};

    const ajouter = (orgNo, statut, antibiotique) => {
        const cible = statut === "S" ? "sensibles" : statut === "R" ? "resistants" : statut === "I" ? "intermediaires" : null;
        if (!cible) return;
        if (!resultatsParOrg[orgNo]) resultatsParOrg[orgNo] = { sensibles: [], resistants: [], intermediaires: [] };
        if (!resultatsParOrg[orgNo][cible].includes(antibiotique)) resultatsParOrg[orgNo][cible].push(antibiotique);
    };

    const traiterBloc = (entetes, lignes) => {
        if (lignes.length === 0) return;
        const gabarit = gabaritColonnes(lignes);
        const orgsParColonne = associerColonnesOrganismes(gabarit, entetes);
        const colonnesFiables = entetes.length <= 1 || colonnesAlignees(gabarit);

        for (const ligne of lignes) {
            if (colonnesFiables) {
                const affectation = affecterColonnes(ligne.statuts.map(s => s.pos), gabarit);
                ligne.statuts.forEach((s, i) => {
                    const idx = affectation[i];
                    const orgNo = orgsParColonne[idx] || String(idx + 1).padStart(2, "0");
                    ajouter(orgNo, s.statut, ligne.nom);
                });
                continue;
            }

            // Sans alignement exploitable, on se rabat sur le panel testé pour
            // chaque organisme; si le compte ne correspond pas exactement, le
            // résultat reste ambigu et n'est attribué à personne.
            const candidats = organismesCandidats(ligne.nom, entetes, organismes);
            if (!candidats || candidats.length !== ligne.statuts.length) continue;

            ligne.statuts.forEach((s, i) => ajouter(candidats[i], s.statut, ligne.nom));
        }
    };

    let entetes = [];
    let lignesBloc = [];
    let dansBloc = false;

    // Fin d'un tableau: légende ou début d'une autre section du rapport
    const rxFinBloc = /^\s*(?:S\s*=\s*Sensible|L[ée]gende des r[ée]sultats|-+\s*COMMENTAIRES|R[ée]vis[ée] par\s*:|ADRESSE DE LABORATOIRE)/i;

    for (const ligneBrute of texte.split(/\r?\n/)) {
        const entetesLigne = [...ligneBrute.matchAll(/ORG#\s*0?(\d{1,2})/gi)];
        if (entetesLigne.length > 0) {
            if (dansBloc) {
                traiterBloc(entetes, lignesBloc);
                lignesBloc = [];
                dansBloc = false;
            }
            entetes = entetesLigne.map(x => ({ no: x[1].padStart(2, "0"), pos: x.index + x[0].length - x[1].length }));
            // Format une colonne par organisme: "Organisme ORG# 01" ouvre directement
            // le tableau de cet organisme (pas d'entête "Antibiotiques CMI").
            if (/^\s*Organisme\s+ORG#/i.test(ligneBrute)) dansBloc = true;
            continue;
        }

        if (/^\s*Antibiotiques?\s+CMI/i.test(ligneBrute)) {
            if (dansBloc) {
                traiterBloc(entetes, lignesBloc);
                lignesBloc = [];
            }
            dansBloc = true;
            continue;
        }

        if (!dansBloc) continue;

        if (rxFinBloc.test(ligneBrute)) {
            traiterBloc(entetes, lignesBloc);
            lignesBloc = [];
            dansBloc = false;
            continue;
        }

        const ligne = analyserLigneAntibiogramme(ligneBrute);
        if (ligne) lignesBloc.push(ligne);
    }

    if (dansBloc) traiterBloc(entetes, lignesBloc);

    return resultatsParOrg;
}

function extraireCultureUrinaireComplete(texte) {
    if (!/MICROBIOLOGIE|CULTURE MICROBIENNE/i.test(texte)) return null;
    if (!/Urine\s*;\s*Culture|URINE\s*\(culture\)/i.test(texte)) return null;

    const dateCulture = extraireDateCulture(texte) || extraireDate(texte);

    if (/Contamination probable/i.test(texte) && !/ORG#\s*0?\d/i.test(texte)) {
        return { type: "contamination", texte: "Culture urinaire: Contamination" };
    }

    const organismes = extraireOrganismesParNumero(texte);
    const antibiogramme = extraireTableauAntibiogramme(texte, organismes);

    const numeros = Array.from(new Set([...Object.keys(organismes), ...Object.keys(antibiogramme)])).sort();

    if (numeros.length === 0) return null;

    const lignesResume = [];

    for (const no of numeros) {
        const nomComplet = organismes[no];
        const nomAffiche = nomComplet ? `${nomComplet}` : `Organisme ${no}`;
        const res = antibiogramme[no] || { sensibles: [], resistants: [], intermediaires: [] };

        const parties = [];
        if (res.sensibles.length > 0) parties.push(`Sensible à ${res.sensibles.join(", ")}`);
        if (res.intermediaires.length > 0) parties.push(`Intermédiaire à ${res.intermediaires.join(", ")}`);
        if (res.resistants.length > 0) parties.push(`Résistant à ${res.resistants.join(", ")}`);

        if (parties.length > 0) {
            lignesResume.push(`${nomAffiche}: ${parties.join(". ")}`);
        } else {
            lignesResume.push(`${nomAffiche}`);
        }
    }

    if (lignesResume.length === 0) return null;

    const resume = lignesResume.join("\n");

    return { type: "culture", date: dateCulture, texte: resume };
}

/* Format microbiologie CISSS où l'étiquette et la date sont sur des lignes
   distinctes:
     Urine (sonde) - à demeure Prélevé le:
     Reçu le:
     Ensemencé le:
     26/06/28 10:01
   La première date qui suit l'étiquette est celle du prélèvement. */
function extraireDatePrelevementMultiligne(texte) {
    const lignes = texte.split(/\r?\n/);

    for (let i = 0; i < lignes.length; i++) {
        if (!/Pr[ée]lev[ée]e?\s*(?:le)?\s*:?\s*$/i.test(lignes[i].trim())) continue;

        for (let k = i + 1; k < Math.min(lignes.length, i + 8); k++) {
            let m = lignes[k].match(/\b(\d{4})[-\/](\d{2})[-\/](\d{2})\b/);
            if (m) return `${m[1]}/${m[2]}/${m[3]}`;

            m = lignes[k].match(/\b(\d{2})\/(\d{2})\/(\d{2})\b/);
            if (m) return `20${m[1]}/${m[2]}/${m[3]}`;
        }
    }

    return null;
}

function extraireDate(texte) {
    let m = texte.match(/Prélevée (?:le|à la date du)?\s*(\d{4})[-/](\d{2})[-/](\d{2})/i);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;

    m = texte.match(/PR[ÉE]LEV[ÉE][^\n]*?(\d{4}[-\/]\d{2}[-\/]\d{2})/i);
    if (m) return m[1].replace(/-/g, "/");

    m = texte.match(/PR[ÉE]LEV[ÉE][^\n]*?(\d{2})\/(\d{2})\/(\d{2})/i);
    if (m) return `20${m[1]}/${m[2]}/${m[3]}`;

    m = texte.match(/Pr[ée]lev[ée]e?\s+le\s+(\d{4}[-\/]\d{2}[-\/]\d{2})/i);
    if (m) return m[1].replace(/-/g, "/");

    m = texte.match(/Pr[ée]lev[ée]e?\s+le\s+(\d{2})\/(\d{2})\/(\d{2})/i);
    if (m) return `20${m[1]}/${m[2]}/${m[3]}`;

    m = texte.match(/Prélevé le\s*(\d{4}[-/]\d{2}[-/]\d{2})/i);
    if (m) return m[1].replace(/-/g, "/");

    const datePrelevement = extraireDatePrelevementMultiligne(texte);
    if (datePrelevement) return datePrelevement;

    const matches = [...texte.matchAll(/(\d{4})[/-](\d{2})[/-](\d{2})/g)];
    let meilleure = null;
    let max = "00000000";
    for (const match of matches) {
        const contexte = texte.substring(Math.max(0, match.index - 50), match.index + 50);
        if (/Rapport imprimable généré|Imprimé le|Date d'impression/i.test(contexte)) continue;
        const cle = `${match[1]}${match[2]}${match[3]}`;
        if (cle > max) {
            max = cle;
            meilleure = match;
        }
    }
    if (meilleure) return `${meilleure[1]}/${meilleure[2]}/${meilleure[3]}`;

    m = texte.match(/\b(\d{2})[/-](\d{2})[/-](\d{2})\b/);
    if (m) return `20${m[3]}/${m[2]}/${m[1]}`;

    return "????/??/??";
}

function extraireHeurePrelevement(texte) {
    let m = texte.match(/(?:Prélevé\s*le|Prélevée\s*le|Enregistré\s*le)[\s\S]*?\s*à\s*(\d{2})h(\d{2})m/i);
    if (m) return `${m[1]}h${m[2]}`;

    m = texte.match(/(?:Prélevé\s*le|Prélevée\s*le|Enregistré\s*le)[\s\S]*?\s*(\d{2}):(\d{2})(?::\d{2})?/i);
    if (m) return `${m[1]}h${m[2]}`;

    const shortText = texte.substring(0, 500);
    m = shortText.match(/(?:Prélevée\s+(?:le\s+\d{4}[-/]\d{2}[-/]\d{2}\s+)?(?:à\s+)?|Heure:\s*)(\d{1,2})[h:](\d{2})/i);
    if (m) return `${m[1].padStart(2, "0")}h${m[2].padStart(2, "0")}`;

    m = texte.match(/(\d{1,2})[h:](\d{2})/);
    if (m) return `${m[1].padStart(2, "0")}h${m[2].padStart(2, "0")}`;

    return null;
}

function processRapport(texte) {
    texte = (texte || "").replace(/\b(AB|AH|AN|CB|CH|XB|XH)\b/g, "");

    if (!texte.trim()) return "Veuillez coller un rapport de laboratoire dans la zone de texte.";

    const num = "(\\d{1,3}(?:[\\s\u00a0]\\d{3})*(?:[.,]\\d+)?|\\d+[.,]\\d+|\\d+)";
    const motifHB = "(?:\\s*[HB])?\\s*";
    const motifParam = param => new RegExp(param + motifHB + num, "i");

    const albumine = extraireAlbumine(texte);
    const caIonCorrigePh = extraireCaCorrige(texte);
    const calciumTotal = extraireParUnite(
        texte,
        "Calcium(?:\\s+total)?(?!\\s+ion)",
        "mmol\\/L",
        motifParam("Calcium(?:\\s+total)?(?!\\s+ion)"),
        fb("Calcium(?:\\s+total)?(?!\\s+ion)", "mmol\\/L")
    ) || extractValue(texte, /CALCIUM TOTAL\s+(\d+[.,]\d+|\d+)/i);

    const valeurs = {
        GB: extraireGB(texte),
Hb: extraireHb(texte) ||
    extraireValeurSurLigne(texte, "H[ée]moglobine|\\bHb\\b", "g\\/L") ||
    extraireParUnite(texte, "Hb|Hémoglobine", "g\\/L", /(?:Hb|H[ée]moglobine)\s+(\d+)\s/i, fb("Hb|Hémoglobine", "g\\/L")) ||
    extraireFormatCompactRef(texte, "Hb|Hémoglobine", "g\\/L") ||
    extractValue(texte, /(?:Hb|H[ée]moglobine)\s+(\d+)\s/i),

VGM: extraireVGM(texte),
        DVE: extraireDVE(texte),
        RNI: extraireRNI(texte),
        "Créat": extraireCreatinine(texte) ||
            extraireFormatCisssInverse(texte, "Cr[ée]atinine|CREATININE", "[uµμ]mol\\/L") ||
            extraireParUnite(texte, "Cr[ée]atinine|CREATININE", "[uµμ](?:mol|M)\\/L", /CREATININE\s+(\d+)\s/i, fb("Cr[ée]atinine|CREATININE", "[uµμ](?:mol|M)\\/L")) ||
            extraireFormatCompactRef(texte, "Cr[ée]atinine|CREATININE", "[uµμ](?:mol|M)\\/L") ||
            extractValue(texte, /Cr[ée]atinine\s+(?:[HLBA]\s*)?(\d+)\s*[uµμ](?:mol|M)\/L/i) ||
            extractValue(texte, /CREATININE\s+(\d+)\s/i),
        DFGe: extraireDFGe(texte) || extraireFormatCisssInverse(texte, "DFGe\\s*\\(CKD-EPI\\)", "m[Ll]\\/min\\/1[.,]73m2"),
        "Urée": extraireUree(texte),
        Na: extraireSodium(texte),
        K: (extrairePotassium(texte) || null),
        Cl: extraireChlorure(texte),
        Pi: extrairePhosphate(texte),
        Mg: extraireMg(texte),
        Alb: albumine,
        "Pré-alb": extraireParUnite(texte, "Pr[ée]-albumine", "mg\\/L", /Pr[ée]-albumine[^\d-]*([\d,.]+)\s*mg\/L/i, fb("Pr[ée]-albumine", "mg\\/L")),
        Ca: calciumTotal,
        "Ca (corr.)": null,
        "Ca ion. pH": caIonCorrigePh,
        "Ca ionisé": extraireCaIonise(texte),
        "Ac. urique": extraireAcideUrique(texte),
        BiliT: extraireBilirubineTotale(texte),
        ALT: extraireALT(texte),
        AST: extraireFormatCisssInverse(texte, "AST|AST\\s*\\(GOT\\)", "U\\/L") ||
            extraireParUnite(texte, "AST|AST\\s*\\(GOT\\)", "U\\/L", /AST\s+\(GOT\)\s+(\d+)\s/i, fb("AST|AST\\s*\\(GOT\\)", "U\\/L")),
        CK: extraireCK(texte),
        GGT: extraireGGT(texte),
        LDH: extraireLDH(texte),
        PAL: extrairePhosphataseAlcaline(texte),
        Lipase: extraireLipase(texte),
      CTX: extraireCTX(texte),
        CRP: extraireCRP(texte),
        CT: extraireFormatCisssInverse(texte, "[0-9>]CHOLESTEROL", "mmol\\/L") ||
            extraireCT(texte) || extractValue(texte, /CHOLESTEROL\s+(\d+[.,]\d+|\d+)\s/i),
        TG: extraireTG(texte),
        HDL: extraireHDL(texte),
        LDL: extraireLDL(texte),
        "non-HDL": extraireNonHDL(texte),
        ApoB: extraireFormatCisssInverse(texte, "APOLIPOPROTEINES?\\s+B", "g\\/L") || extraireApoB(texte),
LpA: extraireLpA(texte),
        TSH: extraireFormatCisssInverse(texte, "TSH", "mU[I]?\\/L") ||
            extraireParUnite(texte, "(?:Thyréostimuline\\s*\\(TSH\\)|TSH)", "mUI\\/L", /TSH\s+(\d+[.,]\d+|\d+)\s/i, fb("(?:Thyréostimuline\\s*\\(TSH\\)|TSH)", "mUI\\/L")) ||
            extraireFormatCompactRef(texte, "(?:Thyréostimuline\\s*\\(TSH\\)|TSH)", "mUI\\/L"),
        T4L: extraireParUnite(texte, "(?:Thyroxine\\s*libre\\s*\\(T4\\)|T4\\s*libre|T4 LIBRE)", "pmol\\/L", /T4 LIBRE\s+(\d+[.,]\d+|\d+)\s/i),
        Prolactine: extraireProlactine(texte),
        "Vit. B12": extraireVitB12(texte),
        "Vit. D": extraireVitD(texte),
        HbA1c: extraireA1c(texte),
        Fructosamine: (() => {
            const fruc = extraireFructosamine(texte);
            if (!fruc) return null;
            const a1cEstime = fructosamineVersHbA1c(fruc);
            return a1cEstime ? `${fruc} (HbA1c ${a1cEstime})` : fruc;
        })(),
        RAC: extraireRAC(texte),
        TSAT: extraireTSAT(texte),
        Ferritine: extraireFormatCisssInverse(texte, "FERRITINE", "ng\\/mL") ||
            extractValue(texte, /FERRITINE\s+(\d+)\s/i) || extraire(texte, /Ferritine[^\d-]*([\d,.]+)/i),
        TestT: extraireTestosterone(texte),
        DHEA: extraireDHEA(texte),
        Estradiol: extraireEstradiol(texte),
        SHBG: extraireSHBG(texte),
        BNP: extraireBNP(texte),
        NTproBNP: extraireNTproBNP(texte),
        PTH: extrairePTH(texte),
        PSA: extrairePSA(texte),
        Li: extraireLiStrict(texte)
    };

    const suffixeHemolysePotassium = extraireHemolysePotassium(texte);
    if (valeurs.K && suffixeHemolysePotassium && !String(valeurs.K).endsWith(suffixeHemolysePotassium)) {
        valeurs.K = `${valeurs.K}${suffixeHemolysePotassium}`;
    }

    delete valeurs.GB;

    if (valeurs.Ca && valeurs.Alb) {
        const ca = parseFloat(valeurs.Ca);
        const alb = parseFloat(valeurs.Alb);
        valeurs["Ca (corr.)"] = (ca + 0.02 * (40 - alb)).toFixed(2);
    }

    if (valeurs["Ca ion. pH"]) {
        delete valeurs["Ca ionisé"];
    }

    const cultureComplete = extraireCultureUrinaireComplete(texte);
    const date = extraireDate(texte);
    const heure = extraireHeurePrelevement(texte);

    return formaterResultat(date, valeurs, heure, cultureComplete);
}

function formaterDVE(val) {
    if (!val) return null;
    return val.includes("%") ? val : `${val}%`;
}

function formaterResultat(date, valeurs, heure, cultureComplete) {
    const ordre = [
        "Hb", "VGM", "DVE", "RNI", "Créat", "DFGe", "Urée", "Na", "K", "Cl", "Pi", "Mg",
        "Alb", "Pré-alb", "Ca", "Ca (corr.)", "Ca ion. pH", "Ca ionisé", "Ac. urique",
        "BiliT", "ALT", "AST", "CK", "GGT", "LDH", "PAL", "Lipase", "CRP",
        "CT", "TG", "HDL", "LDL", "non-HDL", "ApoB", "LpA",
        "TSH", "T4L", "Prolactine", "TestT", "DHEA", "Estradiol", "SHBG", "Vit. B12", "Vit. D", "HbA1c", "Fructosamine", "RAC",
        "Ferritine", "TSAT", "BNP", "NTproBNP", "PTH", "PSA", "CTX", "Li"
    ];

    const resultatsFormates = [];

    for (const param of ordre) {
        const val = valeurs[param];
        if (val === null || val === undefined || !String(val).trim()) continue;

        const affichage = param === "DVE" ? formaterDVE(String(val)) : String(val);

        if (param === "Li" && heure) {
            resultatsFormates.push(`${param} ${affichage} à ${heure}`);
        } else {
            resultatsFormates.push(`${param} ${affichage}`);
        }
    }

    let res = `(${date}) :\n${resultatsFormates.join(", ")}`;

    if (cultureComplete && cultureComplete.texte) {
        res += `\n${cultureComplete.texte}`;
    }

    return res;
}

function copierPressePapiers(txt) {
    if (navigator && navigator.clipboard && txt) {
        navigator.clipboard.writeText(txt).catch(() => {});
    }
}
