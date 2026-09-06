import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Gerenderte Markdown-Vorschau. Bewusst eine eigene Datei mit Default-Export:
 * `react-markdown` + `remark-gfm` sind die schwersten Abhängigkeiten des
 * Frontends und werden erst geladen, wenn jemand den Vorschau-Tab öffnet
 * (siehe MarkdownEditor).
 */
export default function MarkdownPreview({ value }: { value: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>;
}
