const fs = require("fs/promises");
const path = require("path");
const CFB = require("cfb");
const { computeSnapshot, normalizeState, suggestProjectName } = require("../../core");

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const PAGE_WIDTH_TWIP = Math.round(PAGE_WIDTH_MM * 56.6929133858);
const PAGE_HEIGHT_TWIP = Math.round(PAGE_HEIGHT_MM * 56.6929133858);
const PAGE_WIDTH_EMU = Math.round(PAGE_WIDTH_MM * 36000);
const CELL_PADDING = {
  top: Math.round(9 * 56.6929133858),
  right: Math.round(12 * 56.6929133858),
  bottom: Math.round(8 * 56.6929133858),
  left: Math.round(12 * 56.6929133858),
};
const CONTENT_WIDTH_TWIP = PAGE_WIDTH_TWIP - CELL_PADDING.left - CELL_PADDING.right;
const MAX_PARAGRAPH_GROUPS_PER_PAGE = 4;

const PRINT_ASSET_PATHS = {
  header: path.join(__dirname, "..", "..", "..", "samples", "files", "doc_header.png"),
  footer: path.join(__dirname, "..", "..", "..", "samples", "files", "doc_footer.png"),
};

let cachedAssetsPromise = null;

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createDocxFileName(state) {
  return `${suggestProjectName(state)}-${createTimestamp()}.docx`;
}

function readPngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Nie rozpoznano rozmiaru PNG dla szablonu DOCX.");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function loadPrintAssets() {
  if (!cachedAssetsPromise) {
    cachedAssetsPromise = Promise.all([
      fs.readFile(PRINT_ASSET_PATHS.header),
      fs.readFile(PRINT_ASSET_PATHS.footer),
    ]).then(([header, footer]) => ({
      header,
      footer,
      headerSize: readPngSize(header),
      footerSize: readPngSize(footer),
    }));
  }

  return cachedAssetsPromise;
}

function createTextRun(text, options = {}) {
  const parts = [];
  if (options.bold) {
    parts.push("<w:b/>");
    parts.push("<w:bCs/>");
  }
  if (options.italic) {
    parts.push("<w:i/>");
    parts.push("<w:iCs/>");
  }
  if (options.size) {
    parts.push(`<w:sz w:val="${options.size}"/>`);
    parts.push(`<w:szCs w:val="${options.size}"/>`);
  }

  const runProperties = parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
  return `<w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function createBreakRun() {
  return "<w:r><w:br/></w:r>";
}

function createParagraph(content, options = {}) {
  const runs = Array.isArray(content)
    ? content.join("")
    : typeof content === "string"
      ? createTextRun(content, options.run || {})
      : "";

  const paragraphProperties = [];
  if (options.align) {
    paragraphProperties.push(`<w:jc w:val="${options.align}"/>`);
  }
  if (
    options.spacingBefore !== undefined ||
    options.spacingAfter !== undefined ||
    options.line !== undefined
  ) {
    paragraphProperties.push(
      `<w:spacing${
        options.spacingBefore !== undefined ? ` w:before="${options.spacingBefore}"` : ""
      }${
        options.spacingAfter !== undefined ? ` w:after="${options.spacingAfter}"` : ""
      }${options.line !== undefined ? ` w:line="${options.line}" w:lineRule="auto"` : ""}/>`
    );
  }
  if (options.indentLeft || options.indentRight || options.firstLine) {
    paragraphProperties.push(
      `<w:ind${
        options.indentLeft ? ` w:left="${options.indentLeft}"` : ""
      }${
        options.indentRight ? ` w:right="${options.indentRight}"` : ""
      }${options.firstLine ? ` w:firstLine="${options.firstLine}"` : ""}/>`
    );
  }
  if (options.keepLines) {
    paragraphProperties.push("<w:keepLines/>");
  }
  if (options.keepNext) {
    paragraphProperties.push("<w:keepNext/>");
  }

  return `<w:p>${paragraphProperties.length ? `<w:pPr>${paragraphProperties.join("")}</w:pPr>` : ""}${runs}</w:p>`;
}

function createEmptyParagraph(options = {}) {
  return createParagraph("", options);
}

function createPageBreakParagraph() {
  return "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>";
}

function createTableCell(content, options = {}) {
  const cellProperties = [];
  if (options.width) {
    cellProperties.push(`<w:tcW w:w="${options.width}" w:type="dxa"/>`);
  }
  if (options.gridSpan) {
    cellProperties.push(`<w:gridSpan w:val="${options.gridSpan}"/>`);
  }
  if (options.vMerge) {
    cellProperties.push(
      options.vMerge === "continue" ? "<w:vMerge/>" : `<w:vMerge w:val="${options.vMerge}"/>`
    );
  }
  if (options.verticalAlign) {
    cellProperties.push(`<w:vAlign w:val="${options.verticalAlign}"/>`);
  }
  if (options.shading) {
    cellProperties.push(`<w:shd w:val="clear" w:color="auto" w:fill="${options.shading}"/>`);
  }
  if (options.margins) {
    cellProperties.push(
      `<w:tcMar><w:top w:w="${options.margins.top || 0}" w:type="dxa"/><w:right w:w="${
        options.margins.right || 0
      }" w:type="dxa"/><w:bottom w:w="${options.margins.bottom || 0}" w:type="dxa"/><w:left w:w="${
        options.margins.left || 0
      }" w:type="dxa"/></w:tcMar>`
    );
  }
  if (options.hideMark) {
    cellProperties.push("<w:hideMark/>");
  }

  return `<w:tc>${cellProperties.length ? `<w:tcPr>${cellProperties.join("")}</w:tcPr>` : ""}${
    content || createEmptyParagraph()
  }</w:tc>`;
}

