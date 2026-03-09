import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Convert markdown text to HTML
 * This function sanitizes the output to prevent XSS attacks
 *
 * @param markdown - Markdown text to convert
 * @returns Sanitized HTML string
 */
export function markdownToHTML(markdown: string): string {
  // Use marked library to convert markdown to HTML (synchronous)
  // Explicitly set async: false to get synchronous behavior
  const html = marked(markdown, { async: false });

  // Sanitize HTML to prevent XSS attacks
  const sanitized = sanitizeHtml(html, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'a', 'b', 'strong', 'i', 'em',
      'ul', 'ol', 'li',
      'blockquote',
      'code', 'pre',
      'br', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    allowedAttributes: {
      'a': ['href', 'name', 'target'],
      'code': ['class']
    },
    // Allow data:image for inline images (if needed)
    allowedSchemes: ['http', 'https', 'mailto', 'data']
  });

  return sanitized;
}
