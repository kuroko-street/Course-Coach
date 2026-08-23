/**
 * FR-7: reviews are scored on six separate aspects (1-5 each) instead of one
 * overall number. These small components render/collect that breakdown
 * consistently everywhere it shows up (review form, review card, profile).
 */
export const RATING_FIELDS = [
  "satisfaction",
  "difficulty",
  "workload",
  "content",
  "teaching",
  "exam",
];

export const RATING_LABELS = {
  satisfaction: "ความพึงพอใจรวม",
  difficulty: "ความยากง่าย",
  workload: "ภาระงาน",
  content: "เนื้อหา",
  teaching: "การสอน",
  exam: "การสอบ",
};

export function defaultRatings(source = 3) {
  return RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f]: source }), {});
}

/** Read the six `rating_*` columns off a review row into a plain {field: n} map. */
export function ratingsFromReview(review) {
  return RATING_FIELDS.reduce(
    (acc, f) => ({ ...acc, [f]: Number(review[`rating_${f}`]) }),
    {}
  );
}

export function StarDisplay({ value }) {
  const n = Number(value) || 0;
  return (
    <span className="star-display" aria-label={`${n} / 5`}>
      {"★".repeat(n)}
      {"☆".repeat(Math.max(0, 5 - n))}
    </span>
  );
}

export function StarInput({ label, value, onChange }) {
  return (
    <div className="star-input">
      <label>{label}</label>
      <div className="star-row" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            className={`star-btn ${n <= value ? "star-filled" : ""}`}
            onClick={() => onChange(n)}
            aria-pressed={n === value}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

/** Compact read-only grid of all six aspects, e.g. on a review card. */
export function RatingBreakdown({ ratings }) {
  return (
    <div className="rating-breakdown">
      {RATING_FIELDS.map((f) => (
        <div className="rating-row" key={f}>
          <span className="rating-label">{RATING_LABELS[f]}</span>
          <StarDisplay value={ratings[f]} />
        </div>
      ))}
    </div>
  );
}

/** Editable grid of all six aspects, e.g. in the write/edit review form. */
export function RatingForm({ ratings, onChange }) {
  return (
    <div className="rating-form-grid">
      {RATING_FIELDS.map((f) => (
        <StarInput
          key={f}
          label={RATING_LABELS[f]}
          value={ratings[f]}
          onChange={(n) => onChange({ ...ratings, [f]: n })}
        />
      ))}
    </div>
  );
}