function createTableRow(cells, options = {}) {
  const rowProperties = [];
  if (options.height) {
    rowProperties.push(
      `<w:trHeight w:val="${options.height}" w:hRule="${options.heightRule || "exact"}"/>`
    );
  }
  if (options.cantSplit !== false) {
    rowProperties.push("<w:cantSplit/>");
  }

  return `<w:tr>${rowProperties.length ? `<w:trPr>${rowProperties.join("")}</w:trPr>` : ""}${cells.join(
    ""
  )}</w:tr>`;
}

function createTable(rows, options = {}) {
  const borders =
    options.borders === "solid"
      ? `
        <w:top w:val="single" w:sz="8" w:space="0" w:color="343434"/>
        <w:left w:val="single" w:sz="8" w:space="0" w:color="343434"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="343434"/>
        <w:right w:val="single" w:sz="8" w:space="0" w:color="343434"/>
        <w:insideH w:val="single" w:sz="8" w:space="0" w:color="343434"/>
        <w:insideV w:val="single" w:sz="8" w:space="0" w:color="343434"/>
      `
      : `
        <w:top w:val="nil"/>
        <w:left w:val="nil"/>
        <w:bottom w:val="nil"/>
        <w:right w:val="nil"/>
        <w:insideH w:val="nil"/>
        <w:insideV w:val="nil"/>
      `;

  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${options.width}" w:type="dxa"/>
        <w:jc w:val="${options.align || "left"}"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblInd w:w="${options.indent || 0}" w:type="dxa"/>
        <w:tblCellMar>
          <w:top w:w="${options.cellMargins?.top || 0}" w:type="dxa"/>
          <w:right w:w="${options.cellMargins?.right || 0}" w:type="dxa"/>
          <w:bottom w:w="${options.cellMargins?.bottom || 0}" w:type="dxa"/>
          <w:left w:w="${options.cellMargins?.left || 0}" w:type="dxa"/>
        </w:tblCellMar>
        <w:tblBorders>${borders}</w:tblBorders>
      </w:tblPr>
      <w:tblGrid>${(options.columns || [])
        .map((width) => `<w:gridCol w:w="${width}"/>`)
        .join("")}</w:tblGrid>
      ${rows.join("")}
    </w:tbl>
  `;
}

function createImageDrawing(relId, widthEmu, heightEmu, docPrId, name) {
  return `
    <w:r>
      <w:rPr><w:noProof/></w:rPr>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
          <wp:docPr id="${docPrId}" name="${escapeXml(name)}"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks noChangeAspect="1"/>
          </wp:cNvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr>
                  <pic:cNvPr id="0" name="${escapeXml(name)}"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${relId}"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  `;
}

function createImageParagraph(relId, widthEmu, heightEmu, docPrId, name) {
  return createParagraph([createImageDrawing(relId, widthEmu, heightEmu, docPrId, name)], {
    align: "center",
    spacingBefore: 0,
    spacingAfter: 0,
    line: 240,
  });
}

