import { Archive, Bell, BookOpen, Building2, ChartNoAxesCombined, CreditCard, Globe2, LayoutGrid, Megaphone, Package, ReceiptText,
  Settings2, ShoppingBag, SlidersHorizontal, Truck, UsersRound } from 'lucide-react';

const icons = {
  layout: LayoutGrid, orders: ShoppingBag, catalog: Package, inventory: Archive, customers: UsersRound, pos: ReceiptText,
  markets: Globe2, shipping: Truck, payments: CreditCard, reports: ChartNoAxesCombined, marketing: Megaphone,
  content: SlidersHorizontal, staff: Building2, settings: Settings2, library: BookOpen, notifications: Bell,
};
export function SectionIcon({ name, size = 17 }: { name: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] ?? LayoutGrid;
  return <Icon size={size} strokeWidth={1.8} aria-hidden />;
}
