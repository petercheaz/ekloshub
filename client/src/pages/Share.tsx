import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { OrgBanner, useOrgs } from "../orgs";
import type { Publisher, ShareAttachment, ShareListing, ShareProgram } from "../types";

const PREVIEW_CHARS = 180;
const emptyDraft = {
  publisherId: "",
  title: "",
  item: "",
  details: "",
  availableOn: "",
  contact: "",
  location: "",
  videoUrl: "",
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

function formatAvailable(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${month}/${day}/${year}`;
}

async function readAttachments(files: FileList | null): Promise<ShareAttachment[]> {
  if (!files?.length) {
    return [];
  }
  const selected = [...files].slice(0, 4);
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

export default function SharePage() {
  const { tenantId, canWrite } = useOrgs();
  const [listings, setListings] = useState<ShareListing[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [programs, setPrograms] = useState<ShareProgram[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [yearFilter, setYearFilter] = useState("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [titleFilter, setTitleFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    api
      .shares()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setListings(payload.listings);
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
    () => [...new Set([...listings.map((listing) => listing.year), ...programs.map((program) => program.year)])].sort((a, b) => b - a),
    [listings, programs],
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
      listings.filter((listing) => {
        if (yearFilter !== "all" && String(listing.year) !== yearFilter) {
          return false;
        }
        if (publisherFilter !== "all" && listing.publisherId !== publisherFilter) {
          return false;
        }
        if (titleFilter !== "all" && listing.title !== titleFilter) {
          return false;
        }
        return true;
      }),
    [listings, yearFilter, publisherFilter, titleFilter],
  );

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { year: number; publisherName: string; title: string; listings: ShareListing[] }
    >();
    for (const listing of filtered) {
      const key = `${listing.year}|${listing.publisherId}|${listing.title}`;
      const existing = map.get(key);
      if (existing) {
        existing.listings.push(listing);
      } else {
        map.set(key, {
          year: listing.year,
          publisherName: listing.publisherName,
          title: listing.title,
          listings: [listing],
        });
      }
    }
    return [...map.values()].map((group) => ({
      ...group,
      listings: [...group.listings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
  }, [filtered]);

  function closeForm() {
    setShowForm(false);
    setDraft({
      ...emptyDraft,
      publisherId: publishers[0]?.id ?? "",
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const program = programs.find((item) => item.theme === draft.title && item.publisherId === draft.publisherId);
    if (!draft.availableOn || !draft.publisherId || !draft.title || !program) {
      setError("Available date, publisher, and VBS name are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const listing = await api.addShare({
        ...draft,
        year: program.year,
      });
      setListings((current) =>
        [...current, listing].sort((a, b) => {
          if (a.year !== b.year) {
            return b.year - a.year;
          }
          const publisherCompare = a.publisherName.localeCompare(b.publisherName);
          if (publisherCompare !== 0) {
            return publisherCompare;
          }
          const titleCompare = a.title.localeCompare(b.title);
          if (titleCompare !== 0) {
            return titleCompare;
          }
          return b.createdAt.localeCompare(a.createdAt);
        }),
      );
      closeForm();
      setYearFilter(String(listing.year));
      setPublisherFilter("all");
      setTitleFilter("all");
      setOpenId(listing.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save listing");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) {
    return <p className="status">Loading shared resources…</p>;
  }

  return (
    <div className="reviews">
      <header className="page-head">
        <p className="eyebrow">Give leftover kits a second church</p>
        <h1>Share VBS Resources</h1>
        <OrgBanner />
        <p className="tagline">List items you are willing to gift. Filter by year, publisher, or VBS name.</p>
        {canWrite ? (
          <button type="button" className="ghost" onClick={() => setShowForm(true)}>
            Add a share item
          </button>
        ) : null}
      </header>

      {showForm ? (
        <form className="review-form share-form" onSubmit={(event) => void onSubmit(event)}>
          <h3>New share item</h3>
          <label htmlFor="share-date">Available (mm/dd/yyyy)</label>
          <div className="date-input">
            <input
              id="share-date"
              type="date"
              value={draft.availableOn}
              onChange={(event) => setDraft({ ...draft, availableOn: event.target.value })}
              required
            />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm13 8H4v10h16V10Z"
              />
            </svg>
          </div>
          <label htmlFor="share-publisher">Publisher</label>
          <select
            id="share-publisher"
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
          <label htmlFor="share-title">VBS name</label>
          <select
            id="share-title"
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
          <label htmlFor="share-item">What you can gift</label>
          <input
            id="share-item"
            value={draft.item}
            onChange={(event) => setDraft({ ...draft, item: event.target.value })}
          />
          <label htmlFor="share-details">Details</label>
          <textarea
            id="share-details"
            rows={4}
            value={draft.details}
            onChange={(event) => setDraft({ ...draft, details: event.target.value })}
          />
          <label htmlFor="share-location">Location</label>
          <input
            id="share-location"
            value={draft.location}
            onChange={(event) => setDraft({ ...draft, location: event.target.value })}
          />
          <label htmlFor="share-contact">Contact</label>
          <input
            id="share-contact"
            value={draft.contact}
            onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
          />
          <label htmlFor="share-video">Video URL</label>
          <input
            id="share-video"
            type="url"
            placeholder="https://"
            value={draft.videoUrl}
            onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
          />
          <label htmlFor="share-files">Attachments</label>
          <input
            id="share-files"
            type="file"
            multiple
            onChange={(event) => {
              void readAttachments(event.target.files)
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

      <section className="filters" aria-label="Share filters">
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
        <p className="status">No listings match those filters.</p>
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
                {group.listings.map((listing) => {
                  const open = openId === listing.id;
                  const preview = previewText([listing.item, listing.details].filter(Boolean).join(" — "));
                  return (
                    <li key={listing.id} className={open ? "entry open" : "entry"}>
                      <button
                        type="button"
                        className="entry-summary"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : listing.id)}
                      >
                        <div className="entry-meta">
                          <span className="author">{listing.username}</span>
                          {listing.verified ? <span className="badge">Verified</span> : null}
                          <span className="available-date">Available {formatAvailable(listing.availableOn)}</span>
                        </div>
                        {preview ? <p className="entry-preview">{preview}</p> : null}
                      </button>
                      {open ? (
                        <div className="entry-body">
                          {listing.details ? <p>{listing.details}</p> : null}
                          {listing.location ? (
                            <div className="score">
                              <div className="score-head">
                                <span>Location</span>
                              </div>
                              <p>{listing.location}</p>
                            </div>
                          ) : null}
                          {listing.contact ? (
                            <div className="score">
                              <div className="score-head">
                                <span>Contact</span>
                              </div>
                              <p>{listing.contact}</p>
                            </div>
                          ) : null}
                          {listing.videoUrl ? (
                            <div className="score">
                              <div className="score-head">
                                <span>Video</span>
                              </div>
                              <p>
                                <a href={listing.videoUrl} target="_blank" rel="noreferrer">
                                  {listing.videoUrl}
                                </a>
                              </p>
                            </div>
                          ) : null}
                          {listing.attachments.length > 0 ? (
                            <div className="score">
                              <div className="score-head">
                                <span>Attachments</span>
                              </div>
                              <ul className="attachment-list">
                                {listing.attachments.map((file) => (
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
                            </div>
                          ) : null}
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
