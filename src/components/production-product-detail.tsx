import Image from 'next/image';
import Link from 'next/link';
import { Award, BarChart3, CalendarDays, ChevronLeft, Download, Eye, EyeOff, FileText, Globe, Layers, Package,
  Pencil, Share2, Shield, ShoppingCart, Star, Tag, TrendingUp, Truck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { arr, obj, str, type RecordData } from '@/lib/api';
import styles from './production-product-detail.module.css';

const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const word = (value: unknown) => str(value) || '–';
const amount = (value: unknown) => '$' + numeric(value);
const date = (value: unknown) => new Date(str(value)).toLocaleDateString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

function imageAddress(source: unknown) {
  if (typeof source !== 'string' || !process.env.GRIIP_ADMIN_IMAGE_ORIGIN) return '';
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

export function ProductionProductDetail({ record, listHref, editHref, canSeeStock }: {
  record: RecordData; listHref: string; editHref?: string; canSeeStock: boolean;
}) {
  const name = str(record.name) || 'Product';
  const published = record.is_published === true;
  const thumbnail = imageAddress(record.thumbnail);
  const gallery = arr(record.slider_images).map(imageAddress).filter(Boolean);
  const sold = numeric(record.total_sold);
  const stock = canSeeStock ? arr(record.inventories).map(obj).flatMap(item => arr(item.variants).map(obj))
    .reduce((sum, item) => sum + numeric(item.available_quantity), 0) : 0;
  const ratings = obj(record.ratings);
  const rating = numeric(ratings.average);
  const ratingDisplay = rating.toFixed(1);
  const reviewCount = numeric(ratings.total);
  const category = obj(record.category);
  const subcategory = obj(record.subcategory);
  const channels = obj(record.sale_channels);
  const offers = arr(record.offer_tags).map(str).filter(Boolean);
  const description = str(record.description).replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '').replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').trim();
  return <section className={styles.page}>
    <Link href={listHref} className={styles.back}><ChevronLeft aria-hidden="true" size={16}/>Back to Products</Link>
    <div className={styles.content}>
      <header className={styles.top}>
        <div><h1>{name}</h1><span className={styles.status} data-published={published}>{published ? <Eye size={16}/> : <EyeOff size={16}/>}
          {published ? 'Published' : 'Unpublished'}</span></div>
        <div>{editHref && <Link href={editHref} className={styles.action}><Pencil size={16}/> Edit</Link>}
          <button type="button" className={styles.action} aria-disabled="true"><Share2 size={16}/> Share</button>
          <button type="button" className={`${styles.action} ${styles.export}`} aria-disabled="true"><Download size={16}/> Export</button>
        </div>
      </header>
      <div className={styles.metrics}>
        <Metric title="Total Sold" value={sold} icon={TrendingUp} color="blue"/>
        {canSeeStock && <Metric title="Total Stock" value={stock} icon={Package} color="emerald"/>}
        <Metric title="Average Rating" value={ratingDisplay} icon={Star} color="amber"/>
        <Metric title="Total Reviews" value={reviewCount} icon={BarChart3} color="purple"/>
      </div>
      <div className={styles.detailGrid}>
        <div className={styles.images}>
          <section className={styles.panel}><h2><Award size={20}/>Product Thumbnail</h2>
            <div className={styles.imageBlock} data-empty={!thumbnail}>
              {thumbnail && <Image unoptimized src={thumbnail} height={350} width={350} alt={name}/>}
            </div>
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
                ['Product Type', str(record.product_type) || 'Standard', ShoppingCart, 'amber'],
                ['Category', word(category.name ?? category.name_en), Layers, 'purple'],
              ]}/>
              <DetailRows rows={[
                ['Subcategory', word(subcategory.name ?? subcategory.name_en), Layers, 'purple'],
                ['Min Order Qty', numeric(record.min_order_qty) || '–', Package, 'amber'],
                ['Max Order Qty', numeric(record.max_order_qty) || '–', Package, 'amber'],
                ['Created Date', date(record.createdAt), CalendarDays, 'red'],
                ['Last Updated', date(record.updatedAt), CalendarDays, 'red'],
              ]}/>
            </div>
          </Panel>
          <div className={styles.twoColumns}>
            {canSeeStock && <Panel title="Inventory Overview" icon={Package} color="emerald">
              <SummaryRows rows={[
                ['Total Stock', stock, Package], ['Total Sold', sold, TrendingUp],
                ['Available Stock', stock - sold, Package], ['Stock Status', stock ? 'In Stock' : 'Out of Stock', Package],
              ]}/>
            </Panel>}
            <Panel title="Pricing & Costs" icon={Tag} color="amber">
              <SummaryRows rows={[
                ['Coin per Order', numeric(record.coin_per_order), Award], ['Shipping Cost', amount(record.shipping_cost), Truck],
                ['Shipping per Unit', amount(record.shipping_cost_per_unit), Truck], ['Free Delivery', record.is_free_delivery ? 'Yes' : 'No', Truck],
              ]}/>
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
          {description && <Panel title="Product Description" icon={FileText} color="slate"><p className={styles.description}>{description}</p></Panel>}
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
                  <span>{Array.from({length: 5}, (_, index) => <Star key={index} size={16} data-filled={index < Math.round(rating)}/>)}</span>
                </div><p>Average Rating</p><small>{reviewCount} total reviews</small>
              </div>
              <SummaryRows rows={[
                ['Total Ratings', reviewCount, Star], ['Average Rating', ratingDisplay, Star], ['Rating Distribution', 'View Details', BarChart3],
              ]}/>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  </section>;
}
