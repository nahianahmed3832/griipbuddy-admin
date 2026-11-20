import { useId } from "react";
import type { ProductCategoryAttribute } from "./contracts";
import type { AttributeValue, AttributeValues } from "./connected-product-draft";

export function ProductAttributeFields({ templates, value, onChange, primaryCategoryId, optionValues }: {
  templates: readonly ProductCategoryAttribute[];
  value: AttributeValues;
  onChange: (id: string, value: AttributeValue | undefined) => void;
  primaryCategoryId: string;
  optionValues?: Record<string, string>;
}) {
  const fieldGroup = useId();
  const obsolete = Object.entries(value).filter(([id]) => !templates.some(template => template.id === id && !template.variantOptionKey));
  if (!templates.length && !obsolete.length) return <p className="taxonomy-muted">This category has no attributes in this scope.</p>;

  return <div className="taxonomy-form">
    {templates.map(template => {
      const { id, name, dataType, required, sourceDepartmentId, variantOptionKey } = template;
      const current = variantOptionKey ? optionValues?.[variantOptionKey] : value[id];
      const missing = current === undefined;
      const hintId = `${fieldGroup}-${id}`;
      const details = <span id={hintId} className="taxonomy-muted">
        {required ? "Required for publication" : "Optional"} · {sourceDepartmentId === primaryCategoryId
          ? "Local category override" : `Inherited from ${template.sourceName}`}
        {required && missing ? " · Missing" : ""}
      </span>;
      if (variantOptionKey) return <div key={id}>
        <strong>{name}</strong>
        <p className="taxonomy-muted">{current ?? "No selection"} · Uses the {variantOptionKey} option</p>
        {details}
      </div>;
      return <div key={id}><label>
        {name}
        {dataType === "ENUM" ? <select aria-describedby={hintId} value={missing ? "" : String(current)} onChange={event => onChange(id, event.target.value || undefined)}>
          <option value="">Choose a value</option>
          {!missing && !template.allowedValues.includes(String(current)) && <option value={String(current)}>{String(current)} (review)</option>}
          {template.allowedValues.map(item => <option key={item}>{item}</option>)}
        </select> : dataType === "BOOLEAN" ? <select aria-describedby={hintId} value={missing ? "" : String(current)}
          onChange={event => onChange(id, event.target.value ? event.target.value === "true" : undefined)}>
          <option value="">Choose a value</option><option value="true">Yes</option><option value="false">No</option>
          {!missing && typeof current !== "boolean" && String(current) !== "true" && String(current) !== "false" && <option value={String(current)}>{String(current)} (review)</option>}
        </select> : <input aria-describedby={hintId} type={dataType === "NUMBER" ? "number" : "text"}
          {...(dataType === "NUMBER" ? { step: "any" } : { maxLength: 240 })}
          value={dataType === "NUMBER" && typeof current === "string" && !Number.isFinite(Number(current)) ? "" : current === undefined ? "" : String(current)}
          onChange={event => onChange(id, event.target.value
            ? dataType === "NUMBER" ? event.target.valueAsNumber : event.target.value
            : undefined)} />}
      </label>{details}</div>;
    })}
    {!!obsolete.length && <div>
      <strong>Values that need review</strong>
      <p className="taxonomy-muted">Review saved values that do not apply to this template before saving the change.</p>
      <ul className="taxonomy-choice-list">{obsolete.map(([id, current]) => <li key={id} className="taxonomy-actions">
        <span>{id} · {String(current)}</span>
        <button type="button" className="taxonomy-button" onClick={() => onChange(id, undefined)}>Remove {id}</button>
      </li>)}</ul>
    </div>}
  </div>;
}
