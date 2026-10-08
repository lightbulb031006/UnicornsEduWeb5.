"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mathematics from "@tiptap/extension-mathematics";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, List, ListOrdered, Sigma, SquareFunction } from "lucide-react";
import MathLatexInputPanel, { type MathLatexMode } from "@/components/ui/MathLatexInputPanel";

export type MathRichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Grow to fill a parent flex column; leftover page height becomes writing space. */
  fill?: boolean;
};

const DEFAULT_MIN_HEIGHT = "min-h-[180px]";

/** Công thức đang nhập trong panel; `pos` có giá trị khi sửa node có sẵn. */
type MathDraft = {
  mode: MathLatexMode;
  latex: string;
  pos: number | null;
  token: number;
};

const MATH_NODE_MODE: Record<string, MathLatexMode | undefined> = {
  inlineMath: "inline",
  blockMath: "block",
};
const EMPTY_PARAGRAPH_HTML = "<p></p>";

function isEmptyEditorHtml(html: string): boolean {
  const trimmed = html.trim();
  return trimmed === "" || trimmed === EMPTY_PARAGRAPH_HTML;
}

function isSameEditorHtml(a: string, b: string): boolean {
  if (a === b) return true;
  return isEmptyEditorHtml(a) && isEmptyEditorHtml(b);
}

function toolbarBtnClass(active: boolean, disabled: boolean): string {
  return [
    "inline-flex size-8 items-center justify-center rounded-md text-sm transition-colors",
    disabled
      ? "cursor-not-allowed text-text-muted opacity-50"
      : active
        ? "bg-primary/15 text-primary"
        : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
  ].join(" ");
}

function MathEditorToolbar({
  editor,
  disabled,
  activeMathMode,
  onOpenMath,
}: {
  editor: Editor;
  disabled: boolean;
  activeMathMode: MathLatexMode | null;
  onOpenMath: (mode: MathLatexMode) => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border-default px-1.5 py-1"
      role="toolbar"
      aria-label="Định dạng nội dung"
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={editor.isActive("bold")}
        aria-label="In đậm"
        className={toolbarBtnClass(editor.isActive("bold"), disabled)}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={editor.isActive("italic")}
        aria-label="In nghiêng"
        className={toolbarBtnClass(editor.isActive("italic"), disabled)}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={editor.isActive("bulletList")}
        aria-label="Danh sách"
        className={toolbarBtnClass(editor.isActive("bulletList"), disabled)}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={editor.isActive("orderedList")}
        aria-label="Danh sách đánh số"
        className={toolbarBtnClass(editor.isActive("orderedList"), disabled)}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-border-default" aria-hidden />
      <button
        type="button"
        disabled={disabled}
        aria-label="Chèn công thức cùng dòng"
        aria-pressed={activeMathMode === "inline"}
        className={toolbarBtnClass(activeMathMode === "inline", disabled)}
        onClick={() => onOpenMath("inline")}
      >
        <Sigma className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Chèn công thức khối"
        aria-pressed={activeMathMode === "block"}
        className={toolbarBtnClass(activeMathMode === "block", disabled)}
        onClick={() => onOpenMath("block")}
      >
        <SquareFunction className="size-3.5" />
      </button>
      <span className="ml-1 hidden text-[11px] text-text-muted sm:inline">
        Bấm vào công thức để sửa.
      </span>
    </div>
  );
}

