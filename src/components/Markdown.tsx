import React from 'react';

// Minimal Markdown renderer for chat replies: paragraphs, headings, bullet
// and numbered lists, pipe tables, **bold**, *italic*, `code`. Enough for
// what the planner writes without pulling in a full parser.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${keyPrefix}-b${i}`} className="font-semibold text-ever-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={`${keyPrefix}-c${i}`} className="font-mono text-[12px] bg-white/10 rounded px-1">{tok.slice(1, -1)}</code>);
    else out.push(<em key={`${keyPrefix}-i${i}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSeparatorRow = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const splitRow = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

const Markdown: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = level <= 2 ? 'text-[15px] font-semibold text-ever-ink mt-3' : 'text-[13.5px] font-semibold text-ever-ink mt-2';
      blocks.push(<div key={key++} className={cls}>{renderInline(h[2], `h${key}`)}</div>);
      i++; continue;
    }

    // Table
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      blocks.push(
        <div key={key++} className="overflow-x-auto my-2">
          <table className="text-[12.5px] w-full">
            <thead>
              <tr className="text-ever-dim text-left">
                {header.map((c, ci) => <th key={ci} className={`py-1 pr-3 font-mono font-normal text-[10.5px] uppercase tracking-wide ${ci > 0 ? 'text-right' : ''}`}>{renderInline(c, `th${key}${ci}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-ever-line">
                  {r.map((c, ci) => <td key={ci} className={`py-1 pr-3 tabular-nums ${ci > 0 ? 'text-right' : ''}`}>{renderInline(c, `td${key}${ri}${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Lists
    const bullet = /^\s*[-*•]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? numbered.test(lines[i]) : bullet.test(lines[i]))) {
        items.push((ordered ? numbered : bullet).exec(lines[i])![1]);
        i++;
        // continuation lines (indented) belong to the previous item
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={key++} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 my-1.5 space-y-1`}>
          {items.map((it, ii) => <li key={ii}>{renderInline(it, `li${key}${ii}`)}</li>)}
        </Tag>,
      );
      continue;
    }

    // Paragraph: gather until blank line or a block start
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i]) && !isTableRow(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++} className="my-1.5 leading-relaxed">{renderInline(para.join(' '), `p${key}`)}</p>);
  }

  return <div className={className}>{blocks}</div>;
};

export default Markdown;
