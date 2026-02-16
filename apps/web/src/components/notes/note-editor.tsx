"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { BubbleMenu, EditorContent, type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Sparkles,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import {
  type SectionAction,
  isEmptyEditorMarkup,
  normalizeEditorMarkup,
  toEditorHtml,
} from "./note-editor-utils";

export type NoteEditorHandle = {
  getContent(): string;
  setContent(html: string): void;
  getEditor(): Editor | null;
};

interface NoteEditorProps {
  initialContent: string;
  placeholder: string;
  onDirty(): void;
  onAiAction?: (action: SectionAction, selectedText: string) => void;
  disabled?: boolean;
  className?: string;
}

type FormatCommand =
  | "bold"
  | "italic"
  | "bulletList"
  | "orderedList"
  | "strike"
  | "underline"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify";

function getHeadingLabel(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "H1";
  if (editor.isActive("heading", { level: 2 })) return "H2";
  if (editor.isActive("heading", { level: 3 })) return "H3";
  return "P";
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { initialContent, placeholder, onDirty, onAiAction, disabled = false, className },
  ref,
) {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: "text-primary underline" },
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
      ],
      content: toEditorHtml(initialContent),
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            "field-sizing-content max-h-[45vh] min-h-64 overflow-auto px-3 py-3 text-sm outline-none",
        },
      },
      onUpdate: () => {
        onDirty();
      },
    },
    [disabled],
  );

  useImperativeHandle(
    ref,
    () => ({
      getContent() {
        if (!editor) return "";
        const html = editor.getHTML();
        return isEmptyEditorMarkup(html) ? "" : html;
      },
      setContent(html: string) {
        if (!editor) return;
        const incoming = normalizeEditorMarkup(html);
        const current = normalizeEditorMarkup(editor.getHTML());
        if (incoming === current) return;
        editor.commands.setContent(incoming ? toEditorHtml(html) : "", false);
      },
      getEditor() {
        return editor;
      },
    }),
    [editor],
  );

  const applyFormat = useCallback(
    (command: FormatCommand) => {
      if (disabled || !editor) return;
      const chain = editor.chain().focus();
      switch (command) {
        case "bold":
          chain.toggleBold().run();
          break;
        case "italic":
          chain.toggleItalic().run();
          break;
        case "bulletList":
          chain.toggleBulletList().run();
          break;
        case "orderedList":
          chain.toggleOrderedList().run();
          break;
        case "strike":
          chain.toggleStrike().run();
          break;
        case "underline":
          chain.toggleUnderline().run();
          break;
        case "alignLeft":
          chain.setTextAlign("left").run();
          break;
        case "alignCenter":
          chain.setTextAlign("center").run();
          break;
        case "alignRight":
          chain.setTextAlign("right").run();
          break;
        case "alignJustify":
          chain.setTextAlign("justify").run();
          break;
      }
    },
    [disabled, editor],
  );

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl.trim() }).run();
    setLinkMenuOpen(false);
  }, [editor, linkUrl]);

  const handleLinkMenuOpen = useCallback(
    (open: boolean) => {
      if (open && editor) {
        const attrs = editor.getAttributes("link");
        setLinkUrl((attrs.href as string) ?? "");
      }
      setLinkMenuOpen(open);
    },
    [editor],
  );

  const handleAiAction = useCallback(
    (action: SectionAction) => {
      if (!editor || !onAiAction) return;
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, "\n").trim();
      if (!selectedText) return;
      onAiAction(action, selectedText);
    },
    [editor, onAiAction],
  );

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-input bg-input/30 has-focus-within:border-ring relative rounded-xl border",
        className,
      )}
    >
      <div className="border-border flex items-center gap-0.5 border-b px-2 py-1">
        {/* ── Heading dropdown ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Type className="size-3.5" />
              <span className="text-[11px]">{getHeadingLabel(editor)}</span>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-32">
            <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
              Paragraph
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <span className="text-lg font-bold">Heading 1</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <span className="text-base font-semibold">Heading 2</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <span className="text-sm font-semibold">Heading 3</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── List dropdown ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              className={
                editor.isActive("bulletList") || editor.isActive("orderedList")
                  ? "bg-muted"
                  : undefined
              }
            >
              <List className="size-3.5" />
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-32">
            <DropdownMenuItem onSelect={() => applyFormat("bulletList")}>
              <List className="size-3.5" /> Bullet list
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => applyFormat("orderedList")}>
              <ListOrdered className="size-3.5" /> Ordered list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* ── Inline formatting ── */}
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("bold")}
          disabled={disabled}
          className={editor.isActive("bold") ? "bg-muted" : undefined}
        >
          <Bold className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("italic")}
          disabled={disabled}
          className={editor.isActive("italic") ? "bg-muted" : undefined}
        >
          <Italic className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("strike")}
          disabled={disabled}
          className={editor.isActive("strike") ? "bg-muted" : undefined}
        >
          <Strikethrough className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("underline")}
          disabled={disabled}
          className={editor.isActive("underline") ? "bg-muted" : undefined}
        >
          <UnderlineIcon className="size-3.5" />
        </Button>

        {/* ── Link ── */}
        <DropdownMenu open={linkMenuOpen} onOpenChange={handleLinkMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              variant="ghost"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              className={editor.isActive("link") ? "bg-muted" : undefined}
            >
              <LinkIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 p-2" onCloseAutoFocus={(e) => e.preventDefault()}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyLink();
              }}
              className="flex gap-1.5"
            >
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="h-7 text-xs"
              />
              <Button type="submit" size="xs">
                Apply
              </Button>
            </form>
            {editor.isActive("link") && (
              <Button
                size="xs"
                variant="ghost"
                className="mt-1 w-full"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setLinkMenuOpen(false);
                }}
              >
                <Unlink className="size-3.5" /> Remove link
              </Button>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* ── Text alignment ── */}
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("alignLeft")}
          disabled={disabled}
          className={editor.isActive({ textAlign: "left" }) ? "bg-muted" : undefined}
        >
          <AlignLeft className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("alignCenter")}
          disabled={disabled}
          className={editor.isActive({ textAlign: "center" }) ? "bg-muted" : undefined}
        >
          <AlignCenter className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("alignRight")}
          disabled={disabled}
          className={editor.isActive({ textAlign: "right" }) ? "bg-muted" : undefined}
        >
          <AlignRight className="size-3.5" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormat("alignJustify")}
          disabled={disabled}
          className={editor.isActive({ textAlign: "justify" }) ? "bg-muted" : undefined}
        >
          <AlignJustify className="size-3.5" />
        </Button>
      </div>

      <EditorContent editor={editor} />

      <div className="text-muted-foreground border-border border-t px-3 py-1.5 text-[10px]">
        {placeholder}
      </div>

      {onAiAction ? (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: e }) => {
            const { from, to } = e.state.selection;
            if (from >= to) return false;
            const text = e.state.doc.textBetween(from, to, "\n").trim();
            return text.length >= 10;
          }}
          tippyOptions={{ placement: "top-start" }}
          className="bg-background/95 flex flex-wrap gap-1 rounded-full border px-2 py-1 shadow-md backdrop-blur"
        >
          <Button
            size="xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleAiAction("rewrite")}
          >
            <AlignLeft className="size-3.5" />
            <span className="text-[11px]">Rewrite</span>
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
        </BubbleMenu>
      ) : null}
    </div>
  );
});
