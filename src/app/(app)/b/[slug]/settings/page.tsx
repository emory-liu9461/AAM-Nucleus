import { setBusinessArchived, updateBusiness } from "@/app/actions";
import { BusinessFields } from "@/components/BusinessForm";
import { ActionForm } from "@/components/ActionForm";
import { requireBusinessPage } from "@/lib/session";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b } = await requireBusinessPage(slug, "manage_business");
  return (
    <div className="space-y-6">
      <ActionForm action={updateBusiness.bind(null, b.slug)} submit="Save changes" className="card grid max-w-2xl gap-3 sm:grid-cols-2">
        <p className="rounded-lg bg-bg p-3 text-xs text-muted sm:col-span-2">
          Name, phone, email, brand color and trade are used on this business&apos;s website too. Saved changes appear there within about a minute.
        </p>
        <BusinessFields business={b} />
      </ActionForm>
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