function resolveCustomsOffice(snapshot, customsOffices = []) {
  const selectedOffice = customsOffices.find(
    (office) => office.code === snapshot.state?.customsOfficeCode
  );
  if (selectedOffice) {
    return selectedOffice;
  }

  return {
    code: snapshot.state?.customsOfficeCode || "",
    name: snapshot.state?.letter?.recipientOffice || "",
    addressLine1: snapshot.state?.letter?.recipientAddressLine1 || "",
    addressLine2: snapshot.state?.letter?.recipientAddressLine2 || "",
  };
}

function chunkParagraphGroups(paragraphGroups) {
  const chunks = [];
  for (let index = 0; index < paragraphGroups.length; index += MAX_PARAGRAPH_GROUPS_PER_PAGE) {
    chunks.push(paragraphGroups.slice(index, index + MAX_PARAGRAPH_GROUPS_PER_PAGE));
  }
  return chunks.length ? chunks : [[]];
}

function createTwoColumnTable(leftContent, rightContent, rightWidthRatio = 0.48) {
  const rightWidth = Math.round(CONTENT_WIDTH_TWIP * rightWidthRatio);
  const leftWidth = CONTENT_WIDTH_TWIP - rightWidth;
  return createTable(
    [
      createTableRow(
        [
          createTableCell(leftContent, { width: leftWidth, verticalAlign: "top" }),
          createTableCell(rightContent, { width: rightWidth, verticalAlign: "top" }),
        ],
        { cantSplit: true }
      ),
    ],
    {
      width: CONTENT_WIDTH_TWIP,
      columns: [leftWidth, rightWidth],
      borders: "none",
      cellMargins: { top: 0, right: 0, bottom: 0, left: 0 },
    }
  );
}

