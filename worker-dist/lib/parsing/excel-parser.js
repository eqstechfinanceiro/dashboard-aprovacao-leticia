"use strict";
// Excel parser for VExpenses approval-tracking Excel export
// Uses SheetJS (xlsx) to parse the downloaded Excel file
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseApprovalTrackingExcel = parseApprovalTrackingExcel;
exports.parseApprovalTrackingExcelAsync = parseApprovalTrackingExcelAsync;
function parseApprovalTrackingExcel(arrayBuffer) {
    // Dynamic import of xlsx — we do it sync via require in the route
    // This function is designed to be called from the data layer
    // The xlsx import is done at call site to avoid build issues
    throw new Error('Use parseApprovalTrackingExcelAsync instead');
}
async function parseApprovalTrackingExcelAsync(arrayBuffer) {
    const XLSX = await Promise.resolve().then(() => __importStar(require('xlsx')));
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    if (rows.length < 2) {
        return { waitingStepMap: [], rejectedIds: [], approvedLastActionIds: [] };
    }
    // Group by reportId, find last action, determine waitingStep
    const reportsMap = new Map();
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0])
            continue;
        const reportId = String(row[0]);
        if (!reportsMap.has(reportId))
            reportsMap.set(reportId, []);
        reportsMap.get(reportId).push(row);
    }
    const waitingStepMap = [];
    for (const [reportId, reportRows] of reportsMap) {
        const lastRow = reportRows[reportRows.length - 1];
        const action = String(lastRow[5] || '');
        const step = lastRow[7] ? parseInt(String(lastRow[7]), 10) : null;
        let waitingStep = 1;
        if (action === 'Aprovado' && step !== null) {
            waitingStep = step + 1;
        }
        else if (action === 'Enviado') {
            waitingStep = 1;
        }
        else if (action === 'Reaberto') {
            waitingStep = 0;
        }
        waitingStepMap.push([parseInt(reportId, 10), waitingStep]);
    }
    const rejectedIds = [];
    const approvedLastActionIds = [];
    for (const [reportId, reportRows] of reportsMap) {
        const lastRow = reportRows[reportRows.length - 1];
        const action = String(lastRow[5] || '');
        if (action === 'Reprovado' || action === 'Reprovado pelo administrador') {
            rejectedIds.push(parseInt(reportId, 10));
        }
        else if (action === 'Aprovado') {
            approvedLastActionIds.push(parseInt(reportId, 10));
        }
    }
    return { waitingStepMap, rejectedIds, approvedLastActionIds };
}
