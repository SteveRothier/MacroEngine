/** Stable id for a newly created script document. */
export function newScriptId(): string {
  return `s${Math.random().toString(36).slice(2, 10)}`;
}
