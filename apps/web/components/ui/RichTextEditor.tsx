"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef } from "react";

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

const DEFAULT_MIN_HEIGHT = "min-h-[180px]";
const EMPTY_PARAGRAPH_HTML = "<p></p>";

function isEmptyEditorHtml(html: string): boolean {
  const trimmed = html.trim();
  return trimmed === "" || trimmed === EMPTY_PARAGRAPH_HTML;
}

/** True when two TipTap HTML values represent the same empty document. */
function isSameEditorHtml(a: string, b: string): boolean {
  if (a === b) return true;
  return isEmptyEditorHtml(a) && isEmptyEditorHtml(b);
}

export default function RichTextEditor({
  value,
  onChange,
  minHeight = DEFAULT_MIN_HEIGHT,
  placeholder,
  ariaLabel = "Nội dung soạn thảo",
  disabled = false,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const lastEmittedHtmlRef = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      ...(placeholder
        ? [
            Placeholder.configure({
              placeholder,
              // TipTap requires float + height:0 so the ::before placeholder
              // does not take layout space (otherwise caret lands mid/end of text).
              emptyEditorClass:
                "before:content-[attr(data-placeholder)] before:float-left before:h-0 before:pointer-events-none before:text-text-muted before:opacity-70",
            }),
          ]
        : []),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: `px-3 py-2 text-text-primary [&_a]:text-primary [&_a]:underline [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-bold [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base ${minHeight}`,
        "aria-label": ariaLabel,
      },
    },
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editor) return;
    // Only apply external value changes (load session, reset form). Skip echo
    // of our own onChange — sanitizing/re-setting TipTap Link HTML resets caret.
    if (isSameEditorHtml(value, lastEmittedHtmlRef.current)) return;
    lastEmittedHtmlRef.current = value;
    const current = editor.getHTML();
    if (!isSameEditorHtml(value, current)) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      const html = editor.getHTML();
      lastEmittedHtmlRef.current = html;
      onChangeRef.current(html);
    };
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={`rounded-md border border-border-default transition-colors ${
        disabled
          ? "bg-bg-secondary/60 text-text-secondary cursor-not-allowed opacity-75"
          : "bg-bg-surface focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus"
      } [&_.ProseMirror]:outline-none ${minHeight}`}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
