import Link from 'next/link';
import { ApiError, url, type Session } from '@/lib/api';
import { connectedCatalog, mayEditConnectedHomepage } from '@/lib/connected-catalog';
import { param, type Query } from '@/lib/data';
import { homepageAdminPath, homepageDeskPath, type HomepageEditorData, type HomepageScope } from '@/lib/homepage-merchandising';
import type { Region } from '@/lib/sections';
import { TaxonomyPendingChanges } from './connected-catalog-product/taxonomy-controls';
import { ConnectedHomepageEditor, HomepageScopeForm } from './connected-homepage-editor';
import { PageHeading } from './dashboard';
import './connected-catalog-product/catalog-layout.css';
import './connected-homepage.css';

export async function ConnectedHomepage({ auth, region, q, production }: { auth: Session; region: Region; q: Query; production: boolean }) {
  const { scopes } = await connectedCatalog<{ scopes: HomepageScope[] }>(auth, region, { read: 'homepage-scopes' });
  const requested = param(q, 'scope');
  const scope = requested ? scopes.find(row => row.key === requested) : scopes[0];
  if (requested && !scope) throw new ApiError(403, 'This homepage scope is unavailable.');
  if (!scope) throw new ApiError(403, 'No homepage markets are available to your account.');
  const path = production ? homepageAdminPath : homepageDeskPath;
  const data = await connectedCatalog<HomepageEditorData>(auth, region, { read: 'homepage', homepageScope: scope.key });
  return <TaxonomyPendingChanges><div className="taxonomy-workspace homepage-workspace">
    <PageHeading eyebrow="STOREFRONT / CONTENT" title="Homepage merchandising"
      description="Arrange the shopping sections shown below the storefront header and hero.">
      {region === 'BD' && <Link className="button secondary" href={url(production ? '/dashboard/hero-section' : '/desk/content/hero', { region })}>Hero settings</Link>}
    </PageHeading>
    <section className="taxonomy-card" aria-label="Homepage template scope">
      <HomepageScopeForm path={path} scopes={scopes} scope={scope} region={region} />
      <p className="taxonomy-muted">Overrides apply in order from the global template to the global language, market, and market language.</p>
      <p className="taxonomy-muted">{scope.key.startsWith('global:') ? 'Schedules use the same local clock time in each market.'
        : `Schedules use ${scope.previews[0]?.timeZone ?? 'the market’s local clock'}.`}</p>
    </section>
    <ConnectedHomepageEditor key={`${region}:${scope.key}`} scope={scope} data={data}
      region={region} writable={mayEditConnectedHomepage(auth)} />
  </div></TaxonomyPendingChanges>;
}
