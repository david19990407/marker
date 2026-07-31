"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveSubjectAction,
  createSubjectAction,
  deleteSubjectAction,
  moveSubjectAction,
  toggleSubjectActiveAction,
  updateSubjectAction,
  uploadSubjectIconAction,
} from "@/lib/actions/school-settings";
import {
  BUILT_IN_SUBJECT_ICONS,
  type ClassColourOption,
  type SubjectOption,
} from "@/lib/school/catalog";
import { SubjectIcon } from "@/components/shared/subject-icon";
import type { ActionResult } from "@/lib/actions/auth";

const initial: ActionResult = {};

export function SubjectsManager({
  subjects,
  colours,
}: {
  subjects: SubjectOption[];
  colours: ClassColourOption[];
}) {
  const [createState, createAction, createPending] = useActionState(
    createSubjectAction,
    initial,
  );
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<ActionResult>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [iconType, setIconType] = useState<"built_in" | "upload">("built_in");
  const [iconValue, setIconValue] = useState("book");
  const [uploadError, setUploadError] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      setFlash(result);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Teachers can only create classes using active subjects. Deactivated
        subjects stay on existing classes but disappear from new class forms.
      </p>

      {(createState.error || flash.error || uploadError) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {createState.error ?? flash.error ?? uploadError}
        </div>
      )}
      {(createState.success || flash.success) && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {createState.success ?? flash.success}
        </div>
      )}

      <form action={createAction} className="space-y-3 rounded-2xl border border-slate-100 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Subject name</span>
            <Input name="name" required placeholder="e.g. English" />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Short code</span>
            <Input name="code" placeholder="e.g. ENG" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Class colour</span>
            <select
              name="colour"
              defaultValue={colours[0]?.hex ?? "#7C3AED"}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            >
              {colours.map((c) => (
                <option key={c.id} value={c.hex}>
                  {c.name} ({c.hex})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block text-slate-500">Icon type</span>
            <select
              name="icon_type"
              value={iconType}
              onChange={(e) =>
                setIconType(e.target.value === "upload" ? "upload" : "built_in")
              }
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="built_in">Built-in icon</option>
              <option value="upload">Uploaded SVG / PNG</option>
            </select>
          </label>
        </div>
        {iconType === "built_in" ? (
          <label className="block text-sm">
            <span className="mb-1.5 block text-slate-500">Built-in icon</span>
            <select
              name="icon_value"
              value={iconValue}
              onChange={(e) => setIconValue(e.target.value)}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            >
              {BUILT_IN_SUBJECT_ICONS.map((icon) => (
                <option key={icon.key} value={icon.key}>
                  {icon.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-2">
            <input type="hidden" name="icon_value" value={iconValue} />
            <label className="block text-sm">
              <span className="mb-1.5 block text-slate-500">Upload icon</span>
              <input
                type="file"
                accept="image/png,image/svg+xml"
                className="block w-full text-sm text-slate-600"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.set("file", file);
                  startTransition(async () => {
                    setUploadError(null);
                    const result = await uploadSubjectIconAction(fd);
                    if (result.error) {
                      setUploadError(result.error);
                      return;
                    }
                    setIconValue(result.publicUrl || result.path || "");
                  });
                }}
              />
            </label>
            {iconValue ? (
              <p className="text-xs text-slate-500">Uploaded: {iconValue}</p>
            ) : null}
          </div>
        )}
        <Button type="submit" disabled={createPending || pending}>
          {createPending ? "Adding…" : "Add subject"}
        </Button>
      </form>

      <ul className="space-y-2">
        {subjects.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            No subjects yet. Add English or other curriculum subjects.
          </li>
        ) : null}
        {subjects.map((subject, index) => (
          <li
            key={subject.id}
            className="rounded-2xl border border-slate-100 px-4 py-3 text-sm"
          >
            {editingId === subject.id ? (
              <SubjectEditForm
                subject={subject}
                colours={colours}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <SubjectIcon
                    name={subject.name}
                    iconType={subject.icon_type}
                    iconValue={subject.icon_value}
                    colour={subject.colour}
                    size="sm"
                  />
                  <div>
                    <p className="font-medium text-slate-800">
                      {subject.name}
                      {subject.code ? (
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          {subject.code}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      Icon: {subject.icon_type}/{subject.icon_value} · Order{" "}
                      {subject.display_order}
                      {subject.archived_at ? " · Archived" : ""}
                      {!subject.is_active ? " · Inactive" : " · Active"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveSubjectAction(subject.id, "up"))}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || index === subjects.length - 1}
                    onClick={() =>
                      run(() => moveSubjectAction(subject.id, "down"))
                    }
                  >
                    Move down
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setEditingId(subject.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        toggleSubjectActiveAction(subject.id, !subject.is_active),
                      )
                    }
                  >
                    {subject.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        archiveSubjectAction(subject.id, !subject.archived_at),
                      )
                    }
                  >
                    {subject.archived_at ? "Restore" : "Archive"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => deleteSubjectAction(subject.id))}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubjectEditForm({
  subject,
  colours,
  onDone,
}: {
  subject: SubjectOption;
  colours: ClassColourOption[];
  onDone: () => void;
}) {
  const bound = updateSubjectAction.bind(null, subject.id);
  const [state, action, pending] = useActionState(bound, initial);
  const [iconType, setIconType] = useState<"built_in" | "upload">(
    subject.icon_type,
  );
  const [iconValue, setIconValue] = useState(subject.icon_value);

  return (
    <form action={action} className="space-y-3">
      {state.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
          {state.success}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" required defaultValue={subject.name} />
        <Input name="code" defaultValue={subject.code ?? ""} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="colour"
          defaultValue={subject.colour}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          {[subject.colour, ...colours.map((c) => c.hex)]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map((hex) => (
              <option key={hex} value={hex}>
                {hex}
              </option>
            ))}
        </select>
        <select
          name="icon_type"
          value={iconType}
          onChange={(e) =>
            setIconType(e.target.value === "upload" ? "upload" : "built_in")
          }
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="built_in">Built-in icon</option>
          <option value="upload">Uploaded SVG / PNG</option>
        </select>
      </div>
      {iconType === "built_in" ? (
        <select
          name="icon_value"
          value={iconValue}
          onChange={(e) => setIconValue(e.target.value)}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
        >
          {BUILT_IN_SUBJECT_ICONS.map((icon) => (
            <option key={icon.key} value={icon.key}>
              {icon.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          name="icon_value"
          value={iconValue}
          onChange={(e) => setIconValue(e.target.value)}
          placeholder="Icon URL or storage path"
        />
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    </form>
  );
}
