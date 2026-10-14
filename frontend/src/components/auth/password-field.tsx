"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({ id, name, label, autoComplete, minLength, describedBy }: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <span className="password-control">
        <input aria-describedby={describedBy} autoComplete={autoComplete} id={id} maxLength={128} minLength={minLength} name={name} required type={visible ? "text" : "password"} />
        <button aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`} onClick={() => setVisible((value) => !value)} type="button">
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </label>
  );
}
