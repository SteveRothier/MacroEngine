export type AppRoute =
  | { name: "automations" }
  | { name: "automation"; id: string; kind: "macro" | "clicker" }
  | { name: "runs" }
  | { name: "settings"; section?: SettingsSection };

export type SettingsSection =
  | "general"
  | "appearance"
  | "hotkeys"
  | "process"
  | "displays"
  | "maintenance";

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
