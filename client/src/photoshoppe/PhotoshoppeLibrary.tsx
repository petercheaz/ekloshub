import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { PhotoshoppeBrowseResult } from "../types";

type DocEntry = PhotoshoppeBrowseResult["documents"][number];

type Props = {
  orgId: string;
  onOpenDocument: (documentId: string) => void;
  onClose?: () => void;
  onFolderChange?: (folderId: string | null) => void;
};

export function PhotoshoppeLibrary({ orgId, onOpenDocument, onClose, onFolderChange }: Props) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [browse, setBrowse] = useState<PhotoshoppeBrowseResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocEntry | null>(null);

  const load = useCallback(
    (targetFolderId: string | null) => {
      setBusy(true);
      setError("");
      void api
        .browsePhotoshoppe(orgId, targetFolderId)
        .then((data) => {
          setBrowse(data);
          setFolderId(data.folderId);
          onFolderChange?.(data.folderId);
          setSelectedFolderId(null);
          setSelectedDocument(null);
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setBusy(false));
    },
    [orgId],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  function goUp() {
    if (!browse || browse.path.length <= 1) {
      load(null);
      return;
    }
    const parent = browse.path[browse.path.length - 2];
    load(parent?.id ?? null);
  }

  function createFolder() {
    const name = window.prompt("New folder name");
    if (!name?.trim()) {
      return;
    }
    setBusy(true);
    void api
      .createPhotoshoppeFolder(orgId, folderId, name.trim())
      .then(() => load(folderId))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }

  function openSelectedDocument() {
    if (selectedDocument) {
      onOpenDocument(selectedDocument.id);
    }
  }

  const previewUrl = selectedDocument?.previewUrl ?? "";

  return (
    <div className="ps-lite-library">
      <header className="ps-lite-library-head">
        <div>
          <h2 className="ps-lite-library-title">Org library</h2>
          <p className="ps-lite-library-sub muted">Browse saved projects for this organization.</p>
        </div>
        <div className="ps-lite-library-head-actions">
          {onClose ? (
            <button type="button" className="ghost" onClick={onClose}>
              Back to editor
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="status">{error}</p> : null}

      <div className="ps-lite-library-toolbar">
        <button type="button" disabled={busy || !browse || browse.path.length <= 1} onClick={goUp}>
          ↑ Up
        </button>
        <button type="button" disabled={busy} onClick={createFolder}>
          New folder
        </button>
        <button type="button" disabled={!selectedDocument || busy} onClick={openSelectedDocument}>
          Open in editor
        </button>
      </div>

      <nav className="ps-lite-library-path" aria-label="Folder path">
        {browse?.path.map((crumb, index) => (
          <span key={`${crumb.id ?? "root"}-${index}`}>
            {index > 0 ? <span className="ps-lite-library-sep">/</span> : null}
            <button
              type="button"
              className={index === browse.path.length - 1 ? "current" : ""}
              disabled={busy}
              onClick={() => load(crumb.id)}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="ps-lite-library-body">
        <div className="ps-lite-library-list-wrap">
          {busy && !browse ? <p className="muted">Loading…</p> : null}
          <ul className="ps-lite-library-list">
            {browse?.folders.map((folder) => (
              <li
                key={folder.id}
                className={selectedFolderId === folder.id ? "selected" : ""}
              >
                <button
                  type="button"
                  className="ps-lite-library-folder"
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setSelectedDocument(null);
                  }}
                  onDoubleClick={() => load(folder.id)}
                >
                  <span className="ps-lite-library-folder-icon" aria-hidden />
                  <span className="ps-lite-library-item-name">{folder.name}</span>
                </button>
              </li>
            ))}
            {browse?.documents.map((doc) => (
              <li key={doc.id} className={selectedDocument?.id === doc.id ? "selected" : ""}>
                <button
                  type="button"
                  className="ps-lite-library-file"
                  onClick={() => {
                    setSelectedDocument(doc);
                    setSelectedFolderId(null);
                  }}
                  onDoubleClick={() => onOpenDocument(doc.id)}
                >
                  {doc.previewUrl ? (
                    <img src={doc.previewUrl} alt="" className="ps-lite-library-thumb" />
                  ) : (
                    <span className="ps-lite-library-thumb empty" />
                  )}
                  <span className="ps-lite-library-item-meta">
                    <span className="ps-lite-library-item-name">{doc.name}</span>
                    <span className="muted">
                      {doc.updatedBy ? `${doc.updatedBy} · ` : ""}
                      {new Date(doc.updatedAt).toLocaleString()}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {browse && browse.folders.length === 0 && browse.documents.length === 0 ? (
            <p className="muted ps-lite-library-empty">This folder is empty. Save a project from the editor or create a folder.</p>
          ) : null}
        </div>

        <aside className="ps-lite-library-preview" aria-label="Preview">
          <h3>Preview</h3>
          {selectedDocument ? (
            <>
              <div className="ps-lite-library-preview-frame">
                {previewUrl ? (
                  <img src={previewUrl} alt={`Preview of ${selectedDocument.name}`} />
                ) : (
                  <p className="muted">No preview</p>
                )}
              </div>
              <p className="ps-lite-library-preview-name">{selectedDocument.name}</p>
              <button type="button" className="vbs-plan-save" onClick={openSelectedDocument}>
                Open in editor
              </button>
            </>
          ) : selectedFolderId && browse ? (
            <p className="muted">
              Folder <strong>{browse.folders.find((f) => f.id === selectedFolderId)?.name}</strong> — double-click
              to open.
            </p>
          ) : (
            <p className="muted">Select a saved image to preview it before opening.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
