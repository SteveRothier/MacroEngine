export type AppRoute =
  | { name: "automations" }
  | { name: "automation"; id: string; kind: "macro" | "clicker" | "script"; label?: string }
  | { name: "runs" }
  | { name: "settings"; section?: SettingsSection };

export type SettingsSection =
  | "application"
  | "hotkeys"
  | "security"
  | "data";

export type NavId = "automations" | "runs" | "settings";

export function navFromRoute(route: AppRoute): NavId {
  switch (route.name) {
    case "automations":
    case "automation":
      return "automations";
    case "runs":
      return "runs";
    case "settings":
      return "settings";
  }
}
