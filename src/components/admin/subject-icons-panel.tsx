import { BUILT_IN_SUBJECT_ICONS } from "@/lib/school/catalog";

export function SubjectIconsPanel() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Built-in icons available when configuring subjects. You can also upload
        an SVG or PNG on each subject.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BUILT_IN_SUBJECT_ICONS.map((icon) => (
          <li
            key={icon.key}
            className="rounded-2xl border border-slate-100 px-3 py-2 text-sm"
          >
            <p className="font-medium text-slate-800">{icon.label}</p>
            <p className="text-xs text-slate-500">{icon.key}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
