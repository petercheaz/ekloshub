import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useOrgVbs } from "../org-vbs";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { useOrgs } from "../orgs";
import { VbsFilterPanel } from "../VbsFilterPanel";
import { isSpecificVbsFilter, vbsProgramsMatching, vbsPublisherOptions } from "../vbs-cascade";
import { applyVbsFilterDefault } from "../vbs-filters";
import { useAuth } from "../auth";
import type { Publisher, ShareAttachment, ShareProgram, SetupPost } from "../types";
import { attachmentTooLargeMessage, MAX_ATTACHMENT_BYTES } from "@media-limits";

const PREVIEW_CHARS = 180;
const emptyDraft = {
  year: "",
  publisherId: "",
  title: "",
  body: "",
  videoUrl: "",
  pictures: [] as ShareAttachment[],
  attachments: [] as ShareAttachment[],
};

function previewText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= PREVIEW_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, PREVIEW_CHARS).trimEnd()}…`;
}

async function readFiles(files: FileList | null, limit: number): Promise<ShareAttachment[]> {
  if (!files?.length) {
    return [];
  }
  const selected = [...files].slice(0, limit);
  return Promise.all(
    selected.map(
      (file) =>
        new Promise<ShareAttachment>((resolve, reject) => {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            reject(new Error(attachmentTooLargeMessage(file.name)));
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: String(reader.result ?? ""),
            });
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
          reader.readAsDataURL(file);
        }),
    ),
  );
}

export default function SetupPage() {
  const { user } = useAuth();
  const { tenantId, canWrite } = useOrgs();
  const { filterDefault, prefsReady, defaultYear: prefsDefaultYear } = useOrgVbs();
  const filtersBootstrapped = useRef(false);
  const [posts, setPosts] = useState<SetupPost[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [programs, setPrograms] = useState<ShareProgram[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [yearFilter, setYearFilter] = useState("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [titleFilter, setTitleFilter] = useState("all");
  const [siteDefaultYear, setSiteDefaultYear] = useState<number | null>(null);

  useEffect(() => {
    filtersBootstrapped.current = false;
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    api
      .setups()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setPosts(payload.posts);
        setPublishers(payload.publishers);
        setPrograms(payload.programs);
        setSiteDefaultYear(payload.defaultYear);
        setDraft((current) => ({
          ...current,
          publisherId: current.publisherId || payload.publishers[0]?.id || "",
        }));
        setError(null);
        setLoaded(true);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!loaded || !prefsReady || filtersBootstrapped.current || siteDefaultYear === null) {
      return;
    }
    filtersBootstrapped.current = true;
    const next = applyVbsFilterDefault(filterDefault, siteDefaultYear ?? prefsDefaultYear);
    setYearFilter(next.yearFilter);
    setPublisherFilter(next.publisherFilter);
    setTitleFilter(next.titleFilter);
    if (next.titleFilter !== "all") {
      setDraft((current) => ({
        ...current,
        publisherId: next.publisherFilter,
        title: next.titleFilter,
      }));
    }
  }, [loaded, prefsReady, filterDefault, siteDefaultYear, prefsDefaultYear]);

  const postYears = useMemo(() => posts.map((post) => post.year), [posts]);
  const draftPublishers = useMemo(
    () => vbsPublisherOptions(publishers, programs, draft.year),
    [publishers, programs, draft.year],
  );
  const draftTitlesReady = isSpecificVbsFilter(draft.year) && isSpecificVbsFilter(draft.publisherId);
  const filtered = useMemo(
    () =>
      posts.filter((post) => {
        if (yearFilter !== "all" && String(post.year) !== yearFilter) {
          return false;
        }
        if (publisherFilter !== "all" && post.publisherId !== publisherFilter) {
          return false;
        }
        if (titleFilter !== "all" && post.title !== titleFilter) {
          return false;
        }
        return true;
      }),
    [posts, yearFilter, publisherFilter, titleFilter],
  );
  const groups = useMemo(() => {
    const map = new Map<string, { year: number; publisherName: string; title: string; posts: SetupPost[] }>();
    for (const post of filtered) {
      const key = `${post.year}|${post.publisherId}|${post.title}`;
      const existing = map.get(key);
      if (existing) {
        existing.posts.push(post);
      } else {
        map.set(key, {
          year: post.year,
          publisherName: post.publisherName,
          title: post.title,
          posts: [post],
        });
      }
    }
    return [...map.values()].map((group) => ({
      ...group,
      posts: [...group.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
  }, [filtered]);

  function closeForm() {
    setShowForm(false);
    setDraft({
      ...emptyDraft,
      publisherId: publishers[0]?.id ?? "",
    });
  }

  function replacePost(next: SetupPost) {
    setPosts((current) => current.map((post) => (post.id === next.id ? next : post)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const program = programs.find(
      (item) =>
        item.theme === draft.title &&
        item.publisherId === draft.publisherId &&
        String(item.year) === draft.year,
    );
    if (!draft.year || !draft.publisherId || !draft.title || !draft.body.trim() || !program) {
      setError("Year, publisher, VBS name, and text are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const post = await api.addSetup({
        ...draft,
        year: program.year,
      });
      setPosts((current) => [post, ...current]);
      closeForm();
      setYearFilter(String(post.year));
      setPublisherFilter("all");
      setTitleFilter("all");
      setCollapsedIds((current) => {
        const next = new Set(current);
        next.delete(post.id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save setup");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(postId: string) {
    try {
      await api.deleteSetup(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
      setCollapsedIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  async function onComment(postId: string, event: FormEvent) {
    event.preventDefault();
    const body = commentDrafts[postId]?.trim() ?? "";
    if (!body) {
      return;
    }
    try {
      const post = await api.addSetupComment(postId, body);
      replacePost(post);
      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not comment");
    }
  }

  async function onDeleteComment(commentId: string, postId: string) {
    try {
      await api.deleteSetupComment(commentId);
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? { ...post, comments: post.comments.filter((comment) => comment.id !== commentId) }
            : post,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete comment");
    }
  }

  if (!loaded) {
    return <p className="status">Loading setups…</p>;
  }

  return (
    <OrgWorkspacePage
      eyebrow="Rooms, hallways, and stations"
      title="Show Your Setup"
      tagline="Post photos, notes, and video of how you decorated. Expand an entry to comment or see attachments."
      actions={
        canWrite ? (
          <button
            type="button"
            className="vbs-plan-save"
            onClick={() => {
              setDraft((current) => ({
                ...current,
                year: isSpecificVbsFilter(yearFilter) ? yearFilter : current.year,
                publisherId: isSpecificVbsFilter(publisherFilter) ? publisherFilter : current.publisherId,
                title:
                  isSpecificVbsFilter(titleFilter) && titleFilter !== "all" ? titleFilter : current.title,
              }));
              setShowForm(true);
            }}
          >
            Add an entry
          </button>
        ) : null
      }
    >
      {showForm ? (
        <form className="review-form share-form vbs-form-panel" onSubmit={(event) => void onSubmit(event)}>
          <h3>New setup</h3>
          <label htmlFor="setup-year">Year</label>
          <select
            id="setup-year"
            value={draft.year}
            onChange={(event) => setDraft({ ...draft, year: event.target.value, title: "" })}
            required
          >
            <option value="">Select year</option>
            {[...new Set(programs.map((program) => program.year))].sort((a, b) => b - a).map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
          <label htmlFor="setup-publisher">Publisher</label>
          <select
            id="setup-publisher"
            value={draft.publisherId}
            onChange={(event) => setDraft({ ...draft, publisherId: event.target.value, title: "" })}
            required
          >
            <option value="">Select publisher</option>
            {draftPublishers.map((publisher) => (
              <option key={publisher.id} value={publisher.id}>
                {publisher.name}
              </option>
            ))}
          </select>
          <label htmlFor="setup-title">VBS name</label>
          <select
            id="setup-title"
            key={`${draft.year}:${draft.publisherId}`}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            required
            disabled={!draftTitlesReady}
          >
            <option value="">
              {draftTitlesReady ? "Select VBS name" : "Choose year and publisher first"}
            </option>
            {draftTitlesReady
              ? vbsProgramsMatching(programs, draft.publisherId, draft.year).map((program) => (
                  <option key={program.id} value={program.theme}>
                    {program.theme}
                  </option>
                ))
              : null}
          </select>
          <label htmlFor="setup-body">Text</label>
          <textarea
            id="setup-body"
            rows={4}
            value={draft.body}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            required
          />
          <label htmlFor="setup-video">Video URL</label>
          <input
            id="setup-video"
            type="url"
            placeholder="https://"
            value={draft.videoUrl}
            onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
          />
          <label htmlFor="setup-pictures">Pictures</label>
          <input
            id="setup-pictures"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              void readFiles(event.target.files, 6)
                .then((pictures) => {
                  setDraft((current) => ({ ...current, pictures }));
                  setError(null);
                })
                .catch((err: Error) => setError(err.message));
            }}
          />
          {draft.pictures.length > 0 ? (
            <ul className="attachment-list">
              {draft.pictures.map((file) => (
                <li key={file.name}>{file.name}</li>
              ))}
            </ul>
          ) : null}
          <label htmlFor="setup-files">Attachments</label>
          <input
            id="setup-files"
            type="file"
            multiple
            onChange={(event) => {
              void readFiles(event.target.files, 4)
                .then((attachments) => {
                  setDraft((current) => ({ ...current, attachments }));
                  setError(null);
                })
                .catch((err: Error) => setError(err.message));
            }}
          />
          {draft.attachments.length > 0 ? (
            <ul className="attachment-list">
              {draft.attachments.map((file) => (
                <li key={file.name}>{file.name}</li>
              ))}
            </ul>
          ) : null}
          <div className="form-actions">
            <button type="submit" className="vbs-plan-save" disabled={submitting}>
              {submitting ? "Saving…" : "Save setup"}
            </button>
            <button type="button" className="vbs-plan-save vbs-plan-save-danger" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <VbsFilterPanel
        programs={programs}
        publishers={publishers}
        extraYears={postYears}
        ariaLabel="Setup filters"
        value={{ yearFilter, publisherFilter, titleFilter }}
        onChange={(next) => {
          setYearFilter(next.yearFilter);
          setPublisherFilter(next.publisherFilter);
          setTitleFilter(next.titleFilter);
        }}
      />

      {error ? <p className="form-error">{error}</p> : null}

      {filtered.length === 0 ? (
        <p className="status">
          {posts.length === 0
            ? "No setup posts yet. Sample community posts load on server startup—try refreshing after a moment, or share your own setup."
            : "No setups match those filters. Set year to “All” or broaden publisher / VBS name."}
        </p>
      ) : (
        <div className="program-list">
          {groups.map((group) => (
            <section key={`${group.year}-${group.publisherName}-${group.title}`} className="program open">
              <header className="group-head">
                <h2>
                  {group.publisherName} · {group.year} · {group.title}
                </h2>
              </header>
              <ul className="entry-list">
                {group.posts.map((post) => {
                  const open = !collapsedIds.has(post.id);
                  return (
                    <li key={post.id} className={open ? "entry open" : "entry"}>
                      <button
                        type="button"
                        className="entry-summary"
                        aria-expanded={open}
                        onClick={() =>
                          setCollapsedIds((current) => {
                            const next = new Set(current);
                            if (open) {
                              next.add(post.id);
                            } else {
                              next.delete(post.id);
                            }
                            return next;
                          })
                        }
                      >
                        <div className="entry-meta">
                          <span className="author">{post.username}</span>
                          {post.verified ? <span className="badge">Verified</span> : null}
                          <span className="meta">{new Date(post.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="entry-preview">{previewText(post.body)}</p>
                      </button>
                      {open ? (
                        <div className="entry-body">
                          <p>{post.body}</p>
                          {post.pictures.length > 0 ? (
                            <div className="picture-grid">
                              {post.pictures.map((file) =>
                                file.dataUrl ? (
                                  <img
                                    key={file.name}
                                    src={file.dataUrl}
                                    alt={file.name.replace(/\.[^.]+$/, "").replace(/-/g, " ")}
                                  />
                                ) : (
                                  <span key={file.name}>{file.name}</span>
                                ),
                              )}
                            </div>
                          ) : null}
                          {post.videoUrl ? (
                            <p>
                              <a href={post.videoUrl} target="_blank" rel="noreferrer">
                                {post.videoUrl}
                              </a>
                            </p>
                          ) : null}
                          {post.attachments.length > 0 ? (
                            <ul className="attachment-list">
                              {post.attachments.map((file) => (
                                <li key={file.name}>
                                  {file.dataUrl ? (
                                    <a href={file.dataUrl} download={file.name}>
                                      {file.name}
                                    </a>
                                  ) : (
                                    file.name
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {user?.username === post.username ? (
                            <button type="button" className="ghost" onClick={() => void onDelete(post.id)}>
                              Delete
                            </button>
                          ) : null}
                          <div className="comment-block">
                            <h3>Comments</h3>
                            {post.comments.length === 0 ? <p className="muted">No comments yet.</p> : null}
                            <ul className="comment-list">
                              {post.comments.map((comment) => (
                                <li key={comment.id}>
                                  <div className="entry-meta">
                                    <span className="author">{comment.username}</span>
                                    {comment.verified ? <span className="badge">Verified</span> : null}
                                    <span className="meta">{new Date(comment.createdAt).toLocaleString()}</span>
                                    {user?.username === comment.username || user?.username === post.username ? (
                                      <button
                                        type="button"
                                        className="ghost"
                                        onClick={() => void onDeleteComment(comment.id, post.id)}
                                      >
                                        Delete
                                      </button>
                                    ) : null}
                                  </div>
                                  <p>{comment.body}</p>
                                </li>
                              ))}
                            </ul>
                            {canWrite ? (
                            <form className="comment-form" onSubmit={(event) => void onComment(post.id, event)}>
                              <label htmlFor={`comment-${post.id}`}>Add a comment</label>
                              <textarea
                                id={`comment-${post.id}`}
                                rows={2}
                                value={commentDrafts[post.id] ?? ""}
                                onChange={(event) =>
                                  setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))
                                }
                                required
                              />
                              <button type="submit">Comment</button>
                            </form>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </OrgWorkspacePage>
  );
}
