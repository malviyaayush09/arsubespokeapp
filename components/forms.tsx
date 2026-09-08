"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingLabel,
  confirm,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={
        confirm
          ? (event) => {
              if (!window.confirm(confirm)) event.preventDefault();
            }
          : undefined
      }
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
  hint,
  autoFocus,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
  inputMode?: "text" | "numeric" | "decimal" | "tel";
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      <input
        className="field"
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        inputMode={inputMode}
        defaultValue={defaultValue ?? undefined}
      />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea
        className="field"
        name={name}
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
      />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="field" name={name} defaultValue={defaultValue}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
