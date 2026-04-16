const MIN_SENT_CODE_LENGTH = 4;
const MAX_SENT_CODE_LENGTH = 12;

function normalizeSentCode(value) {
  const digitsOnly = String(value || "").replace(/\D+/g, "");
  if (
    digitsOnly.length < MIN_SENT_CODE_LENGTH ||
    digitsOnly.length > MAX_SENT_CODE_LENGTH
  ) {
    return "";
  }

  return digitsOnly;
}

function parseDigitGroups(segment = "") {
  const groups = String(segment).match(/\d+/g) || [];
  const extractedCodes = [];

  for (let index = 0; index < groups.length; ) {
    const group = groups[index];
    if (group.length >= 6) {
      extractedCodes.push(group);
      index += 1;
      continue;
    }

    if (group.length < 4) {
      index += 1;
      continue;
    }

    let combined = group;
    let pointer = index + 1;
    while (
      pointer < groups.length &&
      groups[pointer].length <= 4 &&
      combined.length + groups[pointer].length <= MAX_SENT_CODE_LENGTH
    ) {
      combined += groups[pointer];
      pointer += 1;
    }

    if (combined.length >= MIN_SENT_CODE_LENGTH) {
      extractedCodes.push(combined);
    }

    index = pointer;
  }

  return extractedCodes;
}

function removeListEnumerators(value = "") {
  return String(value).replace(
    /(^|[\s,;|\n\r])\d{1,2}\s*[\.\)](?=\s*\d)/g,
    "$1"
  );
}

function extractSentCodesFromCell(rawValue) {
  const sourceText = removeListEnumerators(
    String(rawValue || "")
      .replace(/\u00A0/g, " ")
      .replace(/[“”"]/g, " ")
      .replace(/\r/g, "\n")
  );

  if (!sourceText.trim()) {
    return [];
  }

  const segments = sourceText
    .split(/[\n,;|]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  const extracted = [];
  for (const segment of segments) {
    const candidates = parseDigitGroups(segment);
    for (const candidate of candidates) {
      const normalized = normalizeSentCode(candidate);
      if (normalized) {
        extracted.push(normalized);
      }
    }
  }

  return extracted;
}

module.exports = {
  MAX_SENT_CODE_LENGTH,
  MIN_SENT_CODE_LENGTH,
  extractSentCodesFromCell,
  normalizeSentCode,
};

