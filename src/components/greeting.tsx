"use client";

import { useSyncExternalStore } from "react";
import { dictionaries, greetingPart, type Locale } from "@/i18n/dictionaries";

export function Greeting({
  locale,
  name,
  firstVisit,
}: {
  locale: Locale;
  name: string;
  firstVisit: boolean;
}) {
  const dictionary = dictionaries[locale];
  const title = useSyncExternalStore(
    () => () => {},
    () => (firstVisit ? dictionary.welcomeTitle(name) : dictionary.greet(greetingPart(new Date(), dictionary), name)),
    () =>
      firstVisit
        ? dictionary.welcomeTitle(name)
        : dictionary.greet(greetingPart(new Date(), dictionary), name),
  );
  return <h1 className="display">{title}</h1>;
}
