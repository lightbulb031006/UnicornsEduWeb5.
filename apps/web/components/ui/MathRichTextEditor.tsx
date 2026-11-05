"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mathematics from "@tiptap/extension-mathematics";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Columns2,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Sigma,
  SquareFunction,
  Table,
} from "lucide-react";
import { toast } from "sonner";
import MathLatexInputPanel, { type MathLatexMode } from "@/components/ui/MathLatexInputPanel";
import {
  RICH_TEXT_EXTENSIONS,
  insertCodeParallel,
  prepareBlockInsert,
  normalizeImageUrl,
} from "@/components/ui/rich-text-extensions";
import {
  QUESTION_IMAGE_ACCEPT,
  QUESTION_IMAGE_MAX_BYTES,
  type QuestionImageRef,
} from "@/dtos/question-image.dto";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";

export type MathRichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Grow to fill a parent flex column; leftover page height becomes writing space. */
  fill?: boolean;
  /**
   * Có thì ảnh vào bucket: nút ảnh mở chọn file, dán / kéo-thả ảnh cũng tải
   * lên; không có ô dán URL. Vắng thì chèn ảnh bằng URL https.
   */
  onUploadImage?: (file: File) => Promise<QuestionImageRef>;
};

const UPLOADABLE_IMAGE_TYPES = new Set(QUESTION_IMAGE_ACCEPT.split(","));

function imageFilesOf(data: DataTransfer | null | undefined): File[] {
  return Array.from(data?.files ?? []).filter((f) =>
    UPLOADABLE_IMAGE_TYPES.has(f.type),
  );
}

