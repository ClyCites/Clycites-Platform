import { CoffeeConfigurationView } from '@/components/configuration-operations';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <CoffeeConfigurationView organizationId={organizationId} />;
}
