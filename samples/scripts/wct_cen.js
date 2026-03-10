async function main(workbook: ExcelScript.Workbook) {
    const sheet = workbook.getActiveWorksheet();
    const used = sheet.getUsedRange();
    if (!used) { console.log("Пустой лист."); return; }

    const COL_CONT = 3; // D
    const COL_CEN = 4;  // E
    const COL_STOP = 7; // H: Stop
    const COL_TST = 8;  // I: T-State

    type Cell = string | number | boolean;
    const clean = (v: unknown) => String(v ?? "").replace(/[\s\u00A0]/g, "");
    const isEmpty = (v: unknown) => clean(v) === "";

    const contCol = used.getColumn(COL_CONT).getValues() as Cell[][];
    const cenCol = used.getColumn(COL_CEN).getValues() as Cell[][];

    const lastRowIdx = (() => {
        for (let i = contCol.length - 1; i >= 1; i--) if (!isEmpty(contCol[i][0])) return i;
        return 0;
    })();
    if (lastRowIdx < 1) { console.log("Нет данных."); return; }

    // собираем строки с пустым CEN
    const rowsToProcess: number[] = [];
    for (let r = 1; r <= lastRowIdx; r++) {
        const cenVal = String(cenCol[r][0] ?? "").trim();
        if (!cenVal) {
            rowsToProcess.push(r);
            sheet.getCell(r, COL_CEN).getFormat().getFill().setColor("FFFF00");
        }
    }
    if (rowsToProcess.length === 0) {
        console.log("Нет строк с пустыми CEN (E). Завершено.");
        return;
    }

    // собираем и дедупим контейнеры
    const setAll = new Set<string>();
    for (const r of rowsToProcess) {
        const cont = clean(contCol[r][0]);
        if (cont) setAll.add(cont);
    }
    const containersAll = Array.from(setAll);
    if (containersAll.length === 0) { console.log("Нет контейнеров."); return; }

    // вспомогат.: разбивка на чанки
    const chunks: string[][] = [];
    const CHUNK_SIZE = 50;
    for (let i = 0; i < containersAll.length; i += CHUNK_SIZE) {
        chunks.push(containersAll.slice(i, i + CHUNK_SIZE));
    }

    // запросы
    const URL = "http://85.11.79.242:3400/lookup";
    const cenMap: Record<string, string> = {};
    const tMap: Record<string, string> = {};
    const stopMap: Record<string, string> = {};

    // типы и type-guards (без any)
    type MapItem = string | { cen?: string; t_state?: string; stop?: string };

    const isRecord = (x: unknown): x is Record<string, unknown> =>
        typeof x === "object" && x !== null;

    const hasMap = (x: unknown): x is { map: Record<string, MapItem> } => {
        if (!isRecord(x)) return false;
        if (!("map" in x)) return false;
        const m = (x as Record<string, unknown>)["map"];
        return isRecord(m);
    };

    const isItemObj = (x: unknown): x is { cen?: unknown; t_state?: unknown; stop?: unknown } =>
        typeof x === "object" && x !== null;

    const toStrOrUndef = (x: unknown): string | undefined => {
        if (x === null || x === undefined) return undefined;
        return String(x);
    };

    for (const chunk of chunks) {
        let resp: Response;
        try {
            resp = await fetch(URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": "dev-local-key",
                },
                body: JSON.stringify({ containers: chunk, t_status: true })
            });
        } catch (e) {
            console.log(`Сеть/доступ: ${(e as Error).message}`);
            continue;
        }
        if (!resp.ok) {
            let reason = "";
            try { reason = await resp.text(); } catch { }
            console.log(`Ошибка сервиса: ${resp.status} ${reason}`);
            continue;
        }

        const ctype = (resp.headers.get("content-type") || "").toLowerCase();

        // JSON: cen + t_state + stop
        if (ctype.includes("application/json")) {
            const data = await resp.json() as unknown;

            const payload: Record<string, MapItem> =
                hasMap(data)
                    ? (data.map as Record<string, MapItem>)
                    : (isRecord(data) ? (data as Record<string, MapItem>) : {});

            for (const k of Object.keys(payload)) {
                const v = payload[k];

                if (typeof v === "string") {
                    cenMap[k] = v;
                    continue;
                }

                if (isItemObj(v)) {
                    const obj = v as { cen?: unknown; t_state?: unknown; stop?: unknown };

                    const cen = toStrOrUndef(obj.cen);
                    if (cen !== undefined) cenMap[k] = cen;

                    const t = toStrOrUndef(obj.t_state);
                    if (t !== undefined) tMap[k] = t;

                    const stop = toStrOrUndef(obj.stop);
                    if (stop !== undefined) stopMap[k] = stop;
                }
            }

            continue;
        }

        // fallback: CSV → только CEN (stop/t_state из CSV не парсим)
        const text = await resp.text();
        if (text.includes("<div")) continue;

        const lines = text.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);

        let headerIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/CEN\s*Number/i.test(lines[i])) { headerIdx = i; break; }
        }
        if (headerIdx < 0) continue;

        const splitCsvLine = (line: string): string[] => {
            const out: string[] = [];
            let cur = "";
            let inQ = false;

            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                    else { inQ = !inQ; }
                } else if (ch === "," && !inQ) {
                    out.push(cur); cur = "";
                } else {
                    cur += ch;
                }
            }
            out.push(cur);
            return out;
        };

        const headers = splitCsvLine(lines[headerIdx]).map(h => h.replace(/^"|"$/g, "").trim());
        const idxCont = headers.findIndex(h => /^container(\s*number)?$/i.test(h));
        const idxCen = headers.findIndex(h => /^cen(\s*number)?$/i.test(h));
        if (idxCont < 0 || idxCen < 0) continue;

        for (let i = headerIdx + 1; i < lines.length; i++) {
            const row = splitCsvLine(lines[i]).map(v => v.replace(/^"|"$/g, "").trim());
            if (row.length <= Math.max(idxCont, idxCen)) continue;

            const cont = clean(row[idxCont]);
            const cen = row[idxCen] ?? "";
            if (cont) cenMap[cont] = cen;
        }
    }

    // запись результатов
    let totalCenUpdated = 0;
    let totalStopUpdated = 0;
    const notFound: { row: number; cont: string }[] = [];

    for (const r of rowsToProcess) {
        const cont = clean(contCol[r][0]);
        if (!cont) continue;

        const cen = cenMap[cont];
        const t = tMap[cont];
        const stop = stopMap[cont];

        if (cen !== undefined) {
            sheet.getCell(r, COL_CEN).setValue(cen);
            sheet.getCell(r, COL_CEN).getFormat().getFill().clear();
            totalCenUpdated++;
        } else {
            notFound.push({ row: r + 1, cont });
        }

        if (t !== undefined) {
            sheet.getCell(r, COL_TST).setValue(t);
        }

        if (stop !== undefined) {
            sheet.getCell(r, COL_STOP).setValue(stop);
            totalStopUpdated++;
        }
    }

    // лог
    console.log(`Строк к обработке (пустой CEN): ${rowsToProcess.length}`);
    console.log(`Уникальных контейнеров: ${containersAll.length}`);
    console.log(`Обновлено CEN: ${totalCenUpdated}`);
    console.log(`Проставлено T-State: ${Object.keys(tMap).length}`);
    console.log(`Проставлено Stop: ${totalStopUpdated}`);
    console.log(`Не найдено: ${notFound.length}`);
    if (notFound.length) {
        notFound.slice(0, 50).forEach(x => console.log(`row ${x.row}: ${x.cont} — нет CEN`));
        if (notFound.length > 50) console.log(`…и ещё ${notFound.length - 50}`);
    }
    console.log("Готово.");
}
