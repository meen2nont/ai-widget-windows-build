import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '8px',
      margin: '0.75rem 0',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        justify: 'space-between',
        alignItems: 'center',
        padding: '0.4rem 0.85rem',
        background: 'rgba(255, 255, 255, 0.05)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        fontSize: '0.78rem',
        color: '#8b949e',
        fontFamily: 'monospace'
      }}>
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? '#3fb950' : '#8b949e',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.75rem',
            padding: '2px 6px',
            borderRadius: '4px'
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre style={{
        margin: 0,
        padding: '0.85rem',
        overflowX: 'auto',
        fontSize: '0.85rem',
        fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
        color: '#e6edf3',
        lineHeight: 1.45
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function formatInline(text) {
  if (!text) return '';
  const elements = [];
  let lastIndex = 0;
  const inlineRegex = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }
    if (match[1]) {
      // Inline code `...`
      elements.push(
        <code key={match.index} style={{
          background: 'rgba(110, 118, 129, 0.25)',
          padding: '0.15rem 0.35rem',
          borderRadius: '4px',
          fontSize: '0.85em',
          color: '#f0f6fc',
          fontFamily: 'monospace'
        }}>
          {match[1]}
        </code>
      );
    } else if (match[2]) {
      // Bold **...**
      elements.push(<strong key={match.index}>{match[2]}</strong>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }
  return elements.length > 0 ? elements : text;
}

export default function MarkdownMessage({ content }) {
  if (!content) return null;

  // Split content by code blocks ```
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="markdown-body" style={{ lineHeight: 1.6, wordBreak: 'break-word' }}>
      {parts.map((part, idx) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const firstLineEnd = part.indexOf('\n');
          let language = '';
          let code = '';

          if (firstLineEnd !== -1) {
            language = part.substring(3, firstLineEnd).trim();
            code = part.substring(firstLineEnd + 1, part.length - 3);
          } else {
            code = part.substring(3, part.length - 3);
          }

          return <CodeBlock key={idx} code={code} language={language} />;
        }

        // Process non-code block text
        const lines = part.split('\n');
        const renderedElements = [];
        let i = 0;

        while (i < lines.length) {
          const line = lines[i];

          // Markdown Table detection: lines with '|'
          if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            const tableRows = [];
            while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
              tableRows.push(lines[i]);
              i++;
            }

            // Filter out table divider row |---|---|
            const dataRows = tableRows.filter(r => !/^\|[\s\-:|]+\|$/.test(r.trim()));
            if (dataRows.length > 0) {
              const headerCells = dataRows[0].split('|').slice(1, -1).map(c => c.trim());
              const bodyRows = dataRows.slice(1);

              renderedElements.push(
                <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.85rem',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <thead>
                      <tr style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
                        {headerCells.map((h, hIdx) => (
                          <th key={hIdx} style={{ padding: '0.5rem 0.75rem', border: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left' }}>
                            {formatInline(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bodyRows.map((row, rIdx) => {
                        const cells = row.split('|').slice(1, -1).map(c => c.trim());
                        return (
                          <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            {cells.map((c, cIdx) => (
                              <td key={cIdx} style={{ padding: '0.45rem 0.75rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                {formatInline(c)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            }
            continue;
          }

          // Headers
          if (line.startsWith('### ')) {
            renderedElements.push(<h4 key={i} style={{ margin: '0.8rem 0 0.4rem', color: '#58a6ff' }}>{formatInline(line.replace('### ', ''))}</h4>);
          } else if (line.startsWith('## ')) {
            renderedElements.push(<h3 key={i} style={{ margin: '1rem 0 0.5rem', color: '#58a6ff', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.3rem' }}>{formatInline(line.replace('## ', ''))}</h3>);
          } else if (line.startsWith('# ')) {
            renderedElements.push(<h2 key={i} style={{ margin: '1.2rem 0 0.6rem', color: '#79c0ff' }}>{formatInline(line.replace('# ', ''))}</h2>);
          } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            // Bullet List
            renderedElements.push(
              <div key={i} style={{ display: 'flex', gap: '0.5rem', margin: '0.15rem 0 0.15rem 0.5rem' }}>
                <span style={{ color: '#38bdf8' }}>•</span>
                <div>{formatInline(line.trim().substring(2))}</div>
              </div>
            );
          } else if (line.trim() === '') {
            renderedElements.push(<div key={i} style={{ height: '0.4rem' }} />);
          } else {
            // Normal Line
            renderedElements.push(
              <div key={i} style={{ margin: '0.15rem 0' }}>
                {formatInline(line)}
              </div>
            );
          }
          i++;
        }

        return <React.Fragment key={idx}>{renderedElements}</React.Fragment>;
      })}
    </div>
  );
}
