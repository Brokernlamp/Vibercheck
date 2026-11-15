"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-secondary btn-sm no-print"
    >
      <Printer size={13} aria-hidden />
      Print / Save PDF
    </button>
  );
}