export default function MathRichTextEditor({
  value,
  onChange,
  minHeight = DEFAULT_MIN_HEIGHT,
  placeholder,
  ariaLabel = "Nội dung soạn thảo",
  disabled = false,
  fill = false,
}: MathRichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const lastEmittedHtmlRef = useRef(value);
  const [mathDraft, setMathDraft] = useState<MathDraft | null>(null);

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
      Mathematics,
      ...(placeholder
        ? [
            Placeholder.configure({
              placeholder,
              emptyEditorClass:
                "before:content-[attr(data-placeholder)] before:float-left before:h-0 before:pointer-events-none before:text-text-muted before:opacity-70",
            }),
          ]
        : []),
    ],
    content: value || "",
    editorProps: {
      // Bấm vào công thức có sẵn → mở panel sửa. `view.editable` false khi `disabled`.
      handleClickOn: (view, _pos, node, nodePos) => {
        const mode = MATH_NODE_MODE[node.type.name];
        if (!mode || !view.editable) return false;
        setMathDraft({
          mode,
          latex: String(node.attrs.latex ?? ""),
          pos: nodePos,
          token: Date.now(),
        });
        return true;
      },
      attributes: {
        class: `px-3 py-2 text-text-primary [&_a]:text-primary [&_a]:underline [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-bold [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1 [&_.katex]:text-text-primary ${fill ? "min-h-full" : minHeight}`,
        "aria-label": ariaLabel,
      },
    },
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editor) return;
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

  const [, setToolbarTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const syncToolbar = () => setToolbarTick((n) => n + 1);
    editor.on("selectionUpdate", syncToolbar);
    editor.on("transaction", syncToolbar);
    return () => {
      editor.off("selectionUpdate", syncToolbar);
      editor.off("transaction", syncToolbar);
    };
  }, [editor]);

  if (!editor) return null;

  // Bị khoá giữa chừng thì ẩn panel; mở lại sẽ tạo draft mới.
  const activeMathDraft = disabled ? null : mathDraft;

  const openNewMath = (mode: MathLatexMode) => {
    setMathDraft((current) =>
      current?.mode === mode && current.pos === null
        ? null
        : { mode, latex: "", pos: null, token: Date.now() },
    );
  };

  // Doc có thể đã đổi khi panel mở (gõ tiếp trong editor) → pos cũ không còn trỏ đúng node.
  const isMathNodeAt = (mode: MathLatexMode, pos: number) => {
    const name = editor.state.doc.nodeAt(pos)?.type.name;
    return name !== undefined && MATH_NODE_MODE[name] === mode;
  };

  const submitMath = (latex: string) => {
    if (!mathDraft) return;
    const { mode } = mathDraft;
    const pos =
      mathDraft.pos !== null && isMathNodeAt(mode, mathDraft.pos) ? mathDraft.pos : null;
    const chain = editor.chain().focus();
    if (pos === null) {
      if (mode === "inline") chain.insertInlineMath({ latex });
      else chain.insertBlockMath({ latex });
    } else if (mode === "inline") {
      chain.updateInlineMath({ latex, pos });
    } else {
      chain.updateBlockMath({ latex, pos });
    }
    chain.run();
    setMathDraft(null);
  };

  const deleteMath = () => {
    if (!mathDraft || mathDraft.pos === null) return;
    const { mode, pos } = mathDraft;
    if (!isMathNodeAt(mode, pos)) {
      setMathDraft(null);
      return;
    }
    const chain = editor.chain().focus();
    if (mode === "inline") chain.deleteInlineMath({ pos });
    else chain.deleteBlockMath({ pos });
    chain.run();
    setMathDraft(null);
  };

  const cancelMath = () => {
    setMathDraft(null);
    editor.commands.focus();
  };

  return (
    <div
      className={`overflow-hidden rounded-md border border-border-default transition-colors ${
        disabled
          ? "bg-bg-secondary/60 text-text-secondary cursor-not-allowed opacity-75"
          : "bg-bg-surface focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus"
      } [&_.ProseMirror]:outline-none ${
        fill
          ? `flex min-h-0 flex-1 flex-col ${minHeight}`
          : minHeight
      }`}
    >
      <MathEditorToolbar
        editor={editor}
        disabled={disabled}
        activeMathMode={activeMathDraft?.pos === null ? activeMathDraft.mode : null}
        onOpenMath={openNewMath}
      />
      {activeMathDraft ? (
        <MathLatexInputPanel
          key={activeMathDraft.token}
          mode={activeMathDraft.mode}
          initialLatex={activeMathDraft.latex}
          editing={activeMathDraft.pos !== null}
          onSubmit={submitMath}
          onCancel={cancelMath}
          onDelete={deleteMath}
        />
      ) : null}
      {fill ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
