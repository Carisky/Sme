import { escapeHtml } from "../../utils.js";

function resolveAssetUrl(relativePath) {
  return new URL(relativePath, window.location.href).href;
}

const PRINT_ASSETS = {
  header: resolveAssetUrl("../../samples/files/doc_header.png"),
  footer: resolveAssetUrl("../../samples/files/doc_footer.png"),
};

const MAX_PARAGRAPH_GROUPS_PER_PAGE = 4;

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

function renderParagraphGroups(snapshot) {
  if (snapshot.printParagraphs.length === 0) {
    return [
      `
        <div class="document__paragraph-group">
          <p class="document__paragraph document__empty">
            Brak pozycji korekty z kompletem numeru i daty noty.
          </p>
        </div>
      `,
    ];
  }

  return snapshot.printParagraphs.map(
    (paragraph) => `
      <div class="document__paragraph-group">
        <p class="document__paragraph">${escapeHtml(paragraph.noteLine)}</p>
        <p class="document__paragraph">${escapeHtml(paragraph.correctionLine)}</p>
      </div>
    `
  );
}

function chunkParagraphGroups(paragraphGroups) {
  const chunks = [];

  for (let index = 0; index < paragraphGroups.length; index += MAX_PARAGRAPH_GROUPS_PER_PAGE) {
    chunks.push(paragraphGroups.slice(index, index + MAX_PARAGRAPH_GROUPS_PER_PAGE));
  }

  return chunks;
}