function createSummaryTable(snapshot) {
  const columns = [20, 6, 14, 7, 13, 6, 14, 7, 13].map((part) =>
    Math.round((CONTENT_WIDTH_TWIP * part) / 100)
  );
  columns[columns.length - 1] +=
    CONTENT_WIDTH_TWIP - columns.reduce((sum, value) => sum + value, 0);

  function cellParagraph(text, options = {}) {
    return createParagraph(text, {
      align: options.align || "left",
      spacingBefore: 0,
      spacingAfter: 0,
      line: options.line || 240,
      run: {
        bold: Boolean(options.bold),
        size: options.size || 20,
      },
    });
  }

  const rows = [
    createTableRow([
      createTableCell(cellParagraph("", { size: 20, align: "center" }), {
        width: columns[0],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(cellParagraph("JEST:", { bold: true, align: "center", size: 20 }), {
        width: columns.slice(1, 5).reduce((sum, value) => sum + value, 0),
        gridSpan: 4,
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(
        cellParagraph("WINNO BYĆ:", { bold: true, align: "center", size: 20 }),
        {
          width: columns.slice(5).reduce((sum, value) => sum + value, 0),
          gridSpan: 4,
          shading: "F1F1F1",
          verticalAlign: "center",
        }
      ),
    ]),
    createTableRow([
      createTableCell(cellParagraph("Całkowita zafakt. kwota 1406", { size: 18 }), {
        width: columns[0],
      }),
      createTableCell(cellParagraph(`EUR ${snapshot.totals.formatted.originalEur}`, {
        align: "center",
        size: 18,
      }), {
        width: columns.slice(1, 5).reduce((sum, value) => sum + value, 0),
        gridSpan: 4,
      }),
      createTableCell(
        cellParagraph(`EUR ${snapshot.totals.formatted.correctedEurRounded}`, {
          align: "center",
          size: 18,
        }),
        {
          width: columns.slice(5).reduce((sum, value) => sum + value, 0),
          gridSpan: 4,
        }
      ),
    ]),
    createTableRow([
      createTableCell(cellParagraph("Wartość fakt. pozycji 1408", { size: 18 }), {
        width: columns[0],
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.originalEur, {
        align: "center",
        size: 18,
      }), {
        width: columns.slice(1, 5).reduce((sum, value) => sum + value, 0),
        gridSpan: 4,
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.correctedEurRounded, {
        align: "center",
        size: 18,
      }), {
        width: columns.slice(5).reduce((sum, value) => sum + value, 0),
        gridSpan: 4,
      }),
    ]),
    createTableRow([
      createTableCell(cellParagraph("Dokumenty załączone 1203", { size: 18 }), {
        width: columns[0],
      }),
      createTableCell(cellParagraph(snapshot.meta.invoiceNumbersList, {
        size: 18,
      }), {
        width: columns.slice(1, 5).reduce((sum, value) => sum + value, 0),
        gridSpan: 4,
      }),
      createTableCell(cellParagraph(snapshot.meta.paymentDocumentsList, {
        size: 18,
      }), {
        width: columns.slice(5).reduce((sum, value) => sum + value, 0),
        gridSpan: 4,
      }),
    ]),
    createTableRow([
      createTableCell(cellParagraph("Wartość statystyczna 9906", { size: 18 }), {
        width: columns[0],
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.originalStatValue, {
        align: "center",
        size: 18,
      }), {
        width: columns.slice(1, 5).reduce((sum, value) => sum + value, 0),
        gridSpan: 4,
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.correctedStatValue, {
        align: "center",
        size: 18,
      }), {
        width: columns.slice(5).reduce((sum, value) => sum + value, 0),
        gridSpan: 4,
      }),
    ]),
    createTableRow([
      createTableCell(cellParagraph("Kalkulacje podatkowe 1403", {
        size: 18,
        align: "left",
      }), {
        width: columns[0],
        verticalAlign: "center",
        vMerge: "restart",
      }),
      createTableCell(cellParagraph("Typ", { bold: true, align: "center", size: 18 }), {
        width: columns[1],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(cellParagraph("Podstawa opłaty", {
        bold: true,
        align: "center",
        size: 16,
      }), {
        width: columns[2],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(cellParagraph("Stawka", { bold: true, align: "center", size: 16 }), {
        width: columns[3],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(cellParagraph("Kwota", { bold: true, align: "center", size: 16 }), {
        width: columns[4],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(cellParagraph("Typ", { bold: true, align: "center", size: 18 }), {
        width: columns[5],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(cellParagraph("Podstawa opłaty", {
        bold: true,
        align: "center",
        size: 16,
      }), {
        width: columns[6],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(cellParagraph("Stawka", { bold: true, align: "center", size: 16 }), {
        width: columns[7],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
      createTableCell(cellParagraph("Kwota", { bold: true, align: "center", size: 16 }), {
        width: columns[8],
        shading: "F1F1F1",
        verticalAlign: "center",
      }),
    ]),
    createTableRow([
      createTableCell(createEmptyParagraph({ spacingBefore: 0, spacingAfter: 0, line: 220 }), {
        width: columns[0],
        vMerge: "continue",
      }),
      createTableCell(cellParagraph("A00", { align: "center", size: 18 }), {
        width: columns[1],
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.originalStatValue, {
        align: "center",
        size: 18,
      }), {
        width: columns[2],
      }),
      createTableCell(cellParagraph("0", { align: "center", size: 18 }), {
        width: columns[3],
      }),
      createTableCell(cellParagraph("0", { align: "center", size: 18 }), {
        width: columns[4],
      }),
      createTableCell(cellParagraph("A00", { align: "center", size: 18 }), {
        width: columns[5],
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.correctedStatValue, {
        align: "center",
        size: 18,
      }), {
        width: columns[6],
      }),
      createTableCell(cellParagraph("0", { align: "center", size: 18 }), {
        width: columns[7],
      }),
      createTableCell(cellParagraph("0", { align: "center", size: 18 }), {
        width: columns[8],
      }),
    ]),
    createTableRow([
      createTableCell(createEmptyParagraph({ spacingBefore: 0, spacingAfter: 0, line: 220 }), {
        width: columns[0],
        vMerge: "continue",
      }),
      createTableCell(cellParagraph("B00", { align: "center", size: 18 }), {
        width: columns[1],
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.vatBaseOriginal, {
        align: "center",
        size: 18,
      }), {
        width: columns[2],
      }),
      createTableCell(cellParagraph("23", { align: "center", size: 18 }), {
        width: columns[3],
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.vatAmountOriginal, {
        align: "center",
        size: 18,
      }), {
        width: columns[4],
      }),
      createTableCell(cellParagraph("B00", { align: "center", size: 18 }), {
        width: columns[5],
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.vatBaseCorrected, {
        align: "center",
        size: 18,
      }), {
        width: columns[6],
      }),
      createTableCell(cellParagraph("23", { align: "center", size: 18 }), {
        width: columns[7],
      }),
      createTableCell(cellParagraph(snapshot.totals.formatted.vatAmountCorrected, {
        align: "center",
        size: 18,
      }), {
        width: columns[8],
      }),
    ]),
  ];

  return createTable(rows, {
    width: CONTENT_WIDTH_TWIP,
    columns,
    borders: "solid",
    cellMargins: { top: 70, right: 70, bottom: 70, left: 70 },
  });
}

function createFirstPageContent(snapshot, office) {
  const headerTable = createTwoColumnTable(
    createParagraph(snapshot.meta.caseNumber, {
      spacingBefore: 0,
      spacingAfter: 240,
      line: 288,
      run: { size: 24 },
    }),
    createParagraph(
      [
        createTextRun(snapshot.state.letter.printCity, { bold: true, size: 24 }),
        createBreakRun(),
        createTextRun(snapshot.state.letter.printDate, { size: 24 }),
      ],
      {
        align: "right",
        spacingBefore: 0,
        spacingAfter: 240,
        line: 288,
      }
    )
  );

  const officeBlock = createTwoColumnTable(
    createEmptyParagraph({ spacingBefore: 0, spacingAfter: 200, line: 240 }),
    [
      createParagraph(String(office.name || "").toUpperCase(), {
        spacingBefore: 0,
        spacingAfter: 0,
        line: 288,
        run: { size: 22, bold: true },
      }),
      createParagraph(office.addressLine1, {
        spacingBefore: 0,
        spacingAfter: 0,
        line: 288,
        run: { size: 22 },
      }),
      createParagraph(office.addressLine2, {
        spacingBefore: 0,
        spacingAfter: 260,
        line: 288,
        run: { size: 22 },
      }),
    ].join("")
  );

  const paragraphs = [
    createParagraph(`Sprawa: ${snapshot.meta.subjectReference}`, {
      spacingBefore: 0,
      spacingAfter: 180,
      line: 288,
      run: { size: 24, bold: true },
    }),
    createParagraph(
      `Działając w imieniu i z upoważnienia ArcelorMittal Poland S.A. w dniu ${snapshot.state.entryDate} ${snapshot.state.letter.senderCompany}`,
      {
        spacingBefore: 0,
        spacingAfter: 70,
        line: 288,
        run: { size: 22 },
      }
    ),
    createParagraph(
      "Działając jako przedstawiciel bezpośredni dokonano zgłoszenia w procedurze standardowej MRN",
      {
        spacingBefore: 0,
        spacingAfter: 70,
        line: 288,
        run: { size: 22 },
      }
    ),
    createParagraph(
      `${snapshot.state.documentNumber} dla towaru - ruda żelaza ${snapshot.state.oreType} ${snapshot.state.oreKind}`,
      {
        spacingBefore: 0,
        spacingAfter: 70,
        line: 288,
        run: { size: 22 },
      }
    ),
    createParagraph(
      `pochodzącego i przywiezionego z ${snapshot.state.originCountry} oraz zaklasyfikowanego do kodu CN ${snapshot.meta.cnCode}.`,
      {
        spacingBefore: 0,
        spacingAfter: 200,
        line: 288,
        run: { size: 22 },
      }
    ),
  ];

  return [headerTable, officeBlock, ...paragraphs].join("");
}

function createParagraphGroupContent(group) {
  if (!group.correctionLine) {
    return createParagraph(group.noteLine, {
      spacingBefore: 0,
      spacingAfter: 170,
      line: 288,
      run: { size: 22, italic: true },
    });
  }

  return [
    createParagraph(group.noteLine, {
      spacingBefore: 0,
      spacingAfter: 70,
      line: 288,
      run: { size: 22 },
    }),
    createParagraph(group.correctionLine, {
      spacingBefore: 0,
      spacingAfter: 170,
      line: 288,
      run: { size: 22 },
    }),
  ].join("");
}

function createClosingParagraph() {
  return createParagraph(
    "Na podstawie art. 173 ust. 3 Rozporządzenia Parlamentu Europejskiego i Rady (UE) nr 952/2013 z dn. 09.10.2013 r. ustanawiającego UKC z późniejszymi zmianami, proszę o dokonanie zmian w polach SAD na:",
    {
      spacingBefore: 40,
      spacingAfter: 0,
      line: 288,
      run: { size: 22 },
    }
  );
}

function createSummaryPageContent(snapshot) {
  const attachmentLines = [
    snapshot.attachments.noteAttachmentLine,
    snapshot.attachments.invoiceLine,
    snapshot.attachments.copySadLine,
    snapshot.attachments.uniqueDocumentLine,
    snapshot.attachments.paymentConfirmationLine,
    snapshot.attachments.paymentDocumentsLine,
  ].filter(Boolean);

  return [
    createSummaryTable(snapshot),
    createParagraph(
      `Kwota ${snapshot.totals.vatDescriptor} podatku VAT wynosi: ${snapshot.totals.formatted.vatDifference} zł`,
      {
        spacingBefore: 130,
        spacingAfter: 220,
        line: 288,
        run: { size: 22 },
      }
    ),
    createParagraph("Załączniki:", {
      spacingBefore: 0,
      spacingAfter: 80,
      line: 288,
      run: { size: 22, bold: true },
    }),
    ...attachmentLines.map((line) =>
      createParagraph(line, {
        spacingBefore: 0,
        spacingAfter: 45,
        line: 288,
        run: { size: 20 },
      })
    ),
    createParagraph(
      [
        createTextRun("Z poważaniem", { size: 22 }),
        createBreakRun(),
        createTextRun(snapshot.state.letter.signatory, { size: 22 }),
      ],
      {
        align: "right",
        spacingBefore: 260,
        spacingAfter: 0,
        line: 288,
      }
    ),
  ].join("");
}

function createPageFrameTable(contentXml, imageRefs, pageLayout, imageIdRef) {
  const nextImageId = () => {
    imageIdRef.current += 1;
    return imageIdRef.current;
  };

  return createTable(
    [
      createTableRow(
        [
          createTableCell(
            createImageParagraph(
              imageRefs.headerRelId,
              PAGE_WIDTH_EMU,
              pageLayout.headerHeightEmu,
              nextImageId(),
              "SME Header"
            ),
            {
              width: PAGE_WIDTH_TWIP,
              verticalAlign: "center",
              margins: { top: 0, right: 0, bottom: 0, left: 0 },
            }
          ),
        ],
        {
          height: pageLayout.headerHeightTwip,
        }
      ),
      createTableRow(
        [
          createTableCell(contentXml, {
            width: PAGE_WIDTH_TWIP,
            verticalAlign: "top",
            margins: CELL_PADDING,
          }),
        ],
        {
          height: pageLayout.contentHeightTwip,
        }
      ),
      createTableRow(
        [
          createTableCell(
            createImageParagraph(
              imageRefs.footerRelId,
              PAGE_WIDTH_EMU,
              pageLayout.footerHeightEmu,
              nextImageId(),
              "SME Footer"
            ),
            {
              width: PAGE_WIDTH_TWIP,
              verticalAlign: "center",
              margins: { top: 0, right: 0, bottom: 0, left: 0 },
            }
          ),
        ],
        {
          height: pageLayout.footerHeightTwip,
        }
      ),
    ],
    {
      width: PAGE_WIDTH_TWIP,
      columns: [PAGE_WIDTH_TWIP],
      borders: "none",
      cellMargins: { top: 0, right: 0, bottom: 0, left: 0 },
    }
  );
}

function createPageTable(contentXml, imageRefs, pageLayout, imageIdRef) {
  const pageFrameTable = createPageFrameTable(contentXml, imageRefs, pageLayout, imageIdRef);
  const hiddenCellParagraph = createEmptyParagraph({
    spacingBefore: 0,
    spacingAfter: 0,
    line: 1,
  });

  return createTable(
    [
      createTableRow(
        [
          createTableCell(`${pageFrameTable}${hiddenCellParagraph}`, {
            width: PAGE_WIDTH_TWIP,
            verticalAlign: "top",
            margins: { top: 0, right: 0, bottom: 0, left: 0 },
            hideMark: true,
          }),
        ],
        {
          height: PAGE_HEIGHT_TWIP,
        }
      ),
    ],
    {
      width: PAGE_WIDTH_TWIP,
      columns: [PAGE_WIDTH_TWIP],
      borders: "none",
      cellMargins: { top: 0, right: 0, bottom: 0, left: 0 },
    }
  );
}

function createCorePropertiesXml() {
  const createdAt = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SME DOCX Export</dc:title>
  <dc:creator>SilesDoc</dc:creator>
  <cp:lastModifiedBy>SilesDoc</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`;
}

function createAppPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>SilesDoc</Application>
</Properties>`;
}

function createStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="pl-PL"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:before="0" w:after="0" w:line="288" w:lineRule="auto"/>
        <w:jc w:val="both"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`;
}

function createContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function createRootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
}

function createDocumentRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/doc_header.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/doc_footer.png"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

async function buildPrintDocxBuffer(state, context = {}) {
  const normalizedState = normalizeState(state);
  const snapshot = computeSnapshot(normalizedState);
  const office = resolveCustomsOffice(snapshot, context.customsOffices || []);
  const assets = await loadPrintAssets();

  const headerHeightEmu = Math.round(
    (assets.headerSize.height / assets.headerSize.width) * PAGE_WIDTH_EMU
  );
  const footerHeightEmu = Math.round(
    (assets.footerSize.height / assets.footerSize.width) * PAGE_WIDTH_EMU
  );
  const headerHeightTwip = Math.round(headerHeightEmu / 635);
  const footerHeightTwip = Math.round(footerHeightEmu / 635);
  const contentHeightTwip = PAGE_HEIGHT_TWIP - headerHeightTwip - footerHeightTwip;

  const paragraphGroups = snapshot.printParagraphs.length
    ? snapshot.printParagraphs
    : [
        {
          noteLine: "Brak pozycji korekty z kompletem numeru i daty noty.",
          correctionLine: "",
        },
      ];
  const paragraphChunks = chunkParagraphGroups(paragraphGroups);
  const imageIdRef = { current: 0 };
  const pageLayout = {
    headerHeightEmu,
    footerHeightEmu,
    headerHeightTwip,
    footerHeightTwip,
    contentHeightTwip,
  };

  const pageTables = paragraphChunks.map((chunk, index) => {
    const content = [
      index === 0 ? createFirstPageContent(snapshot, office) : "",
      ...chunk.map((group) => createParagraphGroupContent(group)),
      index === paragraphChunks.length - 1 ? createClosingParagraph() : "",
    ].join("");

    return createPageTable(
      content,
      { headerRelId: "rId1", footerRelId: "rId2" },
      pageLayout,
      imageIdRef
    );
  });

  pageTables.push(
    createPageTable(
      createSummaryPageContent(snapshot),
      { headerRelId: "rId1", footerRelId: "rId2" },
      pageLayout,
      imageIdRef
    )
  );

  const bodyXml = pageTables
    .map(
      (tableXml, index) =>
        `${tableXml}${index < pageTables.length - 1 ? createPageBreakParagraph() : ""}`
    )
    .join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14 wp14">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="${PAGE_WIDTH_TWIP}" w:h="${PAGE_HEIGHT_TWIP}"/>
      <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
      <w:cols w:space="0"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(
    container,
    "[Content_Types].xml",
    Buffer.from(createContentTypesXml(), "utf8")
  );
  CFB.utils.cfb_add(container, "_rels/.rels", Buffer.from(createRootRelationshipsXml(), "utf8"));
  CFB.utils.cfb_add(container, "docProps/app.xml", Buffer.from(createAppPropertiesXml(), "utf8"));
  CFB.utils.cfb_add(container, "docProps/core.xml", Buffer.from(createCorePropertiesXml(), "utf8"));
  CFB.utils.cfb_add(container, "word/document.xml", Buffer.from(documentXml, "utf8"));
  CFB.utils.cfb_add(container, "word/styles.xml", Buffer.from(createStylesXml(), "utf8"));
  CFB.utils.cfb_add(
    container,
    "word/_rels/document.xml.rels",
    Buffer.from(createDocumentRelationshipsXml(), "utf8")
  );
  CFB.utils.cfb_add(container, "word/media/doc_header.png", assets.header);
  CFB.utils.cfb_add(container, "word/media/doc_footer.png", assets.footer);

  return CFB.write(container, {
    type: "buffer",
    fileType: "zip",
    compression: true,
  });
}

module.exports = {
  buildPrintDocxBuffer,
  createDocxFileName,
};
