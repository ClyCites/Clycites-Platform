import { PublicLot } from '@/components/traceability/public-lot';
export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <PublicLot publicId={publicId} />;
}
