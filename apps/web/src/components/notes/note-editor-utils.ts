export type SectionAction = "summarize" | "rewrite" | "expand" | "extract";

function normalizeEditorText(value: string) {
  return value.replace(/\r\n/g, "\n");
}

export function isEmptyEditorMarkup(value: string) {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  return normalized === "<p></p>" || normalized === "<p><br></p>" || normalized === "<p><br/></p>";
}

export function normalizeEditorMarkup(value: string) {
  const normalized = normalizeEditorText(value).trim();
  return isEmptyEditorMarkup(normalized) ? "" : normalized;
}

function isLikelyHtml(value: string) {
  return /<[a-z][\s\S]*>/i.test(value);
}

function escapeEditorHtml(value: string) {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toEditorHtml(value: string) {
  const normalized = normalizeEditorMarkup(value);
  if (!normalized) return "";

  if (isLikelyHtml(normalized)) return normalized;

  return normalized
    .split(/\n{2,}/g)
    .map((paragraph) => `<p>${escapeEditorHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}
