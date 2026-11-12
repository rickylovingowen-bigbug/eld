import Link from "next/link";
import { dictionaries } from "@/i18n/dictionaries";
import { loadHome } from "@/lib/home/load";

export default async function BookPage() {
  const home = await loadHome();
  const t = dictionaries[home.locale];
  return (
    <main className="shell placeholder">
      <Link className="text-btn" href="/">{t.backHome}</Link>
      <h1>{home.name}&apos;s story</h1>
      <p>{t.bookPlaceholder}</p>
    </main>
  );
}