export function renderDefaultPrint(snapshot, context = {}) {
  const office = resolveCustomsOffice(snapshot, context.customsOffices || []);
  const paragraphGroups = renderParagraphGroups(snapshot);
  const paragraphChunks = chunkParagraphGroups(paragraphGroups);
  const attachmentItems = [
    snapshot.attachments.noteAttachmentLine,
    snapshot.attachments.invoiceLine,
    snapshot.attachments.copySadLine,
    snapshot.attachments.uniqueDocumentLine,
    snapshot.attachments.paymentConfirmationLine,
    snapshot.attachments.paymentDocumentsLine,
  ]
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  const firstPageIntro = `
    <div class="document__header">
      <div class="document__case">${escapeHtml(snapshot.meta.caseNumber)}</div>
      <div class="document__place">
        <strong>${escapeHtml(snapshot.state.letter.printCity)}</strong><br />
        ${escapeHtml(snapshot.state.letter.printDate)}
      </div>
    </div>

    <div class="document__office-block">
      <strong>${escapeHtml(String(office.name || "").toUpperCase())}</strong>
      <div>${escapeHtml(office.addressLine1)}</div>
      <div>${escapeHtml(office.addressLine2)}</div>
    </div>

    <p class="document__subject">Sprawa: ${escapeHtml(snapshot.meta.subjectReference)}</p>

    <p class="document__paragraph">
      Działając w imieniu i z upoważnienia ArcelorMittal Poland S.A. w dniu
      ${escapeHtml(snapshot.state.entryDate)} ${escapeHtml(snapshot.state.letter.senderCompany)}
    </p>
    <p class="document__paragraph">
      Działając jako przedstawiciel bezpośredni dokonano zgłoszenia w procedurze
      standardowej MRN
    </p>
    <p class="document__paragraph">
      ${escapeHtml(snapshot.state.documentNumber)} dla towaru - ruda żelaza
      ${escapeHtml(snapshot.state.oreType)} ${escapeHtml(snapshot.state.oreKind)}
    </p>
    <p class="document__paragraph">
      pochodzącego i przywiezionego z ${escapeHtml(
        snapshot.state.originCountry
      )} oraz zaklasyfikowanego do kodu CN ${escapeHtml(snapshot.meta.cnCode)}.
    </p>
  `;

  const closingParagraph = `
    <p class="document__paragraph">
      Na podstawie art. 173 ust. 3 Rozporządzenia Parlamentu Europejskiego i
      Rady (UE) nr 952/2013 z dn. 09.10.2013 r. ustanawiającego UKC z
      późniejszymi zmianami, proszę o dokonanie zmian w polach SAD na:
    </p>
  `;

  const secondPageContent = `
    <div class="document__table-block">
      <table class="document__summary">
        <colgroup>
          <col class="document__summary-col document__summary-col--label" />
          <col class="document__summary-col document__summary-col--type" />
          <col class="document__summary-col document__summary-col--base" />
          <col class="document__summary-col document__summary-col--rate" />
          <col class="document__summary-col document__summary-col--amount" />
          <col class="document__summary-col document__summary-col--type" />
          <col class="document__summary-col document__summary-col--base" />
          <col class="document__summary-col document__summary-col--rate" />
          <col class="document__summary-col document__summary-col--amount" />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th colspan="4">JEST:</th>
            <th colspan="4">WINNO BYC:</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Całkowita zafakt. kwota 1406</td>
            <td colspan="4" class="document__summary-value">EUR ${snapshot.totals.formatted.originalEur}</td>
            <td colspan="4" class="document__summary-value">EUR ${snapshot.totals.formatted.correctedEurRounded}</td>
          </tr>
          <tr>
            <td>Wartość fakt. pozycji 1408</td>
            <td colspan="4" class="document__summary-value">${snapshot.totals.formatted.originalEur}</td>
            <td colspan="4" class="document__summary-value">${snapshot.totals.formatted.correctedEurRounded}</td>
          </tr>
          <tr>
            <td>Dokumenty załączone 1203</td>
            <td colspan="4">${escapeHtml(snapshot.meta.invoiceNumbersList)}</td>
            <td colspan="4">${escapeHtml(snapshot.meta.paymentDocumentsList)}</td>
          </tr>
          <tr>
            <td>Wartość statystyczna 9906</td>
            <td colspan="4" class="document__summary-value">${snapshot.totals.formatted.originalStatValue}</td>
            <td colspan="4" class="document__summary-value">${snapshot.totals.formatted.correctedStatValue}</td>
          </tr>
          <tr class="document__summary-tax-head">
            <td rowspan="3">Kalkulacje podatkowe 1403</td>
            <th>Typ</th>
            <th>Podstawa opłaty</th>
            <th>Stawka</th>
            <th>Kwota</th>
            <th>Typ</th>
            <th>Podstawa opłaty</th>
            <th>Stawka</th>
            <th>Kwota</th>
          </tr>
          <tr class="document__summary-tax-row">
            <td class="document__summary-code">A00</td>
            <td class="document__summary-value">${snapshot.totals.formatted.originalStatValue}</td>
            <td class="document__summary-value">0</td>
            <td class="document__summary-value">0</td>
            <td class="document__summary-code">A00</td>
            <td class="document__summary-value">${snapshot.totals.formatted.correctedStatValue}</td>
            <td class="document__summary-value">0</td>
            <td class="document__summary-value">0</td>
          </tr>
          <tr class="document__summary-tax-row">
            <td class="document__summary-code">B00</td>
            <td class="document__summary-value">${snapshot.totals.formatted.vatBaseOriginal}</td>
            <td class="document__summary-value">23</td>
            <td class="document__summary-value">${snapshot.totals.formatted.vatAmountOriginal}</td>
            <td class="document__summary-code">B00</td>
            <td class="document__summary-value">${snapshot.totals.formatted.vatBaseCorrected}</td>
            <td class="document__summary-value">23</td>
            <td class="document__summary-value">${snapshot.totals.formatted.vatAmountCorrected}</td>
          </tr>
        </tbody>
      </table>

      <p class="document__paragraph document__paragraph--after-table">
        Kwota ${escapeHtml(snapshot.totals.vatDescriptor)} podatku VAT wynosi:
        ${snapshot.totals.formatted.vatDifference} zł
      </p>
    </div>

    <div class="document__closing-block">
      <div class="document__attachments">
        <strong>Załączniki:</strong>
        <ul>${attachmentItems}</ul>
      </div>

      <p class="document__signature">
        Z poważaniem<br />${escapeHtml(snapshot.state.letter.signatory)}
      </p>
    </div>
  `;

  function renderPage(pageContent, extraClass = "") {
    return `
      <section class="document__page ${extraClass}">
        <div class="document__page-header">
          <img src="${escapeHtml(PRINT_ASSETS.header)}" alt="Header" />
        </div>
        <div class="document__content">
          ${pageContent}
        </div>
        <div class="document__page-footer">
          <img src="${escapeHtml(PRINT_ASSETS.footer)}" alt="Footer" />
        </div>
      </section>
    `;
  }

  const letterPages = paragraphChunks.map((chunk, index) => {
    const isFirstPage = index === 0;
    const isLastLetterPage = index === paragraphChunks.length - 1;
    const pageContent = `
      ${isFirstPage ? firstPageIntro : ""}
      ${chunk.join("")}
      ${isLastLetterPage ? closingParagraph : ""}
    `;

    return renderPage(
      pageContent,
      isFirstPage ? "document__page--first" : "document__page--continuation"
    );
  });

  return `
    <div class="document">
      ${letterPages.join("")}
      ${renderPage(secondPageContent, "document__page--summary document__page--final")}
    </div>
  `;
}
