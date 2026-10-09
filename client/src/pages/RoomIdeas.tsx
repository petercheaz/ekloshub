import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { completeListToken, currentListToken, splitListTokens } from "../listInput";
import { OrgBanner } from "../orgs";
import type { OrgTeam, Publisher, RoomIdea, RoomIdeaImage, ShareProgram, UserSuggestion } from "../types";

const emptySlots: Array<RoomIdeaImage | null> = [null, null, null];

async function readImage(file: File) {
  if (file.size > 4_000_000) {
    throw new Error(`${file.name} is over 4 MB`);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function RoomIdeasPage() {
  const { orgId = "" } = useParams();
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [programs, setPrograms] = useState<ShareProgram[]>([]);
  const [ideas, setIdeas] = useState<RoomIdea[]>([]);
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [publisherId, setPublisherId] = useState("");
  const [year, setYear] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceImage, setSourceImage] = useState("");
  const [slots, setSlots] = useState<Array<RoomIdeaImage | null>>(emptySlots);
  const [saved, setSaved] = useState<RoomIdea | null>(null);
  const [shareTeams, setShareTeams] = useState<string[]>([]);
  const [shareUsers, setShareUsers] = useState("");
  const [userHits, setUserHits] = useState<UserSuggestion[]>([]);
  const [publicSetup, setPublicSetup] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.roomIdeas(orgId), api.organization(orgId)])
      .then(([options, org]) => {
        if (cancelled) {
          return;
        }
        setPublishers(options.publishers);
        setPrograms(options.programs);
        setIdeas(options.ideas);
        setTeams(org.teams ?? []);
        setYear((current) => current || String(options.defaultYear));
        setPublisherId((current) => current || options.publishers[0]?.id || "");
        setError("");
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
  }, [orgId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = currentListToken(shareUsers);
      if (!query) {
        setUserHits([]);
        return;
      }
      const taken = new Set(splitListTokens(shareUsers).map((item) => item.toLowerCase()));
      void api
        .searchUsers(query)
        .then((hits) =>
          setUserHits(hits.filter((hit) => !taken.has(hit.username.toLowerCase())).slice(0, 8)),
        )
        .catch(() => setUserHits([]));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [shareUsers]);

  const years = useMemo(() => [...new Set(programs.map((program) => program.year))].sort((a, b) => b - a), [programs]);
  const titles = useMemo(
    () =>
      programs.filter(
        (program) =>
          (!publisherId || program.publisherId === publisherId) && (!year || program.year === Number(year)),
      ),
    [programs, publisherId, year],
  );
  function resetForm() {
    setNotes("");
    setSourceImage("");
    setSlots(emptySlots);
    setSaved(null);
    setShareTeams([]);
    setShareUsers("");
    setPublicSetup(false);
    setStatus("");
    setError("");
    setBusy("");
  }

  async function generate(count: number, replaceIndex?: number) {
    if (!sourceImage || !publisherId || !year || !title) {
      setError("Publisher, year, VBS title, and a room picture are required");
      return;
    }
    setBusy(replaceIndex === undefined ? "Generating three pictures…" : "Regenerating…");
    setError("");
    try {
      const result = await api.generateRoomIdeas(orgId, {
        publisherId,
        year: Number(year),
        title,
        notes,
        sourceImage,
        count,
      });
      setSlots((current) => {
        const next = [...current];
        if (replaceIndex !== undefined) {
          next[replaceIndex] = result.images[0] ?? null;
          return next;
        }
        return [result.images[0] ?? null, result.images[1] ?? null, result.images[2] ?? null];
      });
      setSaved(null);
      setStatus("Generated. Discard any you do not like, then regenerate or save.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate pictures");
    } finally {
      setBusy("");
    }
  }

  async function onSave() {
    const images = slots.filter((slot): slot is RoomIdeaImage => Boolean(slot));
    if (!sourceImage || images.length === 0) {
      setError("Generate pictures before saving");
      return;
    }
    setBusy("Saving…");
    setError("");
    try {
      const idea = await api.saveRoomIdea(orgId, {
        publisherId,
        year: Number(year),
        title,
        notes,
        sourceImage,
        imageKeys: images.map((image) => image.key),
      });
      setSaved(idea);
      setIdeas((current) => [idea, ...current.filter((item) => item.id !== idea.id)]);
      setStatus("Saved. Share it or cancel to start over.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy("");
    }
  }

  async function onShare(event: FormEvent) {
    event.preventDefault();
    if (!saved) {
      setError("Save the room idea before sharing");
      return;
    }
    setBusy("Sharing…");
    setError("");
    try {
      await api.shareRoomIdea(orgId, saved.id, {
        teamIds: shareTeams,
        usernames: shareUsers,
        publicSetup,
      });
      setStatus("Shared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share");
    } finally {
      setBusy("");
    }
  }

  if (!loaded) {
    return <p className="status">Loading room ideas…</p>;
  }

  const kept = slots.filter((slot): slot is RoomIdeaImage => Boolean(slot));
  const publisherName = publishers.find((item) => item.id === publisherId)?.name ?? publisherId;

  return (
    <div className="reviews">
      <header className="page-head">
        <p className="eyebrow">Organization</p>
        <h1>Room Ideas</h1>
        <OrgBanner />
        <p className="tagline">
          Upload a room or wall. The model reads room_ideas.txt plus your notes and dresses the space for that VBS
          theme.
        </p>
      </header>

      <form
        className="review-form share-form"
        onSubmit={(event) => {
          event.preventDefault();
          void generate(3);
        }}
      >
        <label htmlFor="room-publisher">Publisher</label>
        <select
          id="room-publisher"
          value={publisherId}
          onChange={(event) => {
            setPublisherId(event.target.value);
            setTitle("");
          }}
          required
        >
          <option value="">Select publisher</option>
          {publishers.map((publisher) => (
            <option key={publisher.id} value={publisher.id}>
              {publisher.name}
            </option>
          ))}
        </select>
        <label htmlFor="room-year">Year</label>
        <select
          id="room-year"
          value={year}
          onChange={(event) => {
            setYear(event.target.value);
            setTitle("");
          }}
          required
        >
          <option value="">Select year</option>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label htmlFor="room-title">VBS title</label>
        <select id="room-title" value={title} onChange={(event) => setTitle(event.target.value)} required>
          <option value="">Select VBS title</option>
          {titles.map((program) => (
            <option key={program.id} value={program.theme}>
              {program.theme}
            </option>
          ))}
        </select>
        <label htmlFor="room-photo">Room or wall picture</label>
        <input
          id="room-photo"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            void readImage(file)
              .then((dataUrl) => {
                setSourceImage(dataUrl);
                setSlots(emptySlots);
                setSaved(null);
                setError("");
              })
              .catch((err: Error) => setError(err.message));
          }}
          required={!sourceImage}
        />
        {sourceImage ? <img className="room-source" src={sourceImage} alt="Uploaded room" /> : null}
        <label htmlFor="room-notes">Notes for the model</label>
        <textarea
          id="room-notes"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Example: decorate the back wall and leave the doorway clear"
        />
        <div className="form-actions">
          <button type="submit" disabled={Boolean(busy)}>
            {busy || "Generate 3 pictures"}
          </button>
          <button type="button" className="ghost" onClick={resetForm} disabled={Boolean(busy)}>
            Cancel
          </button>
        </div>
      </form>

      {kept.length > 0 ? (
        <section className="room-compose" aria-label="Generated room ideas">
          <div className="room-pictures">
            {slots.slice(0, 2).map((slot, index) =>
              slot ? (
                <figure key={slot.key} className="room-card">
                  <img src={slot.url} alt={`Room idea ${index + 1}`} />
                  <button type="button" className="room-discard" aria-label="Discard picture" onClick={() => setSlots((current) => current.map((item, i) => (i === index ? null : item)))}>
                    ×
                  </button>
                  <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void generate(1, index)}>
                    Regenerate
                  </button>
                </figure>
              ) : (
                <div key={`empty-top-${index}`} className="room-empty">
                  <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void generate(1, index)}>
                    Regenerate
                  </button>
                </div>
              ),
            )}
          </div>
          <div className="room-copy">
            <p className="eyebrow">
              {publisherName} · {year} · {title}
            </p>
            <p>{notes.trim() || "No extra notes. Decorations follow the VBS theme."}</p>
          </div>
          <div className="room-pictures">
            {slots[2] ? (
              <figure className="room-card">
                <img src={slots[2].url} alt="Room idea 3" />
                <button type="button" className="room-discard" aria-label="Discard picture" onClick={() => setSlots((current) => [current[0], current[1], null])}>
                  ×
                </button>
                <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void generate(1, 2)}>
                  Regenerate
                </button>
              </figure>
            ) : (
              <div className="room-empty">
                <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void generate(1, 2)}>
                  Regenerate
                </button>
              </div>
            )}
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => void onSave()} disabled={Boolean(busy) || Boolean(saved)}>
              {saved ? "Saved" : "Save"}
            </button>
            <button type="button" className="ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {saved ? (
        <form className="review-form share-form" onSubmit={(event) => void onShare(event)}>
          <h3>Share</h3>
          <fieldset className="share-targets">
            <legend>Teams</legend>
            {teams.length === 0 ? <p className="muted">No teams in this organization.</p> : null}
            {teams.map((team) => (
              <label key={team.id} className="check-row">
                <input
                  type="checkbox"
                  checked={shareTeams.includes(team.id)}
                  onChange={(event) =>
                    setShareTeams((current) =>
                      event.target.checked ? [...current, team.id] : current.filter((id) => id !== team.id),
                    )
                  }
                />
                {team.name}
              </label>
            ))}
          </fieldset>
          <label htmlFor="room-share-users">Individuals (comma or semicolon)</label>
          <input
            id="room-share-users"
            value={shareUsers}
            onChange={(event) => setShareUsers(event.target.value)}
            placeholder="maria.santos; lily.chen"
            autoComplete="off"
          />
          {userHits.length > 0 ? (
            <ul className="autocomplete">
              {userHits.map((hit) => (
                <li key={hit.username}>
                  <button type="button" onClick={() => setShareUsers(completeListToken(shareUsers, hit.username))}>
                    {hit.username}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="check-row">
            <input type="checkbox" checked={publicSetup} onChange={(event) => setPublicSetup(event.target.checked)} />
            Also post on public Show Your Setup
          </label>
          <button type="submit" disabled={Boolean(busy)}>
            Share
          </button>
        </form>
      ) : null}

      {status ? <p className="tagline">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {ideas.length > 0 ? (
        <section className="org-members">
          <h2>Saved ideas</h2>
          <ul className="entry-list">
            {ideas.map((idea) => (
              <li key={idea.id} className="entry">
                <div className="entry-meta">
                  <span className="author">{idea.title}</span>
                  <span className="badge">
                    {idea.publisherName} {idea.year}
                  </span>
                </div>
                <p className="entry-preview">{idea.notes || "Theme decorations"}</p>
                <div className="picture-grid">
                  {idea.images.map((image) => (
                    <img key={image.key} src={image.url} alt="" />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
