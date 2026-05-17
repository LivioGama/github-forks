import PocketBase from "pocketbase";

/** Large enough for Gemini Markdown; PocketBase default text max is often 5000 — must be raised. */
const DEEP_SUMMARY_MAX = 500_000;

function optionalTextField(name: string) {
  return {
    name,
    type: "text" as const,
    required: false,
    hidden: false,
    presentable: false,
    min: 0,
    max: 0,
    pattern: "",
  };
}

function optionalDeepSummaryField() {
  return {
    name: "deepSummary",
    type: "text" as const,
    required: false,
    hidden: false,
    presentable: false,
    min: 0,
    max: DEEP_SUMMARY_MAX,
    pattern: "",
  };
}

function optionalJsonField(name: string) {
  return {
    name,
    type: "json" as const,
    required: false,
    maxSize: 0,
  };
}

/**
 * Ensures `forks` has optional fields used for Gemini persistence and commit data.
 * Also **raises** an existing `deepSummary` text field max if it is below `DEEP_SUMMARY_MAX`
 * (common failure: PB default 5000-char limit).
 * Returns true if the collection schema was updated (caller may retry the write).
 */
export async function ensureForksGeminiFields(pb: PocketBase): Promise<boolean> {
  const col = await pb.collections.getFirstListItem<Record<string, unknown>>(
    'name = "forks"'
  );

  const fields = (col as { fields?: unknown[] }).fields ?? [];
  if (!Array.isArray(fields)) {
    return false;
  }

  const names = new Set(
    (fields as { name?: string }[]).map((f) => f.name).filter(Boolean) as string[]
  );

  let bumpedDeepSummary = false;
  const resizedFields = fields.map((field) => {
    const f = field as Record<string, unknown>;
    if (f.name !== "deepSummary" || f.type !== "text") {
      return field;
    }
    const m = typeof f.max === "number" ? f.max : 0;
    if (m < DEEP_SUMMARY_MAX) {
      bumpedDeepSummary = true;
      return { ...f, max: DEEP_SUMMARY_MAX };
    }
    return field;
  });

  const toAdd: Record<string, unknown>[] = [];
  if (!names.has("deepSummary")) toAdd.push(optionalDeepSummaryField());
  if (!names.has("deepSummaryGeneratedAt"))
    toAdd.push(optionalTextField("deepSummaryGeneratedAt"));
  if (!names.has("commitsJson")) toAdd.push(optionalJsonField("commitsJson"));

  if (!bumpedDeepSummary && toAdd.length === 0) {
    return false;
  }

  const newFields = [...resizedFields, ...toAdd];
  await pb.collections.update(String(col.id), { fields: newFields as never });
  return true;
}
