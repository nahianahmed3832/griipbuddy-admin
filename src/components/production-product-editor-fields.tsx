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

export function ProductEditorPanel({ title, children, general = false }: { title?: ReactNode; children: ReactNode; general?: boolean }) {
  return <section className={styles.panel}>
    {title && <h2>{title}</h2>}
    <div className={styles.body} data-general={general}>{children}</div>
  </section>;
}

export function ProductEditorSwitch({ label, hint, name, initial, onChange }: { label: string; hint: string; name: string; initial: boolean; onChange?: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(initial);
  return <div className={styles.switchField} data-inline={!hint}>
    {hint && <p>{label}</p>}
    <label><span>{hint || label}</span><input type="checkbox" role="switch" checked={checked}
      aria-label={label} onChange={event => { setChecked(event.target.checked); onChange?.(event.target.checked); }}/></label>
    {name && <input type="hidden" name={name} value={String(checked)}/>}
  </div>;
}

const measureFields = [
  ['title', 'Title'], ['min_text', 'Min Text'], ['min_value', 'Min Value'],
  ['max_text', 'Max Text'], ['max_value', 'Max Value'], ['current_value', 'Current Value'],
] as const;
type Measures = Partial<Record<typeof measureFields[number][0], string>>;
type Information = { title: string; description: string; imported_value: Measures };
type Property = { key: number; values: Measures; detail?: Information };

export function ProductPropertiesEditor({ field, initial }: { field: 'product_specifications' | 'product_card_properties'; initial: string }) {
  const showInformation = field === 'product_specifications';
  const [rows, setRows] = useState<Property[]>(() => {
    try {
      const decoded = JSON.parse(initial);
      if (!Array.isArray(decoded)) return [];
      return decoded.map((entry, key) => ({
        key, values: showInformation ? {} : entry,
        ...(showInformation && { detail: {
          title: entry.title ?? '', description: Array.isArray(entry.description) ? entry.description.join(', ') : '',
          imported_value: entry.imported_value ?? {},
        } }),
      }));
    } catch { return []; }
  });
  const next = useRef(rows.length);
  function update(key: number, edit: (row: Property) => Property) {
    setRows(previous => previous.map(row => row.key === key ? edit(row) : row));
  }
  const saved = rows.flatMap<Measures | { title: string; description: string[]; imported_value: Measures }>(({ values, detail }) => {
    if (!detail) return values.title?.trim() ? [values] : [];
    if (!detail.title.trim()) return [];
    return [{
      title: detail.title,
      description: detail.description.split(',').map(item => item.trim()).filter(Boolean),
      imported_value: detail.imported_value,
    }];
  });
  return <details className={styles.specs + ' ' + styles.extraDetails}>
    <summary>{showInformation ? 'Product Information (Optional)' : 'Product Card Properties (Optional)'}<ChevronDown aria-hidden="true" size={16}/></summary>
    <div className={styles.propertyRows}>
      {rows.map(({ key, values, detail }) => <section className={styles.property} key={key}>
        {detail && <>
          <div className={styles.propertyMain}>
            <label className={styles.field}>Title<input placeholder="Display" value={detail.title} onChange={event => update(key, row => ({ ...row, detail: { ...detail, title: event.target.value } }))}/></label>
            <label className={styles.field}>Description<input placeholder="Description items" value={detail.description} onChange={event => update(key, row => ({ ...row, detail: { ...detail, description: event.target.value } }))}/></label>
          </div>
          <p>Imported Value (Optional)</p>
        </>}
        <div className={detail ? styles.propertyMeasures : styles.propertyMain}>
          {measureFields.map(([name, label]) => <label className={styles.field} key={name}>{label}
            <input value={(detail?.imported_value ?? values)[name] ?? ''} onChange={event => update(key, row => {
              const patch = { [name]: event.target.value };
              return detail ? { ...row, detail: { ...detail, imported_value: { ...detail.imported_value, ...patch } } } : { ...row, values: { ...values, ...patch } };
            })}/>
          </label>)}
        </div>
        <button className={styles.danger} type="button" onClick={() => setRows(previous => previous.filter(row => row.key !== key))}>Remove</button>
      </section>)}
      <button className={styles.secondary} type="button" disabled={rows.length >= 30} onClick={() => {
        const key = next.current++;
        setRows(previous => [...previous, { key, values: {}, ...(showInformation && { detail: { title: '', description: '', imported_value: {} } }) }]);
      }}>{showInformation ? '+ Add Another Specification' : '+ Add Another Property'}</button>
    </div>
    <input type="hidden" name={field} value={JSON.stringify(saved)}/>
  </details>;
}

export function ProductTagsInput({ label, name, placeholder, initial, limit = 60 }: {
  label: string; name: string; placeholder: string; initial: string; limit?: number;
}) {
  const [tags, setTags] = useState(initial.split('\n').filter(Boolean));
  const [draft, setDraft] = useState('');
  function add() {
    if (!draft.trim()) return;
    setTags(current => [...new Set([...current, ...draft.split(',').map(tag => tag.trim()).filter(Boolean)])].slice(0, limit));
    setDraft('');
  }
  return <div className={styles.field}>
    <label>{label}<input placeholder={placeholder} value={draft} maxLength={200} disabled={tags.length >= limit}
      onChange={event => setDraft(event.target.value)} onBlur={add} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); }
      }}/></label>
    {tags.length > 0 && <div className={styles.tags}>{tags.map(tag => <button type="button" key={tag} onClick={() => setTags(current => current.filter(item => item !== tag))}
      aria-label={'Remove ' + tag}>{tag} <span aria-hidden="true">×</span></button>)}</div>}
    <input type="hidden" name={name} value={tags.join('\n')}/>
  </div>;
}

export function ProductMultipleChoice({ label, name, placeholder, options, initial, multipleValues }: {
  label: string; name: string; placeholder: string; options: { value: string; label: string }[];
  initial: string; multipleValues?: boolean;
}) {
  const [selected, setSelected] = useState(initial.split('\n').filter(Boolean));
  const [search, setSearch] = useState('');
  const all = [...options, ...selected.filter(value => !options.some(choice => choice.value === value)).map(value => ({ label: value, value }))];
  const find = search.trim().toLowerCase();
  return <div className={styles.field}>
    <span>{label}</span>
    <details className={styles.multiple}>
      <summary aria-label={label}>{selected.length ? selected.map(value => all.find(option => option.value === value)?.label ?? value).join(', ') : placeholder}
        <ChevronDown size={15} aria-hidden="true"/></summary>
      <div className={styles.multipleOptions}>
        <input type="search" aria-label={'Search ' + label.toLowerCase()} placeholder="Search…" value={search} onChange={event => setSearch(event.target.value)}/>
        {all.filter(option => option.label.toLowerCase().includes(find)).map(option => <label key={option.value}>
          <input type="checkbox" checked={selected.includes(option.value)} onChange={event => setSelected(current => event.target.checked
            ? [...current, option.value] : current.filter(value => value !== option.value))}/>
          {option.label}
        </label>)}
      </div>
    </details>
    {multipleValues ? selected.map(value => <input type="hidden" key={value} name={name} value={value}/>)
      : <input type="hidden" name={name} value={selected.join('\n')}/>}
  </div>;
}
