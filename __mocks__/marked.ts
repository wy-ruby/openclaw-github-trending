// Mock for marked module - provides synchronous markdown to HTML conversion
export function marked(markdown: string, options?: any): string {
  // Simple markdown to HTML conversion for testing
  if (!markdown) return '';

  let html = markdown;

  // Convert header
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');

  // Convert bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Convert italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Convert code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Convert paragraphs
  html = html.replace(/^(?!<[hul]).+$/gm, '<p>$&</p>');

  // Convert line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

marked.parse = marked;

export default marked;
