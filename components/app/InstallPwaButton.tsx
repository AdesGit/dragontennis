"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari n'implemente pas display-mode: standalone.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Lien d'installation de l'application en PWA, affiche a cote de la FAQ.
 *
 * Chrome et Edge fournissent `beforeinstallprompt` : on declenche l'invite
 * native. iOS ne le fournit pas : on explique le geste « Partager > Sur l'ecran
 * d'accueil ». Une fois l'application installee, le lien disparait.
 */
export function InstallPwaButton({ variant }: { variant: "navbar" | "tab" }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);
  const [iosFallback, setIosFallback] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIosFallback(isIos());

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setPrompt(null);
      setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sans service worker, l'invite natif n'est pas propose : le geste iOS
        // reste utilisable, rien d'autre a faire.
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setPrompt(null);
      return;
    }
    setShowIosHelp((value) => !value);
  }, [prompt]);

  // Rien a proposer : deja installee, ou navigateur sans invite et sans geste iOS.
  if (installed || (!prompt && !iosFallback)) return null;

  const icon = (
    <Image
      src="/asdragon-logo.png"
      alt=""
      width={32}
      height={32}
      className="h-5 w-5 object-contain"
    />
  );

  const iosHelp = (
    <>
      Dans Safari : bouton <strong>Partager</strong>, puis{" "}
      <strong>Sur l&apos;ecran d&apos;accueil</strong>.
    </>
  );

  if (variant === "tab") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label="Installer l'application"
        className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
      >
        {icon}
        Installer
        {showIosHelp && (
          <span className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-md border bg-background p-2 text-left text-xs leading-snug shadow-lg">
            {iosHelp}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
          "text-muted-foreground hover:bg-muted",
        )}
      >
        {icon}
        Installer l&apos;application
      </button>
      {showIosHelp && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-md border bg-background p-3 text-xs leading-snug shadow-lg">
          {iosHelp}
        </div>
      )}
    </div>
  );
}
