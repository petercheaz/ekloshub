import { FormEvent, useState } from "react";
import { api } from "../api";
import type { Review, ReviewDraft } from "../types";

const empty = {
  whatPeopleSay: "",
  biblicalTeaching: 4,
  biblicalTeachingNotes: "",
  merchHelp: 4,
  merchHelpNotes: "",
  fun: 4,
  funNotes: "",
  criticisms: "",
  cost: "",
};

export default function AddReviewForm({
  programId,
  onCreated,
}: {
  programId: string;
  onCreated: (review: Review) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: ReviewDraft = { programId, ...draft };
    try {
      const review = await api.addReview(payload);
      onCreated(review);
      setDraft(empty);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ghost" onClick={() => setOpen(true)}>
        Add your review
      </button>
    );
  }

  return (
    <form className="review-form" onSubmit={onSubmit}>
      <h3>Add your review</h3>
      <label htmlFor={`${programId}-say`}>What people say / your take</label>
      <textarea
        id={`${programId}-say`}
        value={draft.whatPeopleSay}
        onChange={(event) => update("whatPeopleSay", event.target.value)}
        required
        rows={4}
      />
      <div className="score-row">
        <label htmlFor={`${programId}-bible`}>Biblical teaching (1–5)</label>
        <input
          id={`${programId}-bible`}
          type="number"
          min={1}
          max={5}
          value={draft.biblicalTeaching}
          onChange={(event) => update("biblicalTeaching", Number(event.target.value))}
          required
        />
      </div>
      <textarea
        value={draft.biblicalTeachingNotes}
        onChange={(event) => update("biblicalTeachingNotes", event.target.value)}
        placeholder="Notes on biblical teaching"
        rows={2}
      />
      <div className="score-row">
        <label htmlFor={`${programId}-merch`}>T-shirts & decorations help (1–5)</label>
        <input
          id={`${programId}-merch`}
          type="number"
          min={1}
          max={5}
          value={draft.merchHelp}
          onChange={(event) => update("merchHelp", Number(event.target.value))}
          required
        />
      </div>
      <textarea
        value={draft.merchHelpNotes}
        onChange={(event) => update("merchHelpNotes", event.target.value)}
        placeholder="How easy is it to buy shirts and décor?"
        rows={2}
      />
      <div className="score-row">
        <label htmlFor={`${programId}-fun`}>Fun (1–5)</label>
        <input
          id={`${programId}-fun`}
          type="number"
          min={1}
          max={5}
          value={draft.fun}
          onChange={(event) => update("fun", Number(event.target.value))}
          required
        />
      </div>
      <textarea
        value={draft.funNotes}
        onChange={(event) => update("funNotes", event.target.value)}
        placeholder="How fun did people find it?"
        rows={2}
      />
      <label htmlFor={`${programId}-crit`}>Top criticisms</label>
      <textarea
        id={`${programId}-crit`}
        value={draft.criticisms}
        onChange={(event) => update("criticisms", event.target.value)}
        required
        rows={3}
      />
      <label htmlFor={`${programId}-cost`}>How much it costs</label>
      <input
        id={`${programId}-cost`}
        value={draft.cost}
        onChange={(event) => update("cost", event.target.value)}
        required
      />
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Publish review"}
        </button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
