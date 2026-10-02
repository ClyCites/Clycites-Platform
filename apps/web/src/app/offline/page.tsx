export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5 py-16">
      <section className="border-l-4 border-amber-400 pl-6">
        <p className="text-sm font-semibold uppercase text-primary">Offline</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">The network is unavailable</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Open the collection workspace from this device to continue with its downloaded farmer
          data. Queued deliveries will remain on this device until synchronization succeeds.
        </p>
      </section>
    </div>
  );
}
