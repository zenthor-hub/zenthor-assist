/** Approval keyword sets — shared between text ingestion, audio transcript, and approval flows. */
const APPROVE_WORDS = new Set(["YES", "Y", "APPROVE", "SIM"]);
const REJECT_WORDS = new Set(["NO", "N", "REJECT", "NAO", "NÃO"]);

/**
 * Classify user text as an approval keyword.
 * Returns "approved", "rejected", or null if text does not match any keyword.
 */
export function classifyApprovalText(text: string): "approved" | "rejected" | null {
  const normalized = text.trim().toUpperCase();
  if (APPROVE_WORDS.has(normalized)) return "approved";
  if (REJECT_WORDS.has(normalized)) return "rejected";
  return null;
}
