'use client';

import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Code, Heading1, Heading2, Heading3, Italic, List, ListOrdered,
  Pilcrow, Quote, Redo2, Strikethrough, Undo2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './production-product-editor.module.css';

const formats: readonly [string, LucideIcon, string, string?][] = [
  ['Bold', Bold, 'bold'], ['Italic', Italic, 'italic'], ['Strike through', Strikethrough, 'strikeThrough'],
  ['Inline code', Code, 'formatBlock', 'pre'], ['Heading 1', Heading1, 'formatBlock', 'h1'], ['Heading 2', Heading2, 'formatBlock', 'h2'],
  ['Heading 3', Heading3, 'formatBlock', 'h3'], ['Paragraph', Pilcrow, 'formatBlock', 'p'],
  ['Bullet list', List, 'insertUnorderedList'], ['Numbered list', ListOrdered, 'insertOrderedList'], ['Quote', Quote, 'formatBlock', 'blockquote'],
  ['Align left', AlignLeft, 'justifyLeft'], ['Align center', AlignCenter, 'justifyCenter'], ['Align right', AlignRight, 'justifyRight'],
  ['Undo', Undo2, 'undo'], ['Redo', Redo2, 'redo'],
];
const allowed = new Set(['P', 'DIV', 'BR', 'B', 'I', 'STRONG', 'EM', 'S', 'STRIKE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE']);

function copyDescription(raw: string, editor: HTMLElement) {
  const document = editor.ownerDocument;
  const parsed = new DOMParser().parseFromString(raw, 'text/html');
  function safeNodes(node: Node): Node[] {
    if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode(node.textContent ?? '')];
    if (!(node instanceof Element) || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH'].includes(node.tagName)) return [];
    const contents = Array.from(node.childNodes).flatMap(safeNodes);
    if (!allowed.has(node.tagName)) return contents;
    const element = document.createElement(node.tagName.toLowerCase());
    if (node instanceof HTMLElement && ['center', 'left', 'right'].includes(node.style.textAlign)) element.style.textAlign = node.style.textAlign;
    element.append(...contents);
    return [element];
  }
  editor.replaceChildren(...Array.from(parsed.body.childNodes).flatMap(safeNodes));
}

export function ProductDescriptionEditor({ initial }: { initial: string }) {
  const editor = useRef<HTMLDivElement>(null);
  const [description, setDescription] = useState(initial);
  useEffect(() => {
    if (editor.current) copyDescription(initial, editor.current);
  }, [initial]);
  function sync() {
    if (!editor.current) return;
    const blank = !editor.current.textContent?.trim();
    setDescription(blank ? '' : editor.current.innerHTML);
  }
  return <div className={styles.description}>
    <p id="product-description-label">Description</p>
    <div className={styles.toolbar} role="group" aria-label="Description formatting">
      {formats.map(([label, Icon, command, value]) => <button key={label} type="button" title={label} aria-label={label}
        onMouseDown={event => event.preventDefault()} onClick={() => {
          editor.current?.focus();
          document.execCommand(command, false, value);
          sync();
        }}><Icon size={16} aria-hidden="true"/></button>)}
    </div>
    <div className={styles.richText} ref={editor} contentEditable suppressContentEditableWarning role="textbox"
      tabIndex={0} aria-multiline="true" aria-labelledby="product-description-label" data-empty={!description}
      onInput={sync} onPaste={event => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
        sync();
      }} onDrop={event => event.preventDefault()}/>
    <input name="description" type="hidden" value={description}/>
  </div>;
}

type Spec = { title: string; description: string; options: string };
function specsFromInitial(initial: string): Spec[] {
  try {
    const decoded: unknown = JSON.parse(initial);
    return Array.isArray(decoded) ? decoded.map(item => ({
      title: typeof item?.title === 'string' ? item.title : '',
      description: typeof item?.description === 'string' ? item.description : '',
      options: Array.isArray(item?.options) ? item.options.filter((option: unknown) => typeof option === 'string').join(', ') : '',
    })) : [];
  } catch { return []; }
}
export function ProductSpecsEditor({ initial }: { initial: string }) {
  const [rows, setRows] = useState(() => specsFromInitial(initial).map((row, key) => ({ ...row, key })));
  const next = useRef(rows.length);
  function edit(key: number, patch: Partial<Spec>) {
    setRows(list => list.map(row => row.key === key ? { ...row, ...patch } : row));
  }
  return <details className={styles.specs}>
    <summary>Product Details Specification (Optional)<ChevronDown aria-hidden="true" size={16}/></summary>
    <div className={styles.specRows}>
      {rows.map(row => <div key={row.key} className={styles.specRow}>
        <label>Title<input placeholder="Port types" value={row.title} onChange={event => edit(row.key, { title: event.target.value })}/></label>
        <label>Description<input placeholder="Description" value={row.description} onChange={event => edit(row.key, { description: event.target.value })}/></label>
        <label>Options<input placeholder="Options (comma separated)" value={row.options} onChange={event => edit(row.key, { options: event.target.value })}/></label>
        <button type="button" className={styles.remove} onClick={() => setRows(list => list.filter(item => item.key !== row.key))}>Remove</button>
      </div>)}
      <button type="button" className={styles.secondary} onClick={() => {
        const key = next.current++;
        setRows(list => [...list, {key, title: '', description: '', options: ''}]);
      }}>+ Add Another Spec</button>
    </div>
    <input name="dynamic_specs" type="hidden" value={JSON.stringify(rows.filter(row => row.title.trim()).map(row => ({
      title: row.title.trim(), description: row.description.trim(), options: row.options.split(',').map(option => option.trim()).filter(Boolean),
    })))}/>
  </details>;
}

export function ProductEditorPanel({ title, children }: { title?: string; children: ReactNode }) {
  return <section className={styles.panel}>
    {title && <h2>{title}</h2>}
    <div className={styles.body}>{children}</div>
  </section>;
}

export function ProductEditorSwitch({ label, hint, name, initial }: { label: string; hint: string; name: string; initial: boolean }) {
  const [checked, setChecked] = useState(initial);
  return <div className={styles.switchField}>
    <p>{label}</p>
    <label><span>{hint}</span><input type="checkbox" role="switch" checked={checked}
      aria-label={label} onChange={event => setChecked(event.target.checked)}/></label>
    <input type="hidden" name={name} value={String(checked)}/>
  </div>;
}
