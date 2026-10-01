import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../i18n";
import { useToast } from "../ui/shell";

type PixelPayload = {
  kind?: string;
};

/** Surface pixel-condition stop/pause as toasts (journal still gets engine://log). */
export function usePixelFeedbackToasts() {
  const t = useT();
  const toast = useToast();

  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<PixelPayload>("engine://pixel", (e) => {
      const kind = e.payload?.kind;
      switch (kind) {
        case "stop":
          toast.error(t("clicker.toasts.pixelStop"));
          break;
        case "pause":
          toast.info(t("clicker.toasts.pixelPause"));
          break;
        default:
          break;
      }
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [t, toast]);
}
