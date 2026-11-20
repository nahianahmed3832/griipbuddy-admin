import Image from 'next/image';
import Link from 'next/link';
import { Award, BarChart3, CalendarDays, ChevronLeft, FileText, Globe, Layers, Package,
  Pencil, Shield, ShoppingCart, Star, Tag, TrendingUp, Truck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { arr, obj, str, type RecordData } from '@/lib/api';
import { adminPath } from '@/lib/paths';
import { cmsMediaKey, productionCmsPreview } from '@/lib/production-cms-media';
import { ProductRichText } from './production-product-editor-fields';
import { WorkspaceEmpty, WorkspaceHeading, WorkspaceStatus } from './workspace-screen';
import styles from './production-product-detail.module.css';

const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const word = (value: unknown) => str(value) || '–';
const amount = (value: unknown) => numeric(value)?.toLocaleString('en', { maximumFractionDigits: 2 }) ?? '—';
const date = (value: unknown) => {
  const time = new Date(str(value));
  return Number.isNaN(time.getTime()) ? '—' : time.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

function imageAddress(source: unknown) {
  if (typeof source !== 'string') return '';
  const preview = productionCmsPreview(source);
  const prefix = adminPath('/api/media/catalog/');
  if (preview.startsWith(prefix) && cmsMediaKey(preview.slice(prefix.length))) return preview;
  try {
    const address = new URL(source);
    return address.protocol === 'https:' && address.origin === process.env.GRIIP_ADMIN_IMAGE_ORIGIN
      && !address.username && !address.password ? address.href : '';
  } catch {
    return '';
  }
}

type Tone = 'blue' | 'emerald' | 'amber' | 'purple' | 'slate' | 'indigo' | 'pink';
function Metric({ title, value, icon: Icon, color }: { title: string; value: ReactNode; icon: LucideIcon; color: Tone }) {
  return <div className={styles.metric}><div><p>{title}</p><strong>{value}</strong></div>
    <span className={styles.tone} data-color={color}><Icon size={24} aria-hidden="true"/></span></div>;
}

function Panel({ title, icon: Icon, color, children }: { title: string; icon: LucideIcon; color: Tone; children: ReactNode }) {
  return <section className={styles.panel}>
    <h2 className={styles.tone} data-color={color}><Icon size={20} aria-hidden="true"/>{title}</h2>
    <div className={styles.panelBody}>{children}</div>
  </section>;
}

function SummaryRows({ rows }: { rows: [string, ReactNode, LucideIcon][] }) {
  return <dl className={styles.summaryRows}>{rows.map(([label, value, Icon]) => <div key={label}>
    <dt><Icon size={16} aria-hidden="true"/>{label}</dt><dd>{value}</dd>
  </div>)}</dl>;
}

function DetailRows({ rows }: { rows: [string, ReactNode, LucideIcon, string][] }) {
  return <dl className={styles.detailRows}>{rows.map(([label, value, Icon, color]) => <div key={label}>
    <dt><Icon aria-hidden="true" size={20} data-color={color}/>{label}:</dt><dd>{value}</dd>
  </div>)}</dl>;
}

function PolicyTile({ label, value, icon: Icon, color }: { label: string; value: string; icon: LucideIcon; color: Tone }) {
  return <div className={styles.policyTile} data-color={color}>
    <Icon size={32} aria-hidden="true"/><div><strong>{label}</strong><p>{value}</p></div>
  </div>;
}

export function ProductionProductDetail({ record, listHref, editHref, canSeeStock, market }: {
  record: RecordData; listHref: string; editHref?: string; canSeeStock: boolean; market: string;
}) {
  const name = str(record.name) || 'Product';
  const published = record.is_published === true;
  const thumbnail = imageAddress(record.thumbnail);
  const gallery = arr(record.slider_images).map(imageAddress).filter(Boolean);
  const sold = numeric(record.total_sold);
  const inventory = canSeeStock ? arr(record.inventories).map(obj).flatMap(item => arr(item.variants).map(obj)) : [];
  const availableUnits = inventory.map(item => numeric(item.available_quantity)).filter(value => value !== null);
  const stock = availableUnits.length ? availableUnits.reduce((sum, value) => sum + value, 0) : null;
  const ratings = obj(record.ratings);
  const rating = numeric(ratings.average);
  const ratingDisplay = rating?.toFixed(1) ?? '—';
  const reviewCount = numeric(ratings.total);
  const category = obj(record.category);
  const subcategory = obj(record.subcategory);
  const channels = obj(record.sale_channels);
  const offers = arr(record.offer_tags).map(str).filter(Boolean);
  const description = str(record.description).trim();
  return <section className={styles.page}>
    <WorkspaceHeading title={name} detail={`${market} catalog`}>
      <WorkspaceStatus tone={published ? 'success' : 'neutral'}>{published ? 'Published' : 'Unpublished'}</WorkspaceStatus>
      <Link href={listHref} className={styles.back}><ChevronLeft aria-hidden="true" size={16}/>Back to Products</Link>
      {editHref && <Link href={editHref} className={styles.action}><Pencil size={16} aria-hidden="true"/> Edit</Link>}
    </WorkspaceHeading>
    <div className={styles.content}>
      <div className={styles.metrics}>
        <Metric title="Total Sold" value={sold ?? '—'} icon={TrendingUp} color="blue"/>
        {canSeeStock && <Metric title="Available units" value={stock ?? '—'} icon={Package} color="emerald"/>}
        <Metric title="Average Rating" value={ratingDisplay} icon={Star} color="amber"/>
        <Metric title="Total Reviews" value={reviewCount ?? '—'} icon={BarChart3} color="purple"/>
      </div>
      <div className={styles.detailGrid}>
        <div className={styles.images}>
          <section className={styles.panel}><h2><Award size={20}/>Product Thumbnail</h2>
            {thumbnail ? <div className={styles.imageBlock}>
              <Image unoptimized src={thumbnail} height={350} width={350} alt={name}/>
            </div> : <WorkspaceEmpty title="No thumbnail available"/>}
          </section>
          {gallery.length > 0 && <section className={styles.panel}><h2><Award size={20}/>Product Images</h2>
            <div className={styles.gallery}>{gallery.map((source, index) => <Image key={source + index} unoptimized
              src={source} width={150} height={150} alt={name + ' ' + (index + 1)}/>)}</div>
          </section>}
        </div>
        <div className={styles.detailBody}>
          <Panel title="Basic Information" icon={FileText} color="blue">
            <div className={styles.twoColumns}>
              <DetailRows rows={[
                ['SKU', word(record.sku), Tag, 'blue'], ['Slug', word(record.slug), Globe, 'emerald'],
                ['Product Type', word(record.product_type), ShoppingCart, 'amber'],
                ['Category', word(category.name ?? category.name_en), Layers, 'purple'],
              ]}/>
              <DetailRows rows={[
                ['Subcategory', word(subcategory.name ?? subcategory.name_en), Layers, 'purple'],
                ['Min Order Qty', numeric(record.min_order_qty) ?? '–', Package, 'amber'],
                ['Max Order Qty', numeric(record.max_order_qty) ?? '–', Package, 'amber'],
                ['Created Date', date(record.createdAt), CalendarDays, 'red'],
                ['Last Updated', date(record.updatedAt), CalendarDays, 'red'],
              ]}/>
            </div>
          </Panel>
          <div className={styles.twoColumns}>
            {canSeeStock && <Panel title="Inventory Overview" icon={Package} color="emerald">
              <SummaryRows rows={[
                ['Available units', stock ?? '—', Package], ['Total Sold', sold ?? '—', TrendingUp],
                ['Stock Status', stock === null ? 'Unavailable' : stock > 0 ? 'In Stock' : 'Out of Stock', Package],
              ]}/>
            </Panel>}
            <Panel title="Pricing & Costs" icon={Tag} color="amber">
              <SummaryRows rows={[
                ['Coin per Order', numeric(record.coin_per_order) ?? '—', Award],
                ['Shipping Cost', amount(record.shipping_cost), Truck],
                ['Shipping per Unit', amount(record.shipping_cost_per_unit), Truck],
                ['Free Delivery', record.is_free_delivery === true ? 'Yes' : record.is_free_delivery === false ? 'No' : '—', Truck],
              ]}/>
              {(numeric(record.shipping_cost) !== null || numeric(record.shipping_cost_per_unit) !== null) &&
                <p className={styles.currencyNote}>Currency is unavailable for the stored shipping costs.</p>}
            </Panel>
          </div>
          <Panel title="Shipping & Policies" icon={Shield} color="purple">
            <div className={styles.twoColumns}>
              <div className={styles.policyGroup}>
                <PolicyTile label="Delivery Time" value={str(record.approximately_delivery_time) || 'Not specified'} icon={Truck} color="blue"/>
                <PolicyTile label="Free Delivery" value={record.is_free_delivery ? 'Available' : 'Not available'} icon={Tag} color="emerald"/>
              </div>
              <div className={styles.policyGroup}>
                <PolicyTile label="Warranty" value={str(record.warranty) || 'No warranty provided'} icon={Shield} color="amber"/>
                <PolicyTile label="Pre-order" value={record.is_pre_order ? 'Available' : 'Not available'} icon={CalendarDays} color="purple"/>
              </div>
            </div>
          </Panel>
          {description && <Panel title="Product Description" icon={FileText} color="slate"><ProductRichText className={styles.description} source={description}/></Panel>}
          <div className={styles.twoColumns}>
            {offers.length > 0 && <Panel title="Offer Tags" icon={Award} color="pink">
              <div className={styles.offers}>{offers.map(offer => <span key={offer}>{offer.replaceAll('_', ' ')}</span>)}</div>
            </Panel>}
            <Panel title="Sales Channels" icon={Globe} color="indigo">
              <div className={styles.channels}>
                {(['Website','POS'] as const).map(channel => <div key={channel} data-channel={channel}>
                  <span>{channel}</span><small>{channels[channel.toLowerCase()] === true ? 'Active' : 'Inactive'}</small>
                </div>)}
              </div>
            </Panel>
          </div>
          <Panel title="Ratings & Reviews" icon={Star} color="amber">
            <div className={styles.twoColumns}>
              <div className={styles.rating}>
                <div><strong>{ratingDisplay}</strong>
                  {rating !== null && <span aria-hidden="true">{Array.from({length: 5}, (_, index) =>
                    <Star key={index} size={16} data-filled={index < Math.round(rating)}/>)}</span>}
                </div><p>Average Rating</p>{reviewCount !== null && <small>{reviewCount} total reviews</small>}
              </div>
              <SummaryRows rows={[
                ['Total Ratings', reviewCount ?? '—', Star], ['Average Rating', ratingDisplay, Star],
              ]}/>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  </section>;
}
