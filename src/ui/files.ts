/** Save text as a file download. Works in extension pages without any extra permission. */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const today = (): string => new Date().toISOString().slice(0, 10);

export const readFileText = (f: File): Promise<string> => f.text();
