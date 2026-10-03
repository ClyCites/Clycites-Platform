import { PublicLot } from '@/components/traceability/public-lot';
export default async function VerificationPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  return <PublicLot {...await params} />;
}
