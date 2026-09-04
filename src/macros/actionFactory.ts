import type { AddMenuEntry } from "../ui";
import { newActionId, type MacroAction } from "./types";

export function makeAction(kind: MacroAction["type"]): MacroAction {
  const id = newActionId();
  switch (kind) {
    case "mouse.click":
      return { id, type: "mouse.click", button: "left" };
    case "mouse.move":
      return { id, type: "mouse.move", x: 0, y: 0 };
    case "mouse.down":
      return { id, type: "mouse.down", button: "left" };
    case "mouse.up":
      return { id, type: "mouse.up", button: "left" };
    case "mouse.wheel":
      return { id, type: "mouse.wheel", delta: -120 };
    case "delay":
      return { id, type: "delay", ms: 100 };
    case "http.request":
      return {
        id,
        type: "http.request",
        method: "GET",
        url: "https://example.com",
        timeoutMs: 5000,
        headers: [],
      };
    case "key.tap":
      return { id, type: "key.tap", key: "A" };
    case "key.down":
      return { id, type: "key.down", key: "A" };
    case "key.up":
      return { id, type: "key.up", key: "A" };
    case "clipboard.set":
      return { id, type: "clipboard.set", text: "" };
    case "clipboard.get":
      return { id, type: "clipboard.get", name: "clip" };
    case "var.set":
      return { id, type: "var.set", name: "n", value: 1 };
    case "control.if":
      return {
        id,
        type: "control.if",
        condition: { left: { var: "n" }, op: "gt", right: 0 },
        then: [],
        else: [],
      };
    case "control.while":
      return {
        id,
        type: "control.while",
        condition: { left: { var: "n" }, op: "gt", right: 0 },
        body: [],
      };
    default:
      return { id, type: "process.run", command: "cmd", args: ["/C", "echo", "hi"] };
  }
}

export function buildActionAddMenu(
  onSelect: (kind: MacroAction["type"]) => void,
): AddMenuEntry[] {
  return [
    {
      id: "mouse",
      label: "Souris",
      items: [
        { id: "click", label: "Clic", onSelect: () => onSelect("mouse.click") },
        { id: "move", label: "Déplacer", onSelect: () => onSelect("mouse.move") },
        { id: "down", label: "Enfoncer", onSelect: () => onSelect("mouse.down") },
        { id: "up", label: "Relâcher", onSelect: () => onSelect("mouse.up") },
        { id: "wheel", label: "Molette", onSelect: () => onSelect("mouse.wheel") },
      ],
    },
    {
      id: "keyboard",
      label: "Clavier",
      items: [
        { id: "key", label: "Touche", onSelect: () => onSelect("key.tap") },
        { id: "keydown", label: "Maintenir", onSelect: () => onSelect("key.down") },
        { id: "keyup", label: "Relâcher", onSelect: () => onSelect("key.up") },
      ],
    },
    {
      id: "clip",
      label: "Presse-papiers",
      items: [
        {
          id: "clipset",
          label: "Copier du texte",
          onSelect: () => onSelect("clipboard.set"),
        },
        {
          id: "clipget",
          label: "Lire vers une variable",
          onSelect: () => onSelect("clipboard.get"),
        },
      ],
    },
    {
      id: "flow",
      label: "Flux",
      items: [
        { id: "delay", label: "Délai", onSelect: () => onSelect("delay") },
        { id: "if", label: "Si", onSelect: () => onSelect("control.if") },
        { id: "var", label: "Variable", onSelect: () => onSelect("var.set") },
      ],
    },
    {
      id: "sys",
      label: "Système",
      items: [
        { id: "http", label: "HTTP", onSelect: () => onSelect("http.request") },
        { id: "process", label: "Processus", onSelect: () => onSelect("process.run") },
      ],
    },
  ];
}
