/**
 * FR-7: reviews are scored on separate aspects using a 1-5 Likert scale.
 * overall number. These small components render/collect that breakdown
 * consistently everywhere it shows up (review form, review card, profile).
 */

export const DETAIL_RATING_FIELDS = [
  "workload",
  "content",
  "teaching",
  "exam",
];
export const RATING_FIELDS = [
  "satisfaction",
  "difficulty",
  "workload",
  "content",
  "teaching",
  "exam",
];

export const RATING_LABELS = {
  satisfaction: "ความพึงพอใจกับรายวิชานี้",
  difficulty: "ความต้อาการแนะนำรายวิชานี้ให้กับนักศึกษาคนอื่น",
  workload: "งานและการบ้านของรายวิชานี้มีความเหมาะสม",
  content: "เนื้อหาและสื่อการสอนของรายวิชานี้มีคุณภาพ",
  teaching: "อาจารย์อธิบายเนื้อหาได้เข้าใจง่าย",
  exam: "การสอบและการให้คะแนนมีความเหมาะสมและยุติธรรม",
};

export const DIFFICULTY_OPTIONS = [
  { value: 1, label: "ง่ายมาก" },
  { value: 2, label: "ง่าย" },
  { value: 3, label: "ปานกลาง" },
  { value: 4, label: "ยาก" },
  { value: 5, label: "ยากมาก" },
];
export function recommendationLabel(score) {
  const n = Number(score) || 0;

  if (n <= 1.8) return "ไม่แนะนำอย่างยิ่ง";
  if (n <= 2.6) return "ไม่แนะนำ";
  if (n <= 3.4) return "ปานกลาง";
  if (n <= 4.2) return "แนะนำ";
  return "แนะนำอย่างยิ่ง";
}

export function satisfactionLabel(score) {
  const n = Number(score) || 0;

  if (n <= 1.8) return "พึงพอใจต่ำมาก";
  if (n <= 2.6) return "พึงพอใจต่ำ";
  if (n <= 3.4) return "ปานกลาง";
  if (n <= 4.2) return "พึงพอใจสูง";
  return "พึงพอใจสูงมาก";
}

export function difficultyLabel(score) {
  const n = Number(score) || 0;

  if (n <= 1.8) return "ง่ายมาก";
  if (n <= 2.6) return "ง่าย";
  if (n <= 3.4) return "ปานกลาง";
  if (n <= 4.2) return "ยาก";
  return "ยากมาก";
}  

export function defaultRatings(source = 3) {
  return RATING_FIELDS.reduce((acc, f) => ({ ...acc, [f]: source }), {});
}

/** Read the Likert `rating_*` columns from a review row. */
export function ratingsFromReview(review) {
  return {
    satisfaction: Number(review.rating_satisfaction),
    skill: Number(review.rating_skill),
    workload: Number(review.rating_workload),
    content: Number(review.rating_content),
    teaching: Number(review.rating_teaching),
    exam: Number(review.rating_exam),
    recommendation: Number(review.rating_recommendation),
  };
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
      {DETAIL_RATING_FIELDS.map((f) => {
        const score = Number(ratings[f]) || 0;

        return (
          <div className="rating-row" key={f}>
            <span className="rating-label">
              {RATING_LABELS[f]}
            </span>

            <div className="rating-score">
              <StarDisplay value={Math.round(score)} />

              <strong>
                {score.toFixed(1)}
              </strong>
            </div>
          </div>
        );
      })}
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
export const LIKERT_OPTIONS = [
  { value: 1, label: "ไม่เห็นด้วยอย่างยิ่ง" },
  { value: 2, label: "ไม่เห็นด้วย" },
  { value: 3, label: "ปานกลาง" },
  { value: 4, label: "เห็นด้วย" },
  { value: 5, label: "เห็นด้วยอย่างยิ่ง" },
];

export function LikertInput({ label, value, onChange }) {
  return (
    <div className="likert-question">
      <div className="likert-question-title">{label}</div>

      <div className="likert-options">
        {LIKERT_OPTIONS.map((option) => (
          <label
            className={`likert-option ${
              value === option.value ? "likert-option-selected" : ""
            }`}
            key={option.value}
          >
            <input
              type="radio"
              name={label}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />

            <span className="likert-circle" />

            <span className="likert-value">
              {option.value}
            </span>

            <span className="likert-text">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function LikertForm({ ratings, onChange }) {
  return (
    <div className="likert-form">
      {RATING_FIELDS.map((field) => (
        <LikertInput
          key={field}
          label={RATING_LABELS[field]}
          value={ratings[field]}
          onChange={(value) =>
            onChange({
              ...ratings,
              [field]: value,
            })
          }
        />
      ))}
    </div>
  );
}
