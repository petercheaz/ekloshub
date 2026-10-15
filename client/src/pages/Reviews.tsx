import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useOrgVbs } from "../org-vbs";
import { OrgWorkspacePage } from "../OrgWorkspacePage";
import { useOrgs } from "../orgs";
import { VbsFilterPanel } from "../VbsFilterPanel";
import { vbsPublisherOptions } from "../vbs-cascade";
import { applyVbsFilterDefault } from "../vbs-filters";
import type { CurriculumPayload, Program, Review } from "../types";
import AddReviewForm from "./AddReviewForm";
import { expandableRowHeaderProps } from "../expandable-row";

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

function reviewRating(review: Review) {
  const outOf15 = reviewTotal(review);
  return { outOf15, ratio: outOf15 / 15 };
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

function Stars({ ratio, compact }: { ratio: number; compact?: boolean }) {
  const percent = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <span className={compact ? "stars compact" : "stars"} aria-hidden="true">
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fill" style={{ width: `${percent}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

function ReviewRating({ review, compact }: { review: Review; compact?: boolean }) {
  const { outOf15, ratio } = reviewRating(review);
  return (
    <span className="review-rating" aria-label={`Overall rating ${outOf15.toFixed(1)} out of 15`}>
      <strong className="review-rating-score">{outOf15.toFixed(1)}/15</strong>
      <Stars ratio={ratio} compact={compact} />
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
        <ReviewRating review={review} />
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
  const {
    filterDefault,
    prefsReady,
    programs: catalogPrograms,
    publishers: catalogPublishers,
    defaultYear: prefsDefaultYear,
  } = useOrgVbs();
  const filtersBootstrapped = useRef(false);
  const [yearFilter, setYearFilter] = useState("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [titleFilter, setTitleFilter] = useState("all");
  const [siteDefaultYear, setSiteDefaultYear] = useState<number | null>(null);
  const [data, setData] = useState<CurriculumPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);

  useEffect(() => {
    filtersBootstrapped.current = false;
  }, [tenantId]);

  useEffect(() => {
    if (!prefsReady || filtersBootstrapped.current) {
      return;
    }
    filtersBootstrapped.current = true;
    const next = applyVbsFilterDefault(filterDefault, siteDefaultYear ?? prefsDefaultYear);
    setYearFilter(next.yearFilter);
    setPublisherFilter(next.publisherFilter);
    setTitleFilter(next.titleFilter);
  }, [prefsReady, filterDefault, siteDefaultYear, prefsDefaultYear]);

  const apiYear = useMemo(() => {
    if (yearFilter !== "all" && yearFilter !== "") {
      return Number(yearFilter);
    }
    return siteDefaultYear ?? prefsDefaultYear;
  }, [yearFilter, siteDefaultYear, prefsDefaultYear]);

  const publisherIds = useMemo(() => {
    if (publisherFilter !== "all" && publisherFilter !== "") {
      return [publisherFilter];
    }
    return vbsPublisherOptions(catalogPublishers, catalogPrograms, String(apiYear)).map((p) => p.id);
  }, [publisherFilter, catalogPublishers, catalogPrograms, apiYear]);

  useEffect(() => {
    let cancelled = false;
    api
      .curriculum(apiYear, publisherIds)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        setSiteDefaultYear((current) => current ?? payload.defaultYear);
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
  }, [apiYear, publisherIds, tenantId]);

  useEffect(() => {
    setOpenReviewId(null);
  }, [yearFilter, publisherFilter, titleFilter, tenantId]);

  const displayedPrograms = useMemo(() => {
    if (!data) {
      return [];
    }
    if (titleFilter === "all" || titleFilter === "") {
      return data.programs;
    }
    return data.programs.filter((program) => program.theme === titleFilter);
  }, [data, titleFilter]);

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

  if (!data || !prefsReady) {
    return <p className="status">Loading curriculum reviews…</p>;
  }

  return (
    <OrgWorkspacePage
      eyebrow="VBS curriculum"
      title="Curriculum Reviews"
      tagline="Compare publishers by year. After September 1, this page defaults to next year’s programs. Expand a review to read scores and notes."
    >
      <VbsFilterPanel
        programs={catalogPrograms}
        publishers={catalogPublishers}
        ariaLabel="Review filters"
        value={{ yearFilter, publisherFilter, titleFilter }}
        onChange={(next) => {
          setYearFilter(next.yearFilter);
          setPublisherFilter(next.publisherFilter);
          setTitleFilter(next.titleFilter);
        }}
      />

      {displayedPrograms.length === 0 ? (
        <p className="status">No curriculum matches those filters.</p>
      ) : (
        <div className="program-list">
          {displayedPrograms.map((program: Program) => {
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
                        <div
                          {...expandableRowHeaderProps(
                            open,
                            () => setOpenReviewId(open ? null : review.id),
                            "entry-row-header",
                          )}
                        >
                          <div className="entry-summary">
                            <div className="entry-meta">
                              <span className="author">{review.username}</span>
                              {review.verified ? <span className="badge">Verified</span> : null}
                              <ReviewRating review={review} compact />
                            </div>
                            <p className="entry-preview">{previewText(review.whatPeopleSay)}</p>
                          </div>
                        </div>
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
    </OrgWorkspacePage>
  );
}
