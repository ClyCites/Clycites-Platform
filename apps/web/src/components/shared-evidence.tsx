'use client';
import { DataTable } from './ui/data-table';
import { recordText, recordValue, type RegisterRow } from './ui/record-register';
import { EmptyState } from '@clycites/ui';
const rows=(value:unknown):RegisterRow[]=>Array.isArray(value)?(value as unknown[]).flatMap((item,index)=>item&&typeof item==='object'?[{...item,id:String(index)}]:[]):[];
export function SharedEvidence({data}:{data:Record<string,unknown>}) {
  const record={...data,id:'evidence'};
  const quality=rows(data.quality).flatMap(inspection=>rows(recordValue(inspection,'measurements')).map((measurement,index)=>({...measurement,id:`${inspection.id}-${index}`,status:recordText(inspection,'status'),inspectedAt:recordText(inspection,'inspectedAt')})));
  const sections=[{name:'Quality checks',value:data.quality,rows:quality,fields:['code','value','unit','status','inspectedAt']},{name:'Custody handovers',value:data.custody,rows:rows(data.custody),fields:['transferNumber','quantity','status','dispatchedAt','receivedAt']},{name:'Source batches',value:data.lineage,rows:rows(data.lineage),fields:['batchNumber','batchPublicId','quantity']}];
  return <div className="space-y-7"><header className="border-b border-border pb-5"><p className="ledger-kicker">Buyer evidence access</p><h2 className="mt-2 font-display text-2xl font-semibold">Shared traceability</h2><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{recordText(record,'share.publicId')} · expires {recordText(record,'share.expiresAt')}</p></header>
    {Boolean(data.lot)&&<dl className="grid gap-4 border-b border-border pb-5 sm:grid-cols-3">{['lotNumber','commodity','form','quantity','unit','status'].map(field=><div key={field}><dt className="ledger-kicker">{field.replace(/([A-Z])/g,' $1')}</dt><dd className="mt-1 font-semibold">{recordText(record,`lot.${field}`)}</dd></div>)}</dl>}
    {sections.map(section=><section key={section.name} className="space-y-3"><h3 className="font-display text-lg font-semibold">{section.name}</h3>{section.value===null?<p className="text-sm text-muted-foreground">This share does not include access to {section.name.toLowerCase()}.</p>:section.rows.length?<DataTable caption={section.name} rows={section.rows} columns={section.fields.map(key=>({key,title:key.replace(/([A-Z])/g,' $1'),render:row=>recordText(row,key)}))} />:<EmptyState title="No evidence recorded" description={`No ${section.name.toLowerCase()} were returned for this share.`} />}</section>)}
    <section className="space-y-2"><h3 className="font-display text-lg font-semibold">Documents</h3><p className="text-sm text-muted-foreground">{data.documents===null?'Document access is outside this share’s scope.':'The API has not returned downloadable documents for this share.'}</p></section>
  </div>;
}
