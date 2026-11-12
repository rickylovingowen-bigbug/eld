import Link from "next/link";
import { dictionaries } from "@/i18n/dictionaries";
import { loadHome } from "@/lib/home/load";

export default async function ReviewPage() {
  const home = await loadHome();
  const t = dictionaries[home.locale];
  return (
    <main className="shell placeholder">
      <Link className="text-btn" href="/">{t.backHome}</Link>
      <h1>{t.reviewPlaceholder}</h1>
    </main>
  );
}
