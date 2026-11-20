'use client';

import { useState } from 'react';
import { Download, Search, SlidersHorizontal } from 'lucide-react';
import type { CatalogFilters, CategoryOption, Choice } from '@/lib/catalog-list';
import type { Region } from '@/lib/sections';
import { downloadCsv } from '@/lib/csv';

const levels = [
  { key: 'category', label: 'Category', empty: 'All categories' },
  { key: 'subcategory', label: 'Subcategory', empty: 'All subcategories' },
  { key: 'subSubcategory', label: 'Category level 3', empty: 'Any level 3 category' },
  { key: 'thirdSubcategory', label: 'Category level 4', empty: 'Any level 4 category' },
];

export function CatalogFiltersForm({ action, region, filters, tree, locations, sorts, showStock, showLocations }: {
  action: string; region: Region; filters: CatalogFilters; tree: CategoryOption[]; locations: Choice[];
  sorts: Record<string, string>; showStock: boolean; showLocations: boolean;
}) {
  const [selected, setSelected] = useState(filters.category);
  const [searchBy, setSearchBy] = useState(filters.searchBy);
  let options = tree;
  const categories = levels.map(({ key, label, empty }, index) => {
    const items = options;
    const value = selected[index] ?? '';
    const found = items.find(option => option.id === value);
    options = found?.children ?? [];
    if (index > 0 && !items.length && !value) return null;
    return <label className="filter-label" key={key}>{label}<select aria-label={label} name={key} value={value}
      onChange={event => setSelected([...selected.slice(0, index), event.target.value])}>
      <option value="">{empty}</option>
      {value && !found && <option value={value}>Selected category (unavailable)</option>}
      {items.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select></label>;
  });
  return <form action={action} className="catalog-form">
    <input type="hidden" name="region" value={region}/>
    <input type="hidden" name="filter" value={filters.filter}/>
    <input type="hidden" name="size" value={filters.size}/>
    <div className="catalog-primary-filters">
      <label className="filter-label">Search by<select aria-label="Search by" name="searchBy" value={searchBy} onChange={event => setSearchBy(event.target.value === 'sku' ? 'sku' : 'text')}>
        <option value="text">Name / details</option><option value="sku">Product SKU</option>
      </select></label>
      <div className="catalog-search filter-label"><label htmlFor="catalog-search">Search records</label>
        <div className="search-input"><Search size={16} aria-hidden="true"/>
          <input id="catalog-search" name="q" defaultValue={filters.q} maxLength={80} placeholder={searchBy === 'sku' ? 'Enter product SKU' : 'Search product names'}/>
        </div>
      </div>
      {categories[0]}
      <label className="filter-label">Sort by<select aria-label="Sort by" name="sort" defaultValue={filters.sort}>
        {Object.entries(sorts).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select></label>
      <button className="button primary" type="submit">Apply filters</button>
    </div>
    {categories.slice(1).some(Boolean) && <div className="catalog-category-filters">{categories.slice(1)}</div>}
    {(showStock || showLocations) && <details className="catalog-more" open={Boolean(filters.stock || filters.location) || undefined}>
      <summary><SlidersHorizontal size={15} aria-hidden="true"/> Inventory filters</summary>
      <div className="catalog-category-filters">
        {showStock && <label className="filter-label">Stock across all locations<select aria-label="Stock across all locations" name="stock" defaultValue={filters.stock}>
          <option value="">Any availability</option><option value="in">In stock</option><option value="out">No available stock</option>
        </select></label>}
        {showLocations && <label className="filter-label">Stock recorded at<select aria-label="Stock recorded at" name="location" defaultValue={filters.location}>
          <option value="">Any location</option>
          {filters.location && !locations.some(location => location.value === filters.location) && <option value={filters.location}>Selected location (unavailable)</option>}
          {locations.map(location => <option key={location.value} value={location.value}>{location.label}</option>)}
        </select></label>}
      </div>
    </details>}
  </form>;
}

export function CatalogExport({ header, rows }: { header: string[]; rows: string[][] }) {
  return <button type="button" className="button secondary" onClick={() => downloadCsv('products-page.csv', [header, ...rows])}>
    <Download size={15} aria-hidden="true"/> Export page
  </button>;
}
