"use strict";
// Quinzena date helpers — pure functions, no dependencies.
// Quinzena rules (validated): 1QZ = day 26(prev month) → 10, closes day 11.
// 2QZ = day 11 → 25, closes day 25.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentQuinzenaId = getCurrentQuinzenaId;
exports.getCurrentClosingQuinzena = getCurrentClosingQuinzena;
exports.getPreviousQuinzenaId = getPreviousQuinzenaId;
exports.getQuinzenaCutoff = getQuinzenaCutoff;
exports.getQuinzenaDateRange = getQuinzenaDateRange;
/** Returns the quinzena ID currently closing (the one that just ended). */
function getCurrentQuinzenaId(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-based
    const day = date.getDate();
    // The snapshot for a quinzena is taken when the NEXT quinzena closes:
    // on day <=10 we snapshot 2QZ of previous month; otherwise 1QZ of this month.
    if (day <= 10) {
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        return `${prevYear}-${String(prevMonth).padStart(2, '0')}-2`;
    }
    return `${year}-${String(month).padStart(2, '0')}-1`;
}
/** Returns the quinzena that is currently being calculated (the one that just closed). */
function getCurrentClosingQuinzena(date = new Date()) {
    return getCurrentQuinzenaId(date);
}
/** Returns the previous quinzena ID (the one before the given quinzena). */
function getPreviousQuinzenaId(quinzenaId) {
    const [yearStr, monthStr, qStr] = quinzenaId.split('-');
    let year = parseInt(yearStr);
    let month = parseInt(monthStr);
    const q = parseInt(qStr);
    if (q === 1) {
        month = month === 1 ? 12 : month - 1;
        if (month === 12)
            year--;
        return `${year}-${String(month).padStart(2, '0')}-2`;
    }
    return `${year}-${String(month).padStart(2, '0')}-1`;
}
/** Cutoff date for a quinzena (when its snapshot is finalized).
 *  1QZ month M → cutoff = 25/M; 2QZ month M → cutoff = 10/(M+1). */
function getQuinzenaCutoff(quinzenaId) {
    const [yearStr, monthStr, qStr] = quinzenaId.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const q = parseInt(qStr);
    if (q === 1) {
        return `${year}-${String(month).padStart(2, '0')}-25`;
    }
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-10`;
}
/** Date range [start, end] for a quinzena ID. 1QZ: 1-10, 2QZ: 11-25. */
function getQuinzenaDateRange(quinzenaId) {
    const [yearStr, monthStr, qStr] = quinzenaId.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const q = parseInt(qStr);
    if (q === 1) {
        return {
            start: `${year}-${String(month).padStart(2, '0')}-01`,
            end: `${year}-${String(month).padStart(2, '0')}-10`,
        };
    }
    return {
        start: `${year}-${String(month).padStart(2, '0')}-11`,
        end: `${year}-${String(month).padStart(2, '0')}-25`,
    };
}
