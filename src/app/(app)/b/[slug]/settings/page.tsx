import { setBusinessArchived, updateBusiness } from "@/app/actions";
import { BusinessForm } from "@/components/BusinessForm";
import { getBusiness } from "@/lib/business";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBusiness(slug);
  return (
    <div className="space-y-6">
      <BusinessForm action={updateBusiness.bind(null, b.slug)} business={b} submit="Save changes" />
      <div className="card max-w-2xl">
        <div className="card-title">{b.archived ? "Restore business" : "Archive business"}</div>
        <p className="mb-3 text-sm text-muted">
          {b.archived
            ? "Bring this business back into the sidebar and combined dashboard."
            : "Hides this business from the sidebar and combined totals. Its data is kept."}
        </p>
        <form action={setBusinessArchived.bind(null, b.slug, !b.archived)}>
          <button className="btn-ghost">{b.archived ? "Restore" : "Archive"}</button>
        </form>
      </div>
    </div>
  );
}
