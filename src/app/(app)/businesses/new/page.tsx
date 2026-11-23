import { createBusiness } from "@/app/actions";
import { BusinessForm } from "@/components/BusinessForm";

export default function NewBusinessPage() {
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
