import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirmAction } from "../ui";
import { useToast } from "../ui/v2";
import type { ScriptDoc } from "./types";

function newId(): string {
  return `s${Math.random().toString(36).slice(2, 10)}`;
}

export function ScriptsLibraryPanel({ refreshKey }: { refreshKey?: number }) {
  const toast = useToast();
  const [scripts, setScripts] = useState<ScriptDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScriptDoc | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await invoke<ScriptDoc[]>("list_scripts_cmd");
      setScripts(list);
    } catch (e) {
      toast.error(String(e));
      setScripts([]);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    const found = scripts.find((s) => s.id === selectedId);
    setDraft(found ? { ...found } : null);
  }, [selectedId, scripts]);

  async function onCreate() {
    const doc: ScriptDoc = {
      id: newId(),
      name: "Nouveau script",
      source: "caster.log('hello');\n",
      allowNetwork: true,
    };
    try {
      await invoke("save_script_cmd", { doc });
      await reload();
      setSelectedId(doc.id);
      toast.success("Script créé");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function onSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await invoke("save_script_cmd", { doc: draft });
      await reload();
      toast.success("Script enregistré");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!draft) return;
    const ok = await confirmAction({
      title: "Supprimer le script ?",
      message: `« ${draft.name} » sera supprimé.`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await invoke("delete_script_cmd", { id: draft.id });
      setSelectedId(null);
      await reload();
      toast.success("Script supprimé");
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="v2-scripts-panel">
      <div className="v2-scripts-panel-head">
        <h2 className="v2-scripts-title">Scripts réutilisables</h2>
        <button type="button" className="v2-btn v2-btn-primary" onClick={() => void onCreate()}>
          Nouveau script
        </button>
      </div>
      <div className="v2-scripts-layout">
        <ul className="v2-scripts-list" aria-label="Scripts">
          {scripts.length === 0 ? (
            <li className="v2-scripts-empty">Aucun script — créez-en un.</li>
          ) : (
            scripts.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={[
                    "v2-scripts-list-item",
                    selectedId === s.id ? "active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span>{s.name}</span>
                  {!s.allowNetwork ? (
                    <span className="v2-scripts-badge">sans réseau</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        {draft ? (
          <div className="v2-scripts-editor">
            <label className="v2-field">
              <span>Nom</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="v2-field">
              <span>Id</span>
              <input type="text" value={draft.id} disabled />
            </label>
            <label className="v2-field v2-scripts-network">
              <input
                type="checkbox"
                checked={draft.allowNetwork}
                onChange={(e) =>
                  setDraft({ ...draft, allowNetwork: e.target.checked })
                }
              />
              <span>Autoriser le réseau (caster.fetch)</span>
            </label>
            <label className="v2-field">
              <span>Source</span>
              <textarea
                rows={14}
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                style={{
                  fontFamily: "ui-monospace, Consolas, monospace",
                  width: "100%",
                  fontSize: 12,
                }}
              />
            </label>
            <div className="actions wrap">
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                disabled={saving}
                onClick={() => void onSave()}
              >
                Enregistrer
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-ghost"
                onClick={() => void onDelete()}
              >
                Supprimer
              </button>
            </div>
          </div>
        ) : (
          <p className="v2-scripts-hint">Sélectionnez un script pour l’éditer.</p>
        )}
      </div>
    </div>
  );
}
