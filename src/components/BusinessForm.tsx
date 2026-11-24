import type { Business } from "@/db/schema";

/** Business details fields, shared by "Add business" and the business Settings page. */
export function BusinessFields({ business }: { business?: Business }) {
  return (
    <>
      <label className="field sm:col-span-2">Business name<input className="input" name="name" required defaultValue={business?.name} /></label>
      <label className="field">Trade
        <input className="input" name="trade" list="trades" required defaultValue={business?.trade ?? ""} placeholder="Roofing, Remodeling, Painting…" />
        <datalist id="trades">{["Roofing", "Remodeling", "Painting", "Concrete", "General Contracting"].map((t) => <option key={t} value={t} />)}</datalist>
        <span className="font-normal">Sets the starting content for this business&apos;s website.</span>
      </label>
      <label className="field">Brand color<input className="input h-9 p-1" type="color" name="color" defaultValue={business?.color ?? "#16a34a"} /></label>
      <label className="field">Phone<input className="input" name="phone" defaultValue={business?.phone ?? ""} /></label>
      <label className="field">Email<input className="input" name="email" type="email" defaultValue={business?.email ?? ""} /></label>
      <label className="field sm:col-span-2">Other website (optional)
        <input className="input" name="website" defaultValue={business?.website ?? ""} placeholder="https://" />
        <span className="font-normal">Only for your records, e.g. an old site. Your Nucleus website&apos;s address is set under Website → Edit website content.</span>
      </label>
    </>
  );
}

export function BusinessForm({ action, business, submit }: { action: (f: FormData) => Promise<void>; business?: Business; submit: string }) {
  return (
    <form action={action} className="card grid max-w-2xl gap-3 sm:grid-cols-2">
      <BusinessFields business={business} />
      <div className="sm:col-span-2"><button className="btn">{submit}</button></div>
    </form>
  );
}
