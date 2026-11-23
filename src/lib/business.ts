import { requireBusiness } from "./session";

/** Load a business the signed-in user is allowed to see (404 otherwise). */
export async function getBusiness(slug: string) {
  return (await requireBusiness(slug)).business;
}
