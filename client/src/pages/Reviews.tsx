import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { OrgBanner, useOrgs } from "../orgs";
import type { CurriculumPayload, Program, Review } from "../types";
import AddReviewForm from "./AddReviewForm";

function previewText(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 180) {
    return trimmed;
  }
  return `${trimmed.slice(0, 180).trimEnd()}…`;
}

function reviewTotal(review: Review) {
  return review.biblicalTeaching + review.merchHelp + review.fun;
}

function verifiedRank(reviews: Review[]) {
  const verified = reviews.filter((review) => review.verified);
  if (verified.length === 0) {
    return null;
  }
  const sum = verified.reduce((total, review) => total + reviewTotal(review), 0);
  const max = verified.length * 15;
  return {
    count: verified.length,
    outOf15: sum / verified.length,
    ratio: sum / max,
  };
}

function Stars({ ratio }: { ratio: number }) {
  const percent = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <span className="stars" aria-hidden="true">
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fill" style={{ width: `${percent}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

function Score({ label, value, notes }: { label: string; value: number; notes: string }) {
  return (
    <div className="score">
      <div className="score-head">
        <span>{label}</span>
        <strong>{value}/5</strong>
      </div>
      {notes ? <p>{notes}</p> : null}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="review">
      <header>
        <span className="author">{review.username}</span>
        {review.verified ? <span className="badge">Verified</span> : null}
      </header>
      <p className="lead">{review.whatPeopleSay}</p>
      <Score label="Biblical teaching" value={review.biblicalTeaching} notes={review.biblicalTeachingNotes} />
      <Score
        label="T-shirts & decorations"
        value={review.merchHelp}
        notes={review.merchHelpNotes}
      />
      <Score label="Fun" value={review.fun} notes={review.funNotes} />
      <div className="score">
        <div className="score-head">
          <span>Top criticisms</span>
        </div>
        <p>{review.criticisms}</p>
      </div>
      <div className="score">
        <div className="score-head">
          <span>Cost</span>
        </div>
        <p>{review.cost}</p>
      </div>
    </article>
  );
}

export default function ReviewsPage() {
  const { tenantId, canWrite } = useOrgs();
  const [year, setYear] = useState<number | null>(null);
  const [selectedPublishers, setSelectedPublishers] = useState<string[] | null>(null);
  const [data, setData] = useState<CurriculumPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .curriculum(year, selectedPublishers)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        setYear((current) => current ?? payload.defaultYear);
        setSelectedPublishers((current) => current ?? payload.publishers.map((publisher) => publisher.id));
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [year, selectedPublishers, tenantId]);

  useEffect(() => {
    setOpenReviewId(null);
  }, [year, selectedPublishers, tenantId]);

  const allSelected = useMemo(() => {
    if (!data || !selectedPublishers) {
      return true;
    }
    return data.publishers.every((publisher) => selectedPublishers.includes(publisher.id));
  }, [data, selectedPublishers]);

  function toggleAll(checked: boolean) {
    if (!data) {
      return;
    }
    setSelectedPublishers(checked ? data.publishers.map((publisher) => publisher.id) : []);
  }

  function togglePublisher(id: string, checked: boolean) {
    setSelectedPublishers((current) => {
      const next = new Set(current ?? []);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return [...next];
    });
  }

  function addReviewToProgram(programId: string, review: Review) {
    setData((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        programs: current.programs.map((program) =>
          program.id === programId
            ? {
                ...program,
                reviews: [...program.reviews, review].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
              }
            : program,
        ),
      };
    });
    setOpenReviewId(review.id);
  }

  if (error) {
    return <p className="status">{error}</p>;
  }

  if (!data || year === null || selectedPublishers === null) {
    return <p className="status">Loading curriculum reviews…</p>;
  }

  return (
    <div className="reviews">
      <header className="page-head">
        <p className="eyebrow">VBS curriculum</p>
        <h1>Curriculum Reviews</h1>
        <OrgBanner />
        <p className="tagline">
          Compare publishers by year. After September 1, this page defaults to next year’s programs.
        </p>
      </header>

      <section className="filters" aria-label="Review filters">
        <fieldset>
          <legend>Year</legend>
          <div className="chips">
            {data.years.map((option) => (
              <label key={option} className={option === year ? "chip selected" : "chip"}>
                <input
                  type="radio"
                  name="year"
                  checked={option === year}
                  onChange={() => setYear(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Publisher</legend>
          <div className="checks">
            <label>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => toggleAll(event.target.checked)}
              />
              All
            </label>
            {data.publishers.map((publisher) => (
              <label key={publisher.id}>
                <input
                  type="checkbox"
                  checked={selectedPublishers.includes(publisher.id)}
                  onChange={(event) => togglePublisher(publisher.id, event.target.checked)}
                />
                {publisher.name}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {data.programs.length === 0 ? (
        <p className="status">No curriculum matches those filters.</p>
      ) : (
        <div className="program-list">
          {data.programs.map((program: Program) => {
            const rank = verifiedRank(program.reviews);
            return (
              <section key={program.id} className="program open">
                <header className="group-head">
                  <h2>
                    {program.publisherName} · {program.year} · {program.theme}
                  </h2>
                  <div className="rank">
                    {rank ? (
                      <>
                        <strong>{rank.outOf15.toFixed(1)} / 15</strong>
                        <Stars ratio={rank.ratio} />
                        <span className="meta">{rank.count} verified</span>
                      </>
                    ) : (
                      <span className="meta">No verified rank</span>
                    )}
                  </div>
                </header>
                <ul className="entry-list">
                  {program.reviews.map((review) => {
                    const open = openReviewId === review.id;
                    return (
                      <li key={review.id} className={open ? "entry open" : "entry"}>
                        <button
                          type="button"
                          className="entry-summary"
                          aria-expanded={open}
                          onClick={() => setOpenReviewId(open ? null : review.id)}
                        >
                          <div className="entry-meta">
                            <span className="author">{review.username}</span>
                            {review.verified ? <span className="badge">Verified</span> : null}
                          </div>
                          <p className="entry-preview">{previewText(review.whatPeopleSay)}</p>
                        </button>
                        {open ? <ReviewCard review={review} /> : null}
                      </li>
                    );
                  })}
                </ul>
                {canWrite ? (
                  <div className="program-body">
                    <AddReviewForm
                      programId={program.id}
                      onCreated={(review) => addReviewToProgram(program.id, review)}
                    />
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
