export const DEADLINE_LIMIT = 100;
export const DEADLINE_BACKUP_MAX_BYTES = 1_000_000;
export const DEADLINE_TASKS = [
  { value: "application", label: "Application" },
  { value: "financial-aid", label: "Financial aid" },
  { value: "recommendation", label: "Recommendation" },
  { value: "visit", label: "Visit" },
  { value: "custom", label: "Other task" },
] as const;
export type DeadlineTask = (typeof DEADLINE_TASKS)[number]["value"];
export type DeadlineEntry = {
  id: string; collegeId: number; task: DeadlineTask; title: string;
  date: string; sourceUrl: string; sourceChecked: boolean; checkedOn: string;
  notes: string; completed: boolean;
};
export type DeadlinePlan = { version: 1; entries: DeadlineEntry[] };
export type DeadlineEditor = {
  version: 1; editingId: string; baseEntry: string; collegeId: string;
  task: DeadlineTask; title: string; date: string; sourceUrl: string;
  sourceChecked: boolean; notes: string;
};
export type DeadlineField = "collegeId" | "task" | "title" | "date" | "sourceUrl" | "sourceChecked" | "notes" | "form";
export type DeadlineErrors = Partial<Record<DeadlineField, string>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function emptyDeadlinePlan(): DeadlinePlan { return { version: 1, entries: [] }; }
export function deadlinePlanKey(scope: unknown) {
  if (typeof scope !== "string") return null;
  const value = scope.trim().toLowerCase();
  return value === "guest" || uuid.test(value) ? `college-search-deadlines:v1:${value}` : null;
}
export function deadlinePlanLockName(scope: unknown) {
  const key = deadlinePlanKey(scope);
  return key ? `college-search:deadlines:${key.slice("college-search-deadlines:v1:".length)}` : null;
}
export function deadlineEditorKey(scope: unknown) { const key = deadlinePlanKey(scope); return key ? `${key}:editor` : null; }
export function deriveDeadlineScope(input: { scopeKey: string; clientReady: boolean; hydrated: boolean; canMutate: boolean }) {
  return input.clientReady && input.hydrated && input.canMutate && deadlinePlanKey(input.scopeKey) ? input.scopeKey.trim().toLowerCase() : null;
}

