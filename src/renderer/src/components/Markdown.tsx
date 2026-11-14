import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

const components: Components = {
  // Links leave the app: the main process opens `target="_blank"` https links in the browser.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  // Remote images are blocked by the Content-Security-Policy; show their text instead.
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
};

const remarkPlugins = [remarkGfm];

interface MarkdownProps {
  children: string;
}

/**
 * Renders markdown written by the summarize agent. `react-markdown` builds React elements
 * rather than injecting HTML, and raw HTML in the source is not rendered at all, so the
 * text can be treated as untrusted.
 */
export function Markdown({ children }: MarkdownProps) {
  return (
    <div className={styles.prose}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
