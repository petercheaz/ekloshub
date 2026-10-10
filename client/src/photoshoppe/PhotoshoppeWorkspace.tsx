import { useRef, useState } from "react";
import { api } from "../api";
import type { EditorSnapshot } from "./types";
import { PhotoshoppeEditor, type PhotoshoppeEditorHandle } from "./PhotoshoppeEditor";
import { PhotoshoppeLibrary } from "./PhotoshoppeLibrary";

type Props = {
  orgId: string;
  storageKey?: string;
};

type OpenDoc = {
  id: string;
  name: string;
  folderId: string | null;
};

export function PhotoshoppeWorkspace({ orgId, storageKey }: Props) {
  const editorRef = useRef<PhotoshoppeEditorHandle>(null);
  const [view, setView] = useState<"editor" | "library">("editor");
  const [openDoc, setOpenDoc] = useState<OpenDoc | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<EditorSnapshot | null>(null);
  const [openToken, setOpenToken] = useState(0);
  const [status, setStatus] = useState("");
  const [libraryFolderId, setLibraryFolderId] = useState<string | null>(null);

  async function openDocument(documentId: string) {
    setStatus("Loading project…");
    try {
      const result = await api.loadPhotoshoppeDocument(orgId, documentId);
      setOpenDoc({
        id: result.document.id,
        name: result.document.name,
        folderId: result.document.parentId,
      });
      setLoadedSnapshot(result.snapshot);
      setOpenToken((n) => n + 1);
      setView("editor");
      setStatus(`Opened ${result.document.name}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not open project");
    }
  }

  function previewUploadPayload(dataUrl: string) {
    const bytes = Math.ceil((dataUrl.length * 3) / 4);
    return {
      name: "preview.png",
      type: "image/png",
      size: bytes,
      dataUrl,
    };
  }

  async function saveDocument(asNew: boolean) {
    const handle = editorRef.current;
    if (!handle) {
      return;
    }
    const snapshot = handle.getSnapshot();
    const previewDataUrl = handle.getPreviewPng();
    if (!previewDataUrl) {
      setStatus("Could not build preview image");
      return;
    }

    let documentId = asNew ? undefined : openDoc?.id;
    let name = openDoc?.name ?? "Untitled";
    let parentId = openDoc?.folderId ?? libraryFolderId;

    if (asNew || !openDoc) {
      const chosen = window.prompt("Save as (file name)", name);
      if (!chosen?.trim()) {
        return;
      }
      name = chosen.trim();
      documentId = undefined;
    }

    setStatus("Saving…");
    try {
      const result = await api.savePhotoshoppeDocument(orgId, {
        parentId,
        name,
        documentId,
        snapshot,
        preview: previewUploadPayload(previewDataUrl),
      });
      setOpenDoc({
        id: result.document.id,
        name: result.document.name,
        folderId: result.document.parentId ?? parentId,
      });
      setStatus(`Saved ${result.document.name}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div className="ps-lite-workspace-wrap">
      {status ? <p className="status ps-lite-workspace-status">{status}</p> : null}
      {view === "library" ? (
        <PhotoshoppeLibrary
          orgId={orgId}
          onOpenDocument={(id) => void openDocument(id)}
          onClose={() => setView("editor")}
          onFolderChange={setLibraryFolderId}
        />
      ) : (
        <PhotoshoppeEditor
          ref={editorRef}
          storageKey={storageKey}
          loadedSnapshot={loadedSnapshot}
          openToken={openToken}
          documentName={openDoc?.name}
          onBrowseLibrary={() => setView("library")}
          onSaveDocument={() => void saveDocument(false)}
          onSaveDocumentAs={() => void saveDocument(true)}
        />
      )}
    </div>
  );
}