/** Calendar dates stay strings. No parsing through UTC midnight for local display. */
export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function localCalendarDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function formatCalendarDate(value: string, locale?: string) {
  if (!validCalendarDate(value)) return "Date not set";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
export function normalizedSourceUrl(value: string): string | null {
  if (!value.trim()) return "";
  if (value.length > 1000 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.href.length <= 1000 ? url.href : null;
  } catch { return null; }
}
export function emptyDeadlineEditor(): DeadlineEditor {
  return { version: 1, editingId: "", baseEntry: "", collegeId: "", task: "application", title: "", date: "", sourceUrl: "", sourceChecked: false, notes: "" };
}
export function editorForDeadline(entry: DeadlineEntry): DeadlineEditor {
  return { version: 1, editingId: entry.id, baseEntry: JSON.stringify(entry), collegeId: String(entry.collegeId), task: entry.task, title: entry.title, date: entry.date, sourceUrl: entry.sourceUrl, sourceChecked: entry.sourceChecked, notes: entry.notes };
}
export function patchDeadlineEditor(editor: DeadlineEditor, patch: Partial<DeadlineEditor>) {
  const materialChange = (["collegeId", "task", "title", "date", "sourceUrl"] as const).some((field) => patch[field] !== undefined && patch[field] !== editor[field]);
  return { ...editor, ...patch, ...(materialChange ? { sourceChecked: false } : {}), version: 1 as const };
}
export function parseDeadlineEditor(raw: string | null): DeadlineEditor | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const limits = { editingId: 36, baseEntry: 4000, collegeId: 16, title: 100, date: 10, sourceUrl: 1000, notes: 500 };
  if (v.version !== 1 || typeof v.sourceChecked !== "boolean" || !DEADLINE_TASKS.some((task) => task.value === v.task)) return null;
  for (const [field, limit] of Object.entries(limits)) if (typeof v[field] !== "string" || (v[field] as string).length > limit) return null;
  return { ...Object.fromEntries(Object.keys(limits).map((key) => [key, v[key]])), version: 1, task: v.task, sourceChecked: v.sourceChecked } as DeadlineEditor;
}
export function validateDeadlineEditor(editor: DeadlineEditor, knownIds: ReadonlySet<number>): DeadlineErrors {
  const errors: DeadlineErrors = {};
  if (!/^\d+$/.test(editor.collegeId) || !knownIds.has(Number(editor.collegeId))) errors.collegeId = "Choose a college from this directory.";
  if (!DEADLINE_TASKS.some((task) => task.value === editor.task)) errors.task = "Choose a task type.";
  if (editor.title.length > 100 || (editor.task === "custom" && !editor.title.trim())) errors.title = "Name your task in 100 characters or fewer.";
  if (!validCalendarDate(editor.date)) errors.date = "Enter a valid calendar date.";
  const url = normalizedSourceUrl(editor.sourceUrl);
  if (url === null) errors.sourceUrl = "Use a full http or https source URL without sign-in credentials.";
  if (editor.sourceChecked && !url) errors.sourceChecked = "Add the source you checked, or leave this confirmation unchecked.";
  if (editor.notes.length > 500) errors.notes = "Keep notes to 500 characters or fewer.";
  return errors;
}
export function commitDeadlineEditor(plan: DeadlinePlan, editor: DeadlineEditor, knownIds: ReadonlySet<number>, today: string, newId: string) {
  const errors = validateDeadlineEditor(editor, knownIds);
  const existing = editor.editingId ? plan.entries.find((entry) => entry.id === editor.editingId) : undefined;
  if (editor.editingId && (!existing || JSON.stringify(existing) !== editor.baseEntry)) errors.form = "This task changed or was removed in another view. Your form is retained. Reload the task or save it as a new task.";
  if (!editor.editingId && plan.entries.length >= DEADLINE_LIMIT) errors.form = `This tracker holds up to ${DEADLINE_LIMIT} tasks. Remove a task before adding another.`;
  if (!editor.editingId && plan.entries.some((entry) => entry.id === newId)) errors.form = "A task identifier collided. Try adding the task again.";
  if (!validCalendarDate(today) || !uuid.test(existing?.id ?? newId)) errors.form = "The task could not be prepared. Reload and try again; your form is retained.";
  if (Object.keys(errors).length) return { ok: false as const, errors };
  const unchangedSourceContext = existing && existing.collegeId === Number(editor.collegeId) && existing.task === editor.task && existing.title === editor.title.trim() && existing.date === editor.date && existing.sourceUrl === normalizedSourceUrl(editor.sourceUrl);
  const entry: DeadlineEntry = {
    id: existing?.id ?? newId, collegeId: Number(editor.collegeId), task: editor.task,
    title: editor.title.trim(), date: editor.date, sourceUrl: normalizedSourceUrl(editor.sourceUrl)!,
    sourceChecked: editor.sourceChecked, checkedOn: editor.sourceChecked ? unchangedSourceContext && existing.sourceChecked ? existing.checkedOn : today : "",
    notes: editor.notes, completed: existing?.completed ?? false,
  };
  return { ok: true as const, entry, plan: { version: 1 as const, entries: existing ? plan.entries.map((item) => item.id === existing.id ? entry : item) : [...plan.entries, entry] } };
}
export function parseDeadlinePlan(raw: string | null, knownIds: ReadonlySet<number>): DeadlinePlan | null {
  if (raw === null) return emptyDeadlinePlan();
  if (raw.length > DEADLINE_BACKUP_MAX_BYTES) return null;
  let candidate: unknown;
  try { candidate = JSON.parse(raw); } catch { return null; }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const value = candidate as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > DEADLINE_LIMIT) return null;
  const entries: DeadlineEntry[] = [];
  for (const item of value.entries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== "string" || !uuid.test(e.id) || entries.some((entry) => entry.id === e.id) || typeof e.collegeId !== "number" || !knownIds.has(e.collegeId) || !Number.isSafeInteger(e.collegeId) || typeof e.title !== "string" || typeof e.date !== "string" || typeof e.sourceUrl !== "string" || typeof e.notes !== "string" || typeof e.completed !== "boolean" || typeof e.sourceChecked !== "boolean" || typeof e.checkedOn !== "string") return null;
    const editor = { ...emptyDeadlineEditor(), collegeId: String(e.collegeId), task: e.task as DeadlineTask, title: e.title, date: e.date, sourceUrl: e.sourceUrl, sourceChecked: e.sourceChecked, notes: e.notes };
    if (Object.keys(validateDeadlineEditor(editor, knownIds)).length || (e.sourceChecked ? !validCalendarDate(e.checkedOn) : e.checkedOn !== "")) return null;
    entries.push({ id: e.id, collegeId: e.collegeId, task: editor.task, title: e.title, date: e.date, sourceUrl: normalizedSourceUrl(e.sourceUrl)!, sourceChecked: e.sourceChecked, checkedOn: e.checkedOn, notes: e.notes, completed: e.completed });
  }
  return { version: 1, entries };
}
export function deadlineGroups(plan: DeadlinePlan, today: string) {
  if (!validCalendarDate(today)) throw new Error("A local calendar date is required.");
  const entries = [...plan.entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    upcoming: entries.filter((entry) => !entry.completed && entry.date >= today),
    past: entries.filter((entry) => !entry.completed && entry.date < today),
    completed: entries.filter((entry) => entry.completed),
  };
}
export function deadlineTitle(entry: Pick<DeadlineEntry, "title" | "task">) { return entry.title || DEADLINE_TASKS.find((task) => task.value === entry.task)?.label || "Task"; }
export function deadlineBackup(plan: DeadlinePlan, today: string) {
  if (!validCalendarDate(today)) throw new Error("A valid export date is required.");
  return JSON.stringify({ format: "collegesearch-deadlines", version: 1, exportedOn: today, entries: plan.entries }, null, 2);
}
export function parseDeadlineBackup(raw: string, knownIds: ReadonlySet<number>): DeadlinePlan | null {
  if (raw.length > DEADLINE_BACKUP_MAX_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const backup = value as Record<string, unknown>;
  if (backup.format !== "collegesearch-deadlines" || !validCalendarDate(backup.exportedOn)) return null;
  return parseDeadlinePlan(JSON.stringify({ version: backup.version, entries: backup.entries }), knownIds);
}
