"use client";

import { EditorContent, type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { AlignLeft, ArrowRight, Bold, Italic, List, ListOrdered, Sparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SectionAction = "summarize" | "rewrite" | "expand" | "extract";

type SelectionUiState = {
  top: number;
  left: number;
  text: string;
};

interface NoteEditorProps {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onAiAction?: (action: SectionAction, selectedText: string) => void;
  disabled?: boolean;
  className?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeEditorText(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function isLikelyHtml(value: string) {
  return /<[a-z][\s\S]*>/i.test(value);
}

function escapeEditorHtml(value: string) {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toEditorHtml(value: string) {
  const normalized = normalizeEditorText(value).trim();
  if (!normalized) return "<p></p>";

  if (isLikelyHtml(normalized)) return normalized;

  return normalized
    .split(/\n{2,}/g)
    .map((paragraph) => `<p>${escapeEditorHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function NoteEditor({
  value,
  placeholder,
  onChange,
  onAiAction,
  disabled = false,
  className,
}: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionUiState | null>(null);

  const setContentFromSelection = useCallback((editor: Editor) => {
    if (!containerRef.current) return;

    const { from, to } = editor.state.selection;
    if (from >= to) {
      setSelection(null);
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, "\n").trim();
    if (selectedText.length < 10) {
      setSelection(null);
      return;
    }

    const domSelection = window.getSelection();
    if (!domSelection || !domSelection.rangeCount) {
      setSelection(null);
      return;
    }

    const range = domSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const toolbarTop = clamp(
      rect.top - containerRect.top - 42,
      8,
      Math.max(8, containerRect.height - 44),
    );
    const toolbarLeft = clamp(
      rect.left - containerRect.left,
      8,
      Math.max(8, containerRect.width - 248),
    );

    setSelection({
      top: toolbarTop,
      left: toolbarLeft,
      text: selectedText,
    });
  }, []);

  const editor = useEditor(
    {
      extensions: [StarterKit],
      content: toEditorHtml(value),
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            "field-sizing-content max-h-[45vh] min-h-64 overflow-auto px-3 py-3 text-sm outline-none",
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        onChange(currentEditor.getHTML());
      },
      onSelectionUpdate: ({ editor: currentEditor }) => {
        if (disabled) {
          setSelection(null);
          return;
        }
        requestAnimationFrame(() => {
          setContentFromSelection(currentEditor);
        });
      },
      onBlur: () => {
        setSelection(null);
      },
    },
    [disabled],
  );

  const applyFormat = useCallback(
    (command: "bold" | "italic" | "bulletList" | "orderedList") => {
      if (disabled || !editor) return;
      if (command === "bold") {
        editor.chain().focus().toggleBold().run();
      }
      if (command === "italic") {
        editor.chain().focus().toggleItalic().run();
      }
      if (command === "bulletList") {
        editor.chain().focus().toggleBulletList().run();
      }
      if (command === "orderedList") {
        editor.chain().focus().toggleOrderedList().run();
      }
    },
    [disabled, editor],
  );

  const handleAiAction = useCallback(
    (action: SectionAction) => {
      if (!selection || !onAiAction) return;
      onAiAction(action, selection.text);
      setSelection(null);
    },
    [onAiAction, selection],
  );

  if (!editor) {
    return null;
  }

  editor.setEditable(!disabled);

  const initialContent = toEditorHtml(value);

  if (editor.getHTML() !== initialContent && editor.isEditable) {
    editor.commands.setContent(initialContent, false);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "border-input bg-input/30 has-focus-within:border-ring relative rounded-xl border",
        className,
      )}
    >
      <div className="border-border flex items-center gap-1 border-b px-2 py-1">
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat("bold")}
          disabled={disabled}
          className={editor.isActive("bold") ? "bg-muted" : undefined}
        >
          <Bold className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat("italic")}
          disabled={disabled}
          className={editor.isActive("italic") ? "bg-muted" : undefined}
        >
          <Italic className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat("bulletList")}
          disabled={disabled}
          className={editor.isActive("bulletList") ? "bg-muted" : undefined}
        >
          <List className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFormat("orderedList")}
          disabled={disabled}
          className={editor.isActive("orderedList") ? "bg-muted" : undefined}
        >
          <ListOrdered className="size-3.5" />
        </Button>
      </div>

      <div className="relative">
        <EditorContent editor={editor} />
        {editor.isEmpty && (
          <p className="text-muted-foreground pointer-events-none absolute top-3 left-3 text-sm select-none">
            {placeholder}
          </p>
        )}
      </div>

      <div className="text-muted-foreground border-border border-t px-3 py-1.5 text-[10px]">
        {placeholder}
      </div>

      {selection ? (
        <div
          className="bg-background/95 absolute z-10 flex flex-wrap gap-1 rounded-full border px-2 py-1 shadow-md backdrop-blur"
          style={{ top: selection.top, left: selection.left }}
        >
          <Button
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleAiAction("rewrite")}
          >
            <AlignLeft className="size-3.5" />
            <span className="max-w-28 truncate text-left">
              <ArrowRight className="size-3.5" /> Rewrite
            </span>
          </Button>
          <Button
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleAiAction("summarize")}
          >
            <span className="text-[11px]">Summarize</span>
          </Button>
          <Button
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleAiAction("expand")}
          >
            <span className="text-[11px]">Expand</span>
          </Button>
          <Button
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleAiAction("extract")}
          >
            <span className="text-[11px]">Extract actions</span>
          </Button>
          <Button size="xs" variant="outline" onMouseDown={(event) => event.preventDefault()}>
            <Sparkles className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
