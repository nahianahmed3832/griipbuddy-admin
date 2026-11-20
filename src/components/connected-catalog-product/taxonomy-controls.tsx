"use client";

import { useRouter } from "next/navigation";
import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ComponentPropsWithoutRef, type FormEvent, type ReactNode,
} from "react";
import { catalogBeforeRegionChange, catalogRequest } from "@/lib/connected-catalog-client";
import { catalogRegion } from "./routes";

type DirtyRegistry = {
  update: (id: string, dirty: boolean) => void;
  confirm: () => boolean;
};

const DirtyChanges = createContext<DirtyRegistry | null>(null);

export function TaxonomyPendingChanges({ children }: { children: ReactNode }) {
  const unsaved = useRef(new Set<string>());
  const update = useCallback((id: string, dirty: boolean) => {
    if (dirty) unsaved.current.add(id);
    else unsaved.current.delete(id);
  }, []);
  const confirm = useCallback(() => !unsaved.current.size || window.confirm("Discard your unsaved catalog changes?"), []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (unsaved.current.size) event.preventDefault();
    };
    const beforeRegionChange = (event: Event) => {
      if (!confirm()) event.preventDefault();
      else unsaved.current.clear();
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin || link.getAttribute("href")?.startsWith("#")) return;
      if (target.pathname + target.search === window.location.pathname + window.location.search) return;
      if (!confirm()) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        unsaved.current.clear();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener(catalogBeforeRegionChange, beforeRegionChange);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener(catalogBeforeRegionChange, beforeRegionChange);
      document.removeEventListener("click", navigate, true);
    };
  }, [confirm]);

  return <DirtyChanges.Provider value={{ update, confirm }}>{children}</DirtyChanges.Provider>;
}

export function useTaxonomyDirty() {
  const update = useContext(DirtyChanges)?.update;
  const id = useId();
  useEffect(() => () => update?.(id, false), [id, update]);
  return useCallback((dirty: boolean) => update?.(id, dirty), [id, update]);
}

export function useConfirmTaxonomyNavigation() {
  return useContext(DirtyChanges)?.confirm ?? (() => true);
}

export function runCatalogCommand<T = unknown>(action: string, input: object) {
  return catalogRequest<T>({ action, input: { ...input } }, catalogRegion());
}

export function useTaxonomyOperation() {
  const router = useRouter();
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(task: () => Promise<unknown>, success: string, options?: { refresh?: boolean }) {
    if (running.current) return false;
    running.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage(success);
      if (options?.refresh !== false) router.refresh();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "This catalog action could not be completed.");
      return false;
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  return { pending, message, error, run };
}

export function TaxonomyFeedback({ error, message }: { error?: string; message?: string }) {
  return <>
    {error && <p className="taxonomy-error" role="alert">{error}</p>}
    {message && <p className="taxonomy-success" role="status">{message}</p>}
  </>;
}

type FormProps = Omit<ComponentPropsWithoutRef<"form">, "onSubmit" | "action"> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | boolean | Promise<void | boolean>;
};

export function TaxonomyForm({ onSubmit, onChange, onInput, className, ...props }: FormProps) {
  const setDirty = useTaxonomyDirty();

  return <form {...props} className={`taxonomy-form commerce-form ${className ?? ""}`}
    onChange={event => { setDirty(true); onChange?.(event); }} onInput={event => { setDirty(true); onInput?.(event); }}
    onSubmit={async event => {
      event.preventDefault();
      if (await onSubmit(event) === true) setDirty(false);
    }} />;
}
