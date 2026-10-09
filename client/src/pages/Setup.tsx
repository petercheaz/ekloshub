import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { OrgBanner, useOrgs } from "../orgs";
import { useAuth } from "../auth";
import type { Publisher, ShareAttachment, ShareProgram, SetupPost } from "../types";

const PREVIEW_CHARS = 180;
const emptyDraft = {
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
          if (file.size > 1_000_000) {
            reject(new Error(`${file.name} is over 1 MB`));
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
        setYearFilter(String(payload.defaultYear));
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

  const years = useMemo(
    () => [...new Set([...posts.map((post) => post.year), ...programs.map((program) => program.year)])].sort((a, b) => b - a),
    [posts, programs],
  );
  const titles = useMemo(
    () => [...new Set(programs.map((program) => program.theme))].sort((a, b) => a.localeCompare(b)),
    [programs],
  );
  const formPrograms = useMemo(
    () => programs.filter((program) => !draft.publisherId || program.publisherId === draft.publisherId),
    [programs, draft.publisherId],
  );
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
    const program = programs.find((item) => item.theme === draft.title && item.publisherId === draft.publisherId);
    if (!draft.publisherId || !draft.title || !draft.body.trim() || !program) {
      setError("Publisher, VBS name, and text are required");
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
    <div className="reviews">
      <header className="page-head">
        <p className="eyebrow">Rooms, hallways, and stations</p>
        <h1>Show Your Setup</h1>
        <OrgBanner />
        <p className="tagline">Post photos, notes, and video of how you decorated. Comment on other churches’ setups.</p>
        {canWrite ? (
          <button type="button" className="ghost" onClick={() => setShowForm(true)}>
            Add an entry
          </button>
        ) : null}
      </header>

      {showForm ? (
        <form className="review-form share-form" onSubmit={(event) => void onSubmit(event)}>
          <h3>New setup</h3>
          <label htmlFor="setup-publisher">Publisher</label>
          <select
            id="setup-publisher"
            value={draft.publisherId}
            onChange={(event) => setDraft({ ...draft, publisherId: event.target.value, title: "" })}
            required
          >
            <option value="">Select publisher</option>
            {publishers.map((publisher) => (
              <option key={publisher.id} value={publisher.id}>
                {publisher.name}
              </option>
            ))}
          </select>
          <label htmlFor="setup-title">VBS name</label>
          <select
            id="setup-title"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            required
          >
            <option value="">Select VBS name</option>
            {formPrograms.map((program) => (
              <option key={program.id} value={program.theme}>
                {program.theme} ({program.year})
              </option>
            ))}
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
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </button>
            <button type="button" className="ghost" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <section className="filters" aria-label="Setup filters">
        <fieldset>
          <legend>Year</legend>
          <label className="filter-select">
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="all">All years</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Publisher</legend>
          <label className="filter-select">
            <select value={publisherFilter} onChange={(event) => setPublisherFilter(event.target.value)}>
              <option value="all">All publishers</option>
              {publishers.map((publisher) => (
                <option key={publisher.id} value={publisher.id}>
                  {publisher.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>VBS curriculum name</legend>
          <label className="filter-select">
            <select value={titleFilter} onChange={(event) => setTitleFilter(event.target.value)}>
              <option value="all">All VBS names</option>
              {titles.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      {filtered.length === 0 ? (
        <p className="status">No setups match those filters.</p>
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
    </div>
  );
}
