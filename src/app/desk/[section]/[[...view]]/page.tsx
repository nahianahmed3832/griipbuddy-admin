import { DeskWorkspace, type DeskWorkspaceProps } from '@/components/desk-workspace';

export const dynamic = 'force-dynamic';

export default function DeskPage(props: DeskWorkspaceProps) {
  return <DeskWorkspace {...props}/>;
}
