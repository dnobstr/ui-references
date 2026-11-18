'use client';

import React from 'react';

interface MarkdownOutputProps {
  content: string;
  isCssTab?: boolean;
}

const HEX_COLOR_EXACT = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function renderCodeChip(codeText: string, key: string | number) {
  const trimmed = codeText.trim();
  const isHex = HEX_COLOR_EXACT.test(trimmed);
  const swatchHex = isHex
    ? trimmed.length === 7 || trimmed.length === 4
      ? trimmed
      : trimmed.slice(0, 7)
    : null;

  return (
    <code key={key} className="md-inline-code">
      {swatchHex && (
        <span
          className="md-inline-swatch"
          style={{ backgroundColor: swatchHex }}
          aria-hidden="true"
        />
      )}
      {codeText}
    </code>
  );
}

function renderInlineSegments(text: string): React.ReactNode[] {
  // Split by inline code (`...`), bold (**...**), or standalone hex codes (#RRGGBB)
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?\b)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return renderCodeChip(part.slice(1, -1), `code-${idx}`);
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={`bold-${idx}`} className="md-strong">
          {renderInlineSegments(inner)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={`em-${idx}`}>{part.slice(1, -1)}</em>;
    }

    if (HEX_COLOR_EXACT.test(part)) {
      return renderCodeChip(part, `hex-${idx}`);
    }

    return <React.Fragment key={`txt-${idx}`}>{part}</React.Fragment>;
  });
}

function renderListItemContent(rawText: string): React.ReactNode {
  const trimmed = rawText.trim();
  // If bullet does not already start with **bold**, check for "Label: Description" pattern
  if (!trimmed.startsWith('**')) {
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 1 && colonIdx < 48 && !trimmed.slice(0, colonIdx).includes('`')) {
      const label = trimmed.slice(0, colonIdx);
      const rest = trimmed.slice(colonIdx + 1);
      return (
        <>
          <strong className="md-strong">{renderInlineSegments(label)}:</strong>
          {renderInlineSegments(rest)}
        </>
      );
    }
  }
  return renderInlineSegments(trimmed);
}

function renderCssCodeBlock(cssText: string, key: string | number) {
  const lines = cssText.replace(/^```(?:css)?\s*/i, '').replace(/```\s*$/, '').split('\n');
  return (
    <pre key={key} className="md-code-block">
      <code>
        {lines.map((line, idx) => {
          const hexMatches = line.match(/#[0-9A-Fa-f]{6}\b/g);
          const primaryHex = hexMatches ? hexMatches[0] : null;
          return (
            <div key={idx} className="md-code-line">
              {primaryHex && (
                <span
                  className="md-inline-swatch"
                  style={{ backgroundColor: primaryHex }}
                  aria-hidden="true"
                />
              )}
              <span>{line || ' '}</span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}

export function stripMarkdownForExcerpt(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[•\-*]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

export default function MarkdownOutput({ content, isCssTab = false }: MarkdownOutputProps) {
  if (!content || !content.trim()) {
    return (
      <div className="md-rendered-output">
        <p className="md-p">No specification generated yet.</p>
      </div>
    );
  }

  if (isCssTab) {
    return (
      <div className="md-rendered-output">
        {renderCssCodeBlock(content, 'css-tab-block')}
      </div>
    );
  }

  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced Code Block (```)
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push(renderCssCodeBlock(codeLines.join('\n'), `fence-${i}`));
      continue;
    }

    // Headings (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      if (level === 1) {
        blocks.push(
          <h2 key={`h1-${i}`} className="md-h1">
            {renderInlineSegments(text)}
          </h2>
        );
      } else if (level === 2) {
        blocks.push(
          <h3 key={`h2-${i}`} className="md-h2">
            {renderInlineSegments(text)}
          </h3>
        );
      } else if (level === 3) {
        blocks.push(
          <h4 key={`h3-${i}`} className="md-h3">
            {renderInlineSegments(text)}
          </h4>
        );
      } else {
        blocks.push(
          <h5 key={`h4-${i}`} className="md-h4">
            {renderInlineSegments(text)}
          </h5>
        );
      }
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${i}`} className="md-hr" />);
      i++;
      continue;
    }

    // Ordered List (1. ..., 2. ...) with optional nested sub-bullets
    if (/^\d+\.\s+/.test(trimmed)) {
      const orderedItems: {
        num: string;
        mainText: string;
        subBullets: string[];
      }[] = [];

      while (i < lines.length) {
        const line = lines[i];
        const t = line.trim();
        if (!t) {
          // Look ahead to see if next non-empty line continues the ordered list
          let nextNonEmpty = i + 1;
          while (nextNonEmpty < lines.length && !lines[nextNonEmpty].trim()) {
            nextNonEmpty++;
          }
          if (
            nextNonEmpty < lines.length &&
            (/^\d+\.\s+/.test(lines[nextNonEmpty].trim()) ||
              /^\s{2,}[-*•]\s+/.test(lines[nextNonEmpty]))
          ) {
            i = nextNonEmpty;
            continue;
          }
          break;
        }

        const olMatch = t.match(/^(\d+)\.\s+(.*)$/);
        if (olMatch) {
          orderedItems.push({
            num: olMatch[1],
            mainText: olMatch[2],
            subBullets: [],
          });
          i++;
          continue;
        }

        // Indented sub-bullet belonging to current ordered item
        const subBulletMatch = line.match(/^\s+[-*•]\s+(.*)$/);
        if (subBulletMatch && orderedItems.length > 0) {
          orderedItems[orderedItems.length - 1].subBullets.push(
            subBulletMatch[1]
          );
          i++;
          continue;
        }

        break;
      }

      blocks.push(
        <ol key={`ol-${i}`} className="md-ol">
          {orderedItems.map((item, idx) => (
            <li key={idx} className="md-ol-item">
              <div className="md-ol-lead">
                {renderListItemContent(item.mainText)}
              </div>
              {item.subBullets.length > 0 && (
                <ul className="md-ul md-ul-nested">
                  {item.subBullets.map((sub, sIdx) => (
                    <li key={sIdx} className="md-ul-item">
                      {renderListItemContent(sub)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Unordered List (- ..., * ..., • ...)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: { text: string; subItems: string[] }[] = [];

      while (i < lines.length) {
        const line = lines[i];
        const t = line.trim();
        if (!t) {
          i++;
          break;
        }

        const nestedMatch = line.match(/^\s{2,}[-*•]\s+(.*)$/);
        if (nestedMatch && items.length > 0) {
          items[items.length - 1].subItems.push(nestedMatch[1]);
          i++;
          continue;
        }

        const ulMatch = t.match(/^[-*•]\s+(.*)$/);
        if (ulMatch) {
          items.push({ text: ulMatch[1], subItems: [] });
          i++;
          continue;
        }

        break;
      }

      blocks.push(
        <ul key={`ul-${i}`} className="md-ul">
          {items.map((item, idx) => (
            <li key={idx} className="md-ul-item">
              {renderListItemContent(item.text)}
              {item.subItems.length > 0 && (
                <ul className="md-ul md-ul-nested">
                  {item.subItems.map((sub, sIdx) => (
                    <li key={sIdx} className="md-ul-item">
                      {renderListItemContent(sub)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Blockquote (> ...)
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote key={`bq-${i}`} className="md-blockquote">
          {renderInlineSegments(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Standard Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>')
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    blocks.push(
      <p key={`p-${i}`} className="md-p">
        {renderInlineSegments(paraLines.join(' '))}
      </p>
    );
  }

  return <div className="md-rendered-output">{blocks}</div>;
}
