import { CollectionWorkspace } from '@/components/collection-workspace';

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <CollectionWorkspace organizationId={organizationId} />;
}
