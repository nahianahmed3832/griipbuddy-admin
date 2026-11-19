"use client";

import { useId, useState } from "react";
import { marketList } from "./markets";
import { canonicalCategoryLocale } from "./category-locale";
import { selectProductContent } from "./product-presentation";
import type { ProductWorkspaceProduct } from "./contracts";
import { runCatalogCommand, TaxonomyFeedback, useTaxonomyDirty, useTaxonomyOperation } from "./taxonomy-controls";

type Translation = { locale: string; name: string; description: string; shortDescription: string | null };
type Draft = { revision: number; content: Omit<Translation, "locale"> };
type TranslationSave = { revision: number; result: Translation | null };

export function ConnectedProductLocalization({ product, localeChoices = [] }: { product: ProductWorkspaceProduct; localeChoices?: readonly string[] }) {
  const options = [...new Set([...localeChoices, ...marketList.map(row => row.locale), ...product.translations.map(row => row.locale)])];
  const [locale, setLocale] = useState(options[0]);
  const [requested, setRequested] = useState(locale);
  const [localeError, setLocaleError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, TranslationSave>>({});
  const operation = useTaxonomyOperation();
  const markDirty = useTaxonomyDirty();
  const heading = useId();
  const suggestions = useId();

  const available = new Map<string, Translation>(product.translations.map(row => [row.locale, row]));
  for (const [tag, saved] of Object.entries(confirmed)) {
    if (saved.revision <= product.revision) continue;
    if (saved.result) available.set(tag, saved.result);
    else available.delete(tag);
  }
  const stored = available.get(locale);
  const inherited = selectProductContent(product, [...available.values()].filter(row => row.locale !== locale), locale);
  const values = draft?.content ?? {
    name: stored?.name ?? inherited.name,
    description: stored?.description ?? inherited.description,
    shortDescription: stored ? stored.shortDescription : inherited.shortDescription ?? null,
  };
  const revision = Math.max(product.revision, ...Object.values(confirmed).map(row => row.revision));
  const archived = product.publication === "ARCHIVED";

  function discard() {
    setDraft(null);
    markDirty(false);
  }

  function edit(patch: Partial<Draft["content"]>) {
    setDraft({ revision: draft?.revision ?? revision, content: { ...values, ...patch } });
    markDirty(true);
  }

  function switchLocale() {
    const next = canonicalCategoryLocale(requested);
    if (!next) {
      setLocaleError("Enter a valid locale tag, such as en-US or bn-BD.");
      return;
    }
    if (next !== locale) {
      if (draft && !window.confirm("Discard unsaved translation changes before switching locales?")) return;
      discard();
      setLocale(next);
    }
    setRequested(next);
    setLocaleError("");
  }

  async function save(remove = false) {
    if (archived || (!remove && !draft)) return;
    if (remove && !window.confirm("Remove this translation and use inherited content for " + locale + "?")) return;
    const ok = await operation.run(async () => {
      const result = await runCatalogCommand<TranslationSave>("product.translation", {
        productId: product.id, revision: draft?.revision ?? revision, locale,
        content: remove ? null : { ...values, shortDescription: values.shortDescription?.trim() || null },
      });
      setConfirmed(previous => ({ ...previous, [locale]: result }));
    }, remove ? "Translation removed. Inherited content is now in use." : "Translation saved.");
    if (ok) discard();
  }

  return <section id="localization" className="taxonomy-card" aria-labelledby={heading}>
    <h2 id={heading}>Localization</h2>
    <p className="taxonomy-muted">Translations change copy for a locale. Offers, currency, and stock are managed separately.</p>
    <form className="taxonomy-form commerce-form" onSubmit={event => { event.preventDefault(); switchLocale(); }}>
      <div className="taxonomy-fields">
        <label>Locale tag<input value={requested} onChange={event => setRequested(event.target.value)} list={suggestions} required maxLength={35} /></label>
        <div className="taxonomy-actions"><button className="button button--outline" type="submit" disabled={operation.pending}>Edit locale</button></div>
      </div>
      <datalist id={suggestions}>{[...new Set([...options, ...available.keys()])].map(tag => <option key={tag} value={tag} />)}</datalist>
      {localeError && <p role="alert" className="taxonomy-error">{localeError}</p>}
    </form>
    <p className="taxonomy-muted">{stored ? "Editing the saved " + locale + " translation."
      : locale + " inherits " + (inherited.locale ? "the " + inherited.locale + " translation." : "the shared product content.")}</p>
    {archived && <p className="taxonomy-muted">Archived translations are read-only.</p>}
    <form className="taxonomy-form commerce-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset className="taxonomy-form" disabled={archived || operation.pending}>
        <label>Translated title<input value={values.name} onChange={event => edit({ name: event.target.value })} required minLength={2} maxLength={120} /></label>
        <label>Translated short description<input value={values.shortDescription ?? ""} placeholder={inherited.shortDescription}
          onChange={event => edit({ shortDescription: event.target.value })} maxLength={240} /></label>
        <label>Translated description<textarea rows={5} value={values.description}
          onChange={event => edit({ description: event.target.value })} maxLength={4000} required /></label>
      </fieldset>
      {!archived && <div className="taxonomy-actions">
        <button type="submit" className="button button--primary" disabled={operation.pending || !draft}>
          {operation.pending ? "Saving translation…" : "Save translation"}
        </button>
        {stored && <button type="button" className="button button--outline" disabled={operation.pending} onClick={() => void save(true)}>Remove translation</button>}
        {draft && <button type="button" className="button button--outline" disabled={operation.pending} onClick={discard}>Discard translation changes</button>}
      </div>}
      <TaxonomyFeedback {...operation} />
    </form>
  </section>;
}