/** Tải lần lượt để ảnh vào đúng thứ tự đã chọn / dán; `pos` null = chỗ con trỏ. */
async function uploadImagesInto(
  editor: Editor,
  upload: (file: File) => Promise<QuestionImageRef>,
  files: File[],
  pos: number | null,
) {
  for (const file of files) {
    if (file.size > QUESTION_IMAGE_MAX_BYTES) {
      toast.error(`Ảnh "${file.name}" vượt quá 5MB.`);
      continue;
    }
    const toastId = toast.loading("Đang tải ảnh lên…");
    try {
      const { path, url } = await upload(file);
      const image = { type: "image", attrs: { src: url, imagePath: path } };
      if (pos === null) {
        prepareBlockInsert(editor);
        editor.chain().focus().insertContent(image).run();
      } else {
        editor.chain().focus().insertContentAt(pos, image).run();
      }
      toast.success("Đã chèn ảnh.", { id: toastId });
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Không tải được ảnh."), {
        id: toastId,
      });
    }
  }
}

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
  imagePanelOpen,
  onImageClick,
  imageLabel,
}: {
  editor: Editor;
  disabled: boolean;
  activeMathMode: MathLatexMode | null;
  onOpenMath: (mode: MathLatexMode) => void;
  imagePanelOpen: boolean;
  onImageClick: () => void;
  imageLabel: string;
}) {
  const inTable = editor.isActive("table");
  const codeLanguageActive = (language: string) =>
    editor.isActive("codeBlock", { language });
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
      <span className="mx-1 h-4 w-px bg-border-default" aria-hidden />
      <button
        type="button"
        disabled={disabled}
        aria-label="Chèn bảng"
        aria-pressed={inTable}
        className={toolbarBtnClass(inTable, disabled)}
        onClick={() => {
          prepareBlockInsert(editor);
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        }}
      >
        <Table className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label={imageLabel}
        title={imageLabel}
        aria-pressed={imagePanelOpen}
        className={toolbarBtnClass(imagePanelOpen, disabled)}
        onClick={onImageClick}
      >
        <ImagePlus className="size-3.5" />
      </button>
      {(
        [
          ["python", "Py", "Khối code Python"],
          ["cpp", "C++", "Khối code C++"],
        ] as const
      ).map(([language, text, label]) => (
        <button
          key={language}
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-pressed={codeLanguageActive(language)}
          className={`${toolbarBtnClass(codeLanguageActive(language), disabled)} w-auto px-1.5 font-mono text-[11px] font-semibold`}
          onClick={() => editor.chain().focus().toggleCodeBlock({ language }).run()}
        >
          {text}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        aria-label="Chèn code song song Python | C++"
        aria-pressed={editor.isActive("codeParallel")}
        className={toolbarBtnClass(editor.isActive("codeParallel"), disabled)}
        onClick={() => insertCodeParallel(editor)}
      >
        <Columns2 className="size-3.5" />
      </button>
      {inTable ? (
        <span className="flex flex-wrap items-center gap-0.5" role="group" aria-label="Sửa bảng">
          {(
            [
              ["+ Hàng", () => editor.chain().focus().addRowAfter().run()],
              ["+ Cột", () => editor.chain().focus().addColumnAfter().run()],
              ["− Hàng", () => editor.chain().focus().deleteRow().run()],
              ["− Cột", () => editor.chain().focus().deleteColumn().run()],
              ["Xoá bảng", () => editor.chain().focus().deleteTable().run()],
            ] as const
          ).map(([text, run]) => (
            <button
              key={text}
              type="button"
              disabled={disabled}
              className={`${toolbarBtnClass(false, disabled)} h-7 w-auto px-1.5 text-[11px]`}
              onClick={run}
            >
              {text}
            </button>
          ))}
        </span>
      ) : null}
      <span className="ml-1 hidden text-[11px] text-text-muted sm:inline">
        Bấm vào công thức để sửa.
      </span>
    </div>
  );
}

function ImageUrlPanel({
  onSubmit,
  onCancel,
}: {
  onSubmit: (url: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  return (
    <div className="flex flex-col gap-2 border-b border-border-default bg-bg-secondary/50 px-2 py-2 sm:flex-row sm:items-center">
      <input
        autoFocus
        type="url"
        inputMode="url"
        aria-label="Link ảnh"
        placeholder="https://…/hinh.png"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit(url);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSubmit(url)}
          className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-text-inverse hover:bg-primary-hover"
        >
          Chèn ảnh
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-9 rounded-md border border-border-default px-3 text-sm text-text-secondary hover:bg-bg-secondary"
        >
          Huỷ
        </button>
      </div>
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
  onUploadImage,
}: MathRichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // editorProps tạo một lần → dán / thả gọi qua ref để luôn dùng bản mới nhất.
  const dropImagesRef = useRef<
    ((files: File[], pos: number | null) => void) | null
  >(null);
  const lastEmittedHtmlRef = useRef(value);
  const [mathDraft, setMathDraft] = useState<MathDraft | null>(null);
  const [imagePanelOpen, setImagePanelOpen] = useState(false);

  const takeImages = (view: EditorView, files: File[], pos: number | null) => {
    const drop = dropImagesRef.current;
    if (!drop || files.length === 0 || !view.editable) return false;
    drop(files, pos);
    return true;
  };

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
      ...RICH_TEXT_EXTENSIONS,
      ...(placeholder
        ? [
            Placeholder.configure({
              placeholder,
              // CSS `.rich-content > p.is-editor-empty` trong globals.css: chỉ
              // hiện khi tài liệu đúng một paragraph trống.
              emptyEditorClass: "is-editor-empty",
            }),
          ]
        : []),
    ],
    content: value || "",
    editorProps: {
      handlePaste: (view, event) =>
        takeImages(view, imageFilesOf(event.clipboardData), null),
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          null;
        return takeImages(view, imageFilesOf(event.dataTransfer), pos);
      },
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
        class: `rich-content px-3 py-2 text-text-primary [&_a]:text-primary [&_a]:underline [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-bold [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1 [&_.katex]:text-text-primary ${fill ? "min-h-full" : minHeight}`,
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

  useEffect(() => {
    dropImagesRef.current =
      editor && onUploadImage
        ? (files, pos) => void uploadImagesInto(editor, onUploadImage, files, pos)
        : null;
  }, [editor, onUploadImage]);

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

  const insertImage = (raw: string) => {
    const src = normalizeImageUrl(raw);
    if (!src) {
      toast.error("Link ảnh phải bắt đầu bằng https://");
      return;
    }
    prepareBlockInsert(editor);
    editor.chain().focus().setImage({ src }).run();
    setImagePanelOpen(false);
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
        imagePanelOpen={!onUploadImage && imagePanelOpen && !disabled}
        imageLabel={onUploadImage ? "Tải ảnh lên" : "Chèn ảnh"}
        onImageClick={() =>
          onUploadImage
            ? fileInputRef.current?.click()
            : setImagePanelOpen((open) => !open)
        }
      />
      {onUploadImage ? (
        <input
          ref={fileInputRef}
          type="file"
          accept={QUESTION_IMAGE_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (onUploadImage) {
              void uploadImagesInto(editor, onUploadImage, files, null);
            }
          }}
        />
      ) : null}
      {!onUploadImage && imagePanelOpen && !disabled ? (
        <ImageUrlPanel onSubmit={insertImage} onCancel={() => setImagePanelOpen(false)} />
      ) : null}
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
