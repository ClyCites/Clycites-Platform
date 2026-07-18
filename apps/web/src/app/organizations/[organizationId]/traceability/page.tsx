import { redirect } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  redirect(`/organizations/${organizationId}/traceability/batches`);
}
