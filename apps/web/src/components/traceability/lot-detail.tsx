'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, QrCode, Send } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { TraceabilityShell } from './traceability-shell';
interface Lot {
  id: string;
  lotNumber: string;
  status: string;
  commodityForm: string;
  quantity: string;
  unit: string;
  inspections: Array<{
    id: string;
    status: string;
    measurements: Array<{ name: string; value: string; unit: string | null }>;
  }>;
  custodyTransfers: Array<{
    id: string;
    transferNumber: string;
    status: string;
    fromOrganization: string;
    toOrganization: string;
  }>;
  publication: { publicId: string; status: string } | null;
}
interface Definition {
  id: string;
  name: string;
  dataType: 'DECIMAL' | 'INTEGER' | 'TEXT' | 'ENUM' | 'BOOLEAN';
}
export function LotDetail({ organizationId, lotId }: { organizationId: string; lotId: string }) {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [inspectionStatus, setInspectionStatus] = useState<'PASSED' | 'FAILED'>('PASSED');
  const [definitionId, setDefinitionId] = useState('');
  const [qualityValue, setQualityValue] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [transferNumber, setTransferNumber] = useState('');
  const [district, setDistrict] = useState('');
  const [season, setSeason] = useState('');
  const [summary, setSummary] = useState('');
  const [qr, setQr] = useState('');
  const lot = useQuery({
    queryKey: ['lot', organizationId, lotId],
    queryFn: () => apiRequest<Lot>(`/organizations/${organizationId}/lots/${lotId}`),
  });
  const definitions = useQuery({
    queryKey: ['quality-config', organizationId],
    queryFn: () =>
      apiRequest<{ effectiveDefinitions: Definition[] }>(
        `/organizations/${organizationId}/coffee-configuration`,
      ),
  });
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('/organizations?pageSize=100'),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['lot', organizationId, lotId] });
  };
  useEffect(() => {
    if (!lot.data?.publication) return;
    const url = `${window.location.origin}/trace/${lot.data.publication.publicId}`;
    void QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQr);
  }, [lot.data?.publication]);
  const action = async (path: string, body?: unknown) => {
    try {
      await apiRequest(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
      setMessage('Saved.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save.');
    }
  };
  const selectedDefinition = definitions.data?.effectiveDefinitions.find(
    (item) => item.id === definitionId,
  );
  return (
    <TraceabilityShell organizationId={organizationId} active="Cooperative lots">
      {lot.data && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                className="text-sm font-bold text-emerald-800 underline"
                href={`/organizations/${organizationId}/traceability/lots`}
              >
                Cooperative lots
              </Link>
              <h2 className="mt-2 text-3xl font-bold">{lot.data.lotNumber}</h2>
              <p className="mt-1 text-stone-600">
                {lot.data.commodityForm} · {lot.data.quantity} kg
              </p>
            </div>
            <Badge>{lot.data.status}</Badge>
          </div>
          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <h3 className="font-bold">Quality inspection</h3>
              </CardHeader>
              <CardContent className="grid gap-3">
                {lot.data.inspections.map((inspection) => (
                  <div key={inspection.id} className="border-b border-stone-200 pb-3">
                    <Badge>{inspection.status}</Badge>
                    {inspection.measurements.map((value) => (
                      <p key={value.name} className="mt-2 text-sm">
                        {value.name}:{' '}
                        <strong>
                          {value.value} {value.unit}
                        </strong>
                      </p>
                    ))}
                  </div>
                ))}
                <Label>
                  Result
                  <Select
                    value={inspectionStatus}
                    onChange={(event) =>
                      setInspectionStatus(event.target.value as typeof inspectionStatus)
                    }
                  >
                    <option>PASSED</option>
                    <option>FAILED</option>
                  </Select>
                </Label>
                <Label>
                  Attribute
                  <Select
                    value={definitionId}
                    onChange={(event) => setDefinitionId(event.target.value)}
                  >
                    <option value="">Select attribute</option>
                    {definitions.data?.effectiveDefinitions.map((definition) => (
                      <option key={definition.id} value={definition.id}>
                        {definition.name}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  Value
                  <Input
                    value={qualityValue}
                    onChange={(event) => setQualityValue(event.target.value)}
                  />
                </Label>
                <Button
                  disabled={!selectedDefinition || !qualityValue}
                  onClick={() =>
                    void action(`/organizations/${organizationId}/lots/${lotId}/inspections`, {
                      status: inspectionStatus,
                      inspectedAt: new Date().toISOString(),
                      measurements: [
                        {
                          qualityAttributeDefinitionId: definitionId,
                          dataType: selectedDefinition!.dataType,
                          value:
                            selectedDefinition!.dataType === 'INTEGER'
                              ? Number(qualityValue)
                              : selectedDefinition!.dataType === 'BOOLEAN'
                                ? qualityValue === 'true'
                                : qualityValue,
                        },
                      ],
                    })
                  }
                >
                  <CheckCircle2 size={17} /> Record inspection
                </Button>
                {lot.data.status === 'READY' && (
                  <Button
                    className="bg-stone-800"
                    onClick={() =>
                      void action(`/organizations/${organizationId}/lots/${lotId}/approve`)
                    }
                  >
                    Approve lot
                  </Button>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="font-bold">Custody</h3>
              </CardHeader>
              <CardContent className="grid gap-3">
                {lot.data.custodyTransfers.map((transfer) => (
                  <div
                    key={transfer.id}
                    className="flex items-center justify-between border-b border-stone-200 pb-3 text-sm"
                  >
                    <span>
                      {transfer.transferNumber} · {transfer.toOrganization}
                    </span>
                    <Badge>{transfer.status}</Badge>
                  </div>
                ))}
                <Label>
                  Transfer number
                  <Input
                    value={transferNumber}
                    onChange={(event) => setTransferNumber(event.target.value)}
                  />
                </Label>
                <Label>
                  Recipient organization
                  <Select
                    value={recipientId}
                    onChange={(event) => setRecipientId(event.target.value)}
                  >
                    <option value="">Select organization</option>
                    {organizations.data
                      ?.filter((item) => item.id !== organizationId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </Select>
                </Label>
                <Button
                  disabled={lot.data.status !== 'APPROVED' || !transferNumber || !recipientId}
                  onClick={() =>
                    void action(
                      `/organizations/${organizationId}/lots/${lotId}/custody-transfers`,
                      {
                        transferNumber,
                        toOrganizationId: recipientId,
                        quantity: lot.data.quantity,
                        unit: 'KG',
                      },
                    )
                  }
                >
                  <Send size={17} /> Create transfer
                </Button>
                {lot.data.custodyTransfers
                  .filter((transfer) => transfer.status === 'DRAFT')
                  .map((transfer) => (
                    <Button
                      key={transfer.id}
                      className="bg-sky-700"
                      onClick={() =>
                        void action(
                          `/organizations/${organizationId}/custody-transfers/${transfer.id}/dispatch`,
                        )
                      }
                    >
                      Dispatch {transfer.transferNumber}
                    </Button>
                  ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="font-bold">Public traceability</h3>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Label>
                  Origin district
                  <Input value={district} onChange={(event) => setDistrict(event.target.value)} />
                </Label>
                <Label>
                  Harvest season
                  <Input value={season} onChange={(event) => setSeason(event.target.value)} />
                </Label>
                <Label>
                  Processing summary
                  <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
                </Label>
                <Button
                  disabled={lot.data.status !== 'APPROVED' || !district || !season || !summary}
                  onClick={() =>
                    void action(`/organizations/${organizationId}/lots/${lotId}/publish`, {
                      originDistrict: district,
                      harvestSeason: season,
                      processingSummary: summary,
                    })
                  }
                >
                  <QrCode size={17} /> Publish QR record
                </Button>
                {lot.data.publication && (
                  <div className="flex items-center gap-4 border-t border-stone-200 pt-4">
                    {qr && (
                      <Image
                        src={qr}
                        width={128}
                        height={128}
                        alt={`QR code for ${lot.data.lotNumber}`}
                        unoptimized
                      />
                    )}
                    <a
                      className="inline-flex items-center gap-2 font-bold text-emerald-800 underline"
                      href={`/trace/${lot.data.publication.publicId}`}
                      target="_blank"
                    >
                      Open public record <ExternalLink size={16} />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h3 className="font-bold">Lineage</h3>
              </CardHeader>
              <CardContent>
                <a
                  className="font-bold text-emerald-800 underline"
                  href={`${process.env.NEXT_PUBLIC_API_BASE_URL}/organizations/${organizationId}/lots/${lotId}/lineage`}
                >
                  Authorized lineage record
                </a>
              </CardContent>
            </Card>
          </div>
          {message && (
            <p className="mt-5" role="status">
              {message}
            </p>
          )}
        </>
      )}
    </TraceabilityShell>
  );
}
