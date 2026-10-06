"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsRoot = uploadsRoot;
const path_1 = require("path");
/** Raiz dos uploads multipart da remessa de folha (dentro do output dir). */
function uploadsRoot() {
    return (0, path_1.join)(process.env.COMPROVANTES_OUTPUT_DIR || (0, path_1.join)(process.cwd(), 'comprovantes-output'), 'remessa-uploads');
}
