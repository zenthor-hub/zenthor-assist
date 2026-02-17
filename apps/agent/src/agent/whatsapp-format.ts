export function stripModelAndToolFooter(content: string): string {
  return content.replace(/\n+_?Model:.*$/s, "").trimEnd();
}

/**
 * Convert remaining markdown syntax to WhatsApp-friendly plain-text formatting.
 */
export function sanitizeForWhatsApp(text: string): string {
  return (
    text
      // Convert **bold** → *bold* (double asterisks to single)
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      // Convert __bold__ → *bold*
      .replace(/__(.+?)__/g, "*$1*")
      // Convert markdown headers to bold lines
      .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
      // Strip image syntax ![alt](url) → alt: url (must run before link replacement)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1: $2")
      // Convert [text](url) → text (url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      // Convert horizontal rules (---, ***) to a simple line
      .replace(/^[-*_]{3,}$/gm, "───")
      // Clean up any triple+ newlines to double
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
