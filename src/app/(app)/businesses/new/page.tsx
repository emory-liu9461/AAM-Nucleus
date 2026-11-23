import { createBusiness } from "@/app/actions";
import { BusinessForm } from "@/components/BusinessForm";
import { redirect } from "next/navigation";
import { can, homeFor, requireSession } from "@/lib/session";

export default async function NewBusinessPage() {
  const session = await requireSession();
  if (!can(session.user, "manage_business")) redirect(homeFor(session));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Add a business</h1>
        <p className="text-sm text-muted">It gets its own CRM, jobs, invoices and schedule, and its numbers roll up into the combined dashboard.</p>
      </div>
      <BusinessForm action={createBusiness} submit="Create business" />
    </div>
  );
}
