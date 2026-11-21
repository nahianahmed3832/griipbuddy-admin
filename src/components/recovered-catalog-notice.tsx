import { editableAdminOrigin } from '@/lib/admin-origins';

const storefrontCatalog = 'https://dev.griipbuddy.com/admin/catalog';

export function RecoveredCatalogNotice({ owner }: { owner: boolean }) {
  const target = process.env.GRIIP_ADMIN_TARGET;
  const showOwnerTools = owner && (
    (target === 'integration' && process.env.GRIIP_ADMIN_PUBLIC_ORIGIN === editableAdminOrigin)
    || (target === 'fixture' && process.env.GRIIP_ADMIN_INTEGRATED === '1')
  );

  return <section className="panel padded" aria-label="Catalog authority">
    <p><strong>Recovered catalog</strong> · These records belong to the operations catalog. The development storefront uses its own catalog.</p>
    {showOwnerTools && <><p className="dim">The storefront links require a separate owner sign-in.</p>
    <nav aria-label="Storefront owner catalog" className="page-actions">
      <a className="button secondary" href={storefrontCatalog}>Storefront products</a>
      <a className="button secondary" href={storefrontCatalog + '/taxonomy'}>Storefront taxonomy</a>
      <a className="button secondary" href={storefrontCatalog + '/import'}>Storefront CSV import</a>
    </nav></>}
  </section>;
}
