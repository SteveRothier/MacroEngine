import type { ReactNode } from "react";
import {
  Braces,
  Clipboard,
  Clock,
  Code2,
  GitBranch,
  Globe,
  Keyboard,
  MousePointer2,
  Repeat,
  Terminal,
  Variable,
} from "lucide-react";
import type { TFunction } from "../i18n";
import type { ActionPickerEntry } from "../ui/shell/ActionPickerMenu";
import { newActionId, type MacroAction } from "./types";

export function makeAction(
  kind: MacroAction["type"],
  t?: TFunction,
): MacroAction {
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
        failOnStatus: false,
      };
    case "json.path":
      return {
        id,
        type: "json.path",
        sourceVar: "body",
        path: "",
        destVar: "value",
      };
    case "script.run":
      return {
        id,
        type: "script.run",
        source: t
          ? t("macros.action.defaultScriptSource")
          : "//@param label string world\nconst label = caster.get('label');\ncaster.log('hello ' + label);\ncaster.return(label);\n",
        timeoutMs: 10000,
        params: {},
        resultVar: "scriptResult",
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
        maxIterations: 10000,
      };
    default:
      return { id, type: "process.run", command: "cmd", args: ["/C", "echo", "hi"] };
  }
}

function ic(node: ReactNode): ReactNode {
  return node;
}

export function buildActionAddMenu(
  onSelect: (kind: MacroAction["type"]) => void,
  t: TFunction,
): ActionPickerEntry[] {
  const s = 14;
  return [
    {
      id: "mouse",
      label: t("macros.menu.addGroup.mouse"),
      items: [
        {
          id: "click",
          label: t("macros.menu.add.click"),
          hint: "mouse.click",
          icon: ic(<MousePointer2 size={s} />),
          onSelect: () => onSelect("mouse.click"),
        },
        {
          id: "move",
          label: t("macros.menu.add.move"),
          hint: "mouse.move",
          icon: ic(<MousePointer2 size={s} />),
          onSelect: () => onSelect("mouse.move"),
        },
        {
          id: "down",
          label: t("macros.menu.add.down"),
          hint: "mouse.down",
          icon: ic(<MousePointer2 size={s} />),
          onSelect: () => onSelect("mouse.down"),
        },
        {
          id: "up",
          label: t("macros.menu.add.up"),
          hint: "mouse.up",
          icon: ic(<MousePointer2 size={s} />),
          onSelect: () => onSelect("mouse.up"),
        },
        {
          id: "wheel",
          label: t("macros.menu.add.wheel"),
          hint: "mouse.wheel",
          icon: ic(<MousePointer2 size={s} />),
          onSelect: () => onSelect("mouse.wheel"),
        },
      ],
    },
    {
      id: "keyboard",
      label: t("macros.menu.addGroup.keyboard"),
      items: [
        {
          id: "key",
          label: t("macros.menu.add.key"),
          hint: "key.tap",
          icon: ic(<Keyboard size={s} />),
          onSelect: () => onSelect("key.tap"),
        },
        {
          id: "keydown",
          label: t("macros.menu.add.keyDown"),
          hint: "key.down",
          icon: ic(<Keyboard size={s} />),
          onSelect: () => onSelect("key.down"),
        },
        {
          id: "keyup",
          label: t("macros.menu.add.keyUp"),
          hint: "key.up",
          icon: ic(<Keyboard size={s} />),
          onSelect: () => onSelect("key.up"),
        },
      ],
    },
    {
      id: "clip",
      label: t("macros.menu.addGroup.clipboard"),
      items: [
        {
          id: "clipset",
          label: t("macros.menu.add.clipSet"),
          hint: "clipboard.set",
          icon: ic(<Clipboard size={s} />),
          onSelect: () => onSelect("clipboard.set"),
        },
        {
          id: "clipget",
          label: t("macros.menu.add.clipGet"),
          hint: "clipboard.get",
          icon: ic(<Clipboard size={s} />),
          onSelect: () => onSelect("clipboard.get"),
        },
      ],
    },
    {
      id: "flow",
      label: t("macros.menu.addGroup.flow"),
      items: [
        {
          id: "delay",
          label: t("macros.menu.add.delay"),
          hint: "delay",
          icon: ic(<Clock size={s} />),
          onSelect: () => onSelect("delay"),
        },
        {
          id: "if",
          label: t("macros.menu.add.if"),
          hint: "control.if",
          icon: ic(<GitBranch size={s} />),
          onSelect: () => onSelect("control.if"),
        },
        {
          id: "while",
          label: t("macros.menu.add.while"),
          hint: "control.while",
          icon: ic(<Repeat size={s} />),
          onSelect: () => onSelect("control.while"),
        },
        {
          id: "var",
          label: t("macros.menu.add.var"),
          hint: "var.set",
          icon: ic(<Variable size={s} />),
          onSelect: () => onSelect("var.set"),
        },
      ],
    },
    {
      id: "script",
      label: t("macros.menu.addGroup.script"),
      items: [
        {
          id: "script-run",
          label: t("macros.menu.add.script"),
          hint: t("macros.menu.add.scriptHint"),
          icon: ic(<Code2 size={s} />),
          onSelect: () => onSelect("script.run"),
        },
      ],
    },
    {
      id: "sys",
      label: t("macros.menu.addGroup.system"),
      items: [
        {
          id: "http",
          label: t("macros.menu.add.http"),
          hint: "http.request",
          icon: ic(<Globe size={s} />),
          onSelect: () => onSelect("http.request"),
        },
        {
          id: "json",
          label: t("macros.menu.add.jsonPath"),
          hint: "json.path",
          icon: ic(<Braces size={s} />),
          onSelect: () => onSelect("json.path"),
        },
        {
          id: "process",
          label: t("macros.menu.add.process"),
          hint: "process.run",
          icon: ic(<Terminal size={s} />),
          onSelect: () => onSelect("process.run"),
        },
      ],
    },
  ];
}
