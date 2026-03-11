async function main(workbook: ExcelScript.Workbook) {
    const sheet = workbook.getActiveWorksheet();
    const used = sheet.getUsedRange();
    if (!used) { console.log("Пустой лист."); return; }

    const COL_CONT_ABS = 5;   // F
    const COL_TERM_ABS = 7;   // H
    const COL_STATUS_ABS = 8; // I
    const COL_STOP_ABS = 11;  // L
    const COL_T1_ABS = 12;    // M

    type Cell = string | number | boolean;
    const clean = (v: unknown) => String(v ?? "").replace(/[\s\u00A0]/g, "");
    const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

    const usedRowStart = used.getRowIndex();
    const usedColStart = used.getColumnIndex();

    const contCol = COL_CONT_ABS - usedColStart;
    const termCol = COL_TERM_ABS - usedColStart;
    const statusCol = COL_STATUS_ABS - usedColStart;
    const stopCol = COL_STOP_ABS - usedColStart;
    const t1Col = COL_T1_ABS - usedColStart;

    const vals = used.getValues() as Cell[][];
    if (vals.length < 2) { console.log("Нет данных."); return; }

    if (![contCol, termCol, statusCol, stopCol, t1Col].every((c) => c >= 0 && c < used.getColumnCount())) {
        throw new Error("Целевые колонки вне used-range.");
    }

    const DCT_URL = "http://85.11.79.242:3400/lookup";
    const BCT_URL = "http://85.11.79.242:3400/lookup-bct";

    const ENDPOINTS = [
        { label: "GDANSK_DCT", url: DCT_URL, rx: /\bGDANSK\b.*\bDCT\b/ },
        { label: "GDYNYA_BCT", url: BCT_URL, rx: /\bGDYNYA\b.*\bBCT\b/ },
    ] as const;

    const labelByTerm = (term: string): string | undefined => {
        const s = norm(term);
        for (let i = 0; i < ENDPOINTS.length; i++) {
            const e = ENDPOINTS[i];
            if (e.rx.test(s)) return e.label;
        }
        return undefined;
    };

    const visibleAreas = used.getSpecialCells(ExcelScript.SpecialCellType.visible);
    const buckets = new Map<string, Set<string>>();
    const perRowLabel = new Map<number, string>();
    const skipped: { row: number; cont: string; term: string }[] = [];

    // Собираем только видимые
    visibleAreas.getAreas().forEach((area) => {
        const areaRowStart = area.getRowIndex();
        const areaRowEnd = areaRowStart + area.getRowCount() - 1;
        const startAbsRow = Math.max(areaRowStart, usedRowStart + 1); // пропустить заголовок

        for (let absRow = startAbsRow; absRow <= areaRowEnd; absRow++) {
            const rInUsed = absRow - usedRowStart;
            const cont = clean(vals[rInUsed]?.[contCol]);
            if (!cont) continue;

            const term = String(vals[rInUsed]?.[termCol] ?? "");
            const label = labelByTerm(term);
            if (!label) { skipped.push({ row: absRow + 1, cont, term }); continue; }

            if (!buckets.has(label)) buckets.set(label, new Set<string>());
            buckets.get(label)!.add(cont);
            perRowLabel.set(rInUsed, label);
        }
    });

    let totalUpdated = 0;

    const entries = Array.from(buckets.entries());
    for (let i = 0; i < entries.length; i++) {
        const label = entries[i][0];
        const set = entries[i][1];
        const containers = Array.from(set);
        if (containers.length === 0) continue;

        const url =
            label === "GDANSK_DCT" ? DCT_URL :
                label === "GDYNYA_BCT" ? BCT_URL : "";

        if (!url) {
            console.log(`URL не задан для ${label}; пропущено ${containers.length}`);
            continue;
        }

        let resp: Response;
        try {
            resp = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": "dev-local-key",
                },
                body: JSON.stringify({ containers, t_status: true })
            });
        } catch (e) {
            console.log(`Сеть/доступ для ${label}: ${(e as Error).message}`);
            continue;
        }
        if (!resp.ok) {
            console.log(`Ошибка сервиса ${label}: ${await resp.text()}`);
            continue;
        }

        const { map } = await resp.json() as {
            map: Record<string, { cen?: string; status?: string; t_state?: string; stop?: string }>
        };

        // Применяем только к нашим видимым строкам данного label
        perRowLabel.forEach((lbl, rInUsed) => {
            if (lbl !== label) return;

            const cont = clean(vals[rInUsed]?.[contCol]);
            if (!cont) return;

            const item = map[cont];
            if (!item) return;

            if (item.cen) {
                const cell = used.getCell(rInUsed, t1Col);
                cell.setValue(item.cen);
                cell.getFormat().getFill().clear();
            }

            const statusVal = item.status ?? item.t_state;
            if (statusVal) {
                const cell = used.getCell(rInUsed, statusCol);
                cell.setValue(statusVal);
                cell.getFormat().getFill().clear();
            }

            if (item.stop) {
                const cell = used.getCell(rInUsed, stopCol);
                cell.setValue(item.stop);
                cell.getFormat().getFill().clear();
            }

            totalUpdated++;
        });
    }

    console.log(`Обновлено строк (только видимые): ${totalUpdated}`);
    if (skipped.length) {
        console.log(`Пропущены (не распознан H) среди видимых: ${skipped.length}`);
        skipped.slice(0, 50).forEach((x) => console.log(`row ${x.row}: ${x.cont} | H="${x.term}"`));
    }
    console.log("Готово.");
}
