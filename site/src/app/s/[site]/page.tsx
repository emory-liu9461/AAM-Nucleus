import { HOME_LAYOUTS } from "@/components/HomeLayouts";
import { getSite } from "@/lib/site";

export const revalidate = 60;

/** The homepage layout follows the theme picked in Nucleus (Social → Website content → Theme). */
export default async function Home({ params }: { params: Promise<{ site: string }> }) {
  const s = await getSite((await params).site);
  const Layout = HOME_LAYOUTS[s.content.theme ?? "classic"] ?? HOME_LAYOUTS.classic;
  return <Layout site={s} />;
}
