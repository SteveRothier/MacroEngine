import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useT } from "../i18n";
import { useToast } from "../ui/shell";

type ZonePayload = {
  action?: string;
  kind?: string;
};

/** Surface stop/pause/start zone hits as toasts (journal still gets engine://log). */
export function useZoneFeedbackToasts() {
  const t = useT();
  const toast = useToast();

  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<ZonePayload>("engine://zone", (e) => {
      const kind = e.payload?.kind;
      switch (kind) {
        case "stopHit":
          toast.error(t("clicker.toasts.zoneStop"));
          break;
        case "pauseEnter":
          toast.info(t("clicker.toasts.zonePause"));
          break;
        case "startResume":
          toast.info(t("clicker.toasts.zoneResume"));
          break;
        case "startLaunch":
          toast.success(t("clicker.toasts.zoneLaunch"));
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
