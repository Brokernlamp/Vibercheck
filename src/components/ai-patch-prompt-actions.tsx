"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { ReportPayload } from "@/lib/report";
import { buildAiPatchPrompt, promptFileName } from "@/lib/ai-patch-prompt";

export function AiPatchPromptActions({ payload }: { payload: ReportPayload }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const prompt = buildAiPatchPrompt(payload);

  function downloadPrompt() {
    const blob = new Blob([prompt], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = promptFileName(payload.engagement.name);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-primary" onClick={downloadPrompt}>
        <Download size={13} aria-hidden />
        Download AI patch prompt
      </button>
      <button type="button" className="btn" onClick={copyPrompt}>
        {copyState === "copied" ? (
          <Check size={13} aria-hidden />
        ) : (
          <Copy size={13} aria-hidden />
        )}
        {copyState === "copied" ? "Copied" : "Copy prompt"}
      </button>
      {copyState === "error" && (
        <span role="alert" className="text-[10px] text-critical">
          Clipboard access failed. Download the prompt file instead.
        </span>
      )}
    </div>
  );
}
